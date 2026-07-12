import os
import time
import base64
import uuid
import ipaddress
from collections import defaultdict
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from urllib.parse import urlparse

from dotenv import load_dotenv
load_dotenv()

import requests
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

# =========================
# Firebase Setup
# =========================
import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth, storage as fb_storage
from google.cloud.firestore_v1.base_query import FieldFilter

FIREBASE_CREDS = os.getenv("FIREBASE_CREDENTIALS", "firebase-credentials.json")
FIREBASE_BUCKET_NAME = os.getenv("APP_STORAGE_BUCKET", "") 

firebase_app = None
db = None
storage_bucket = None

try:
    options = {}
    if FIREBASE_BUCKET_NAME:
        options['storageBucket'] = FIREBASE_BUCKET_NAME.replace("gs://", "")
    
    # If we are in Google Cloud Functions/Run, we don't need the local JSON credentials.
    # We can just initialize without credentials to use Application Default Credentials.
    if os.getenv("K_SERVICE") or os.getenv("FUNCTION_NAME") or os.getenv("FUNCTIONS_WORKER_RUNTIME"):
        firebase_app = firebase_admin.initialize_app(options=options)
    else:
        cred = credentials.Certificate(FIREBASE_CREDS)
        firebase_app = firebase_admin.initialize_app(cred, options)
        
    db = firestore.client()
    if FIREBASE_BUCKET_NAME:
        storage_bucket = fb_storage.bucket()
    print(" Firebase initialized successfully")
except Exception as e:
    print(f" Firebase initialization failed: {e}")

ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("ADMIN_EMAILS", "").split(",")
    if email.strip()
}

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
SUBSCRIBE_TEST_MODE = os.getenv("SUBSCRIBE_TEST_MODE", "false").lower() in ("1", "true", "yes")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))

ALLOWED_PROXY_HOST_SUFFIXES = (
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",
    "googleusercontent.com",
)
ALLOWED_PROXY_HOSTS = {
    h.strip().lower()
    for h in os.getenv("ALLOWED_PROXY_HOSTS", "").split(",")
    if h.strip()
}

_costs_cache: Dict[str, Any] = {"data": None, "expires": 0.0}
_rate_limit_store: Dict[str, List[float]] = defaultdict(list)


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/health", "/"):
            return await call_next(request)
        ip = get_client_ip(request)
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW
        hits = [t for t in _rate_limit_store[ip] if t > window_start]
        if len(hits) >= RATE_LIMIT_MAX:
            return JSONResponse(
                status_code=429,
                content={"ok": False, "error": "Too many requests. Please try again later."},
            )
        hits.append(now)
        _rate_limit_store[ip] = hits
        return await call_next(request)


def is_url_safe_for_proxy(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = (parsed.hostname or "").lower()
        if not hostname:
            return False
        if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"):
            return False
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        except ValueError:
            pass
        if hostname in ALLOWED_PROXY_HOSTS:
            return True
        if any(hostname == suffix or hostname.endswith(f".{suffix}") for suffix in ALLOWED_PROXY_HOST_SUFFIXES):
            return True
        api_base = os.getenv("API_BASE_URL", "")
        if api_base:
            api_host = (urlparse(api_base).hostname or "").lower()
            if api_host and hostname == api_host:
                return True
        return False
    except Exception:
        return False


def validate_image_upload(content: bytes, content_type: Optional[str]) -> Optional[str]:
    if not content:
        return "Empty file"
    if len(content) > MAX_UPLOAD_BYTES:
        return f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)}MB)"
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime and mime not in ALLOWED_IMAGE_TYPES:
        return f"Invalid file type: {mime}"
    return None


def get_credit_costs_map(force_refresh: bool = False) -> Dict[str, int]:
    now = time.time()
    if not force_refresh and _costs_cache["data"] is not None and now < _costs_cache["expires"]:
        return _costs_cache["data"]
    db_client = get_db()
    try:
        costs_docs = db_client.collection("app_credit_costs").stream()
        costs = {
            doc.to_dict().get("operation"): doc.to_dict().get("cost")
            for doc in costs_docs
            if doc.to_dict().get("operation")
        }
    except Exception as e:
        print(f"Error fetching costs: {e}")
        costs = {"image_generation": 1, "video_generation": 5, "video_image_to_video": 5, "video_frame_to_frame": 7}
    _costs_cache["data"] = costs
    _costs_cache["expires"] = now + 300
    return costs


def sanitize_job_response(job: dict, user: Optional[dict] = None) -> dict:
    result = {k: v for k, v in job.items() if not k.startswith("_")}
    if result.get("file_url") and result.get("image_base64"):
        result.pop("image_base64", None)
    is_admin = user and is_admin_email(user.get("email"))
    if not is_admin:
        result.pop("details", None)
        if result.get("error") and len(str(result["error"])) > 200:
            result["error"] = str(result["error"])[:200]
    return result


def user_can_access_job(user: dict, job: dict) -> bool:
    job_user_id = job.get("_user_id")
    if not job_user_id:
        return is_admin_email(user.get("email"))
    if job_user_id == user.get("id"):
        return True
    return is_admin_email(user.get("email"))


def extract_bearer_token(authorization: Optional[str]) -> str:
    return (authorization or "").replace("Bearer ", "").strip()

def get_db():
    if not db:
        raise RuntimeError("Firestore is not initialized. Check your firebase-credentials.json.")
    return db

def is_admin_email(email: Optional[str]) -> bool:
    return bool(email and email.strip().lower() in ADMIN_EMAILS)

def build_user_payload(user: dict) -> dict:
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "full_name": user.get("full_name"),
        "credits": user.get("credits", 0),
        "plan_name": user.get("plan_name", "free"),
        "plan_id": user.get("plan_id"),
        "is_admin": is_admin_email(user.get("email")),
    }

def require_admin_user(token: str) -> Optional[dict]:
    user = get_user_from_token(token)
    if not user or not is_admin_email(user.get("email")):
        return None
    return user

def init_db_tables():
    """Seed Firestore collections if they don't exist."""
    db_client = get_db()
    # Seed app_tools
    tools_ref = db_client.collection('app_tools')
    if len(list(tools_ref.limit(1).stream())) == 0:
        tools = [
            {'id': 't1', 'title': 'AI Image Generation', 'description': 'Generate stunning interior and exterior designs from text prompts or reference images.', 'icon': 'Wand2', 'action_id': 'generation', 'created_at': datetime.utcnow().isoformat()},
            {'id': 't2', 'title': 'Image to Video', 'description': 'Transform static designs into immersive walkthrough videos with cutting-edge AI.', 'icon': 'Video', 'action_id': 'generation', 'created_at': datetime.utcnow().isoformat()},
            {'id': 't3', 'title': 'AI Upscaling', 'description': 'Enhance image quality up to 16x with Magnific AI for print-ready results.', 'icon': 'ZoomIn', 'action_id': 'generation', 'created_at': datetime.utcnow().isoformat()}
        ]
        for t in tools: tools_ref.document(t['id']).set(t)
    
    # Seed app_cards
    cards_ref = db_client.collection('app_cards')
    if len(list(cards_ref.limit(1).stream())) == 0:
        cards = [
            {'id': 'a1', 'title': 'Shot to CAD Board', 'description': 'Transform architectural photographs into professional CAD board layouts with plans.', 'image_url': 'https://images.unsplash.com/photo-1628169222588-444a1eb405d4?w=500&q=80', 'category': 'Architecture', 'action_id': 'generation', 'credit_cost': 1, 'created_at': datetime.utcnow().isoformat()},
            {'id': 'a2', 'title': 'Shot to Physical Model', 'description': 'Transform buildings into miniature white 3D printed architectural models on a display base.', 'image_url': 'https://images.unsplash.com/photo-1518384401463-d3876163c195?w=500&q=80', 'category': 'Architecture', 'action_id': 'generation', 'credit_cost': 1, 'created_at': datetime.utcnow().isoformat()},
            {'id': 'a3', 'title': 'Model to Full Scene', 'description': 'Transform 3D models or renders into fully realized architectural scenes with environment.', 'image_url': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=500&q=80', 'category': 'Architecture', 'action_id': 'generation', 'credit_cost': 1, 'created_at': datetime.utcnow().isoformat()},
            {'id': 'a4', 'title': 'Multiple Angles', 'description': 'Generate multiple perspective views of a building from different angles seamlessly.', 'image_url': 'https://images.unsplash.com/photo-1545083036-728b9fb6f827?w=500&q=80', 'category': 'Architecture', 'action_id': 'generation', 'credit_cost': 1, 'created_at': datetime.utcnow().isoformat()}
        ]
        for c in cards: cards_ref.document(c['id']).set(c)

    # Seed app_plans
    plans_ref = db_client.collection('app_plans')
    if len(list(plans_ref.limit(1).stream())) == 0:
        plans = [
            {'id': 'p1', 'name': 'Starter', 'price': 19.99, 'credits': 100, 'period': 'mo', 'features': '["100 AI Generations","Standard Resolution","Community Support","Basic Styles"]', 'is_popular': 0, 'created_at': datetime.utcnow().isoformat()},
            {'id': 'p2', 'name': 'Pro', 'price': 49.99, 'credits': 500, 'period': 'mo', 'features': '["500 AI Generations","High Resolution (4K)","Priority Support","All Architectural Styles","Video Generation"]', 'is_popular': 1, 'created_at': datetime.utcnow().isoformat()},
            {'id': 'p3', 'name': 'Studio', 'price': 199.99, 'credits': 3000, 'period': 'mo', 'features': '["3000 AI Generations","Ultra Resolution (8K)","24/7 Dedicated Support","Custom Model Training","API Access"]', 'is_popular': 0, 'created_at': datetime.utcnow().isoformat()}
        ]
        for p in plans: plans_ref.document(p['id']).set(p)

    # Seed app_hero
    hero_ref = db_client.collection('app_hero')
    if len(list(hero_ref.limit(1).stream())) == 0:
        heroes = [
            {'id': 'h1', 'title': 'Modern Mansion', 'description': 'Transform exterior photographs into photorealistic architectural renders.', 'image_url': 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80', 'action_id': 'generation', 'created_at': datetime.utcnow().isoformat()},
            {'id': 'h2', 'title': 'Curved Architecture', 'description': 'Generate stunning architectural visualizations with full material and lighting control.', 'image_url': 'https://images.unsplash.com/photo-1613490908679-b3a5105220fa?w=800&q=80', 'action_id': 'generation', 'created_at': datetime.utcnow().isoformat()},
            {'id': 'h3', 'title': 'Interior Design', 'description': 'Create beautiful photorealistic interior renders from basic 3D models or photos.', 'image_url': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80', 'action_id': 'generation', 'created_at': datetime.utcnow().isoformat()}
        ]
        for h in heroes: hero_ref.document(h['id']).set(h)

    # Seed app_credit_costs
    costs_ref = db_client.collection('app_credit_costs')
    if len(list(costs_ref.limit(1).stream())) == 0:
        costs = [
            {'id': 'cc1', 'operation': 'image_generation', 'label': 'Image Generation (per image)', 'cost': 1, 'updated_at': datetime.utcnow().isoformat()},
            {'id': 'cc2', 'operation': 'video_generation', 'label': 'Video Generation (Legacy)', 'cost': 5, 'updated_at': datetime.utcnow().isoformat()},
            {'id': 'cc3', 'operation': 'video_image_to_video', 'label': 'Video: Image to Video', 'cost': 5, 'updated_at': datetime.utcnow().isoformat()},
            {'id': 'cc4', 'operation': 'video_frame_to_frame', 'label': 'Video: Frame to Frame', 'cost': 7, 'updated_at': datetime.utcnow().isoformat()}
        ]
        for c in costs: costs_ref.document(c['id']).set(c)
    else:
        existing = {doc.to_dict().get('operation') for doc in costs_ref.stream()}
        if 'video_image_to_video' not in existing:
            costs_ref.document('cc3').set({'id': 'cc3', 'operation': 'video_image_to_video', 'label': 'Video: Image to Video', 'cost': 5, 'updated_at': datetime.utcnow().isoformat()})
        if 'video_frame_to_frame' not in existing:
            costs_ref.document('cc4').set({'id': 'cc4', 'operation': 'video_frame_to_frame', 'label': 'Video: Frame to Frame', 'cost': 7, 'updated_at': datetime.utcnow().isoformat()})
            
    print(f" Firebase Firestore seeded and ready")


def get_user_from_token(token: str) -> Optional[dict]:
    if not token:
        return None
    try:
        # Verify Firebase ID token
        decoded_token = fb_auth.verify_id_token(token)
        uid = decoded_token['uid']
        
        db_client = get_db()
        user_doc = db_client.collection('users').document(uid).get()
        
        if user_doc.exists:
            return user_doc.to_dict()
        else:
            # Create user implicitly if not exists (sync from Firebase auth)
            email = decoded_token.get('email', '')
            name = decoded_token.get('name', '')
            new_user = {
                'id': uid,
                'email': email,
                'full_name': name,
                'credits': 0,
                'plan_name': 'free',
                'plan_id': None,
                'created_at': datetime.utcnow().isoformat()
            }
            db_client.collection('users').document(uid).set(new_user)
            return new_user
    except Exception as e:
        print(f" get_user_from_token error: {e}")
        return None

import json as json_lib

def serialize_dates(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

os.makedirs("static", exist_ok=True)

def deduct_credits_on_success(job_id: str):
    """Deduct credits from user after successful generation (transactional)."""
    job = get_job(job_id) or {}
    user_id = job.get("_user_id")
    credit_cost = job.get("_credit_cost", 0)
    if not user_id or not credit_cost:
        return
    db_client = get_db()
    user_ref = db_client.collection("users").document(user_id)
    try:
        from google.cloud.firestore_v1 import transactional

        @transactional
        def _deduct(transaction, ref, cost):
            snapshot = ref.get(transaction=transaction)
            if not snapshot.exists:
                return False
            current = snapshot.to_dict().get("credits", 0) or 0
            if current < cost:
                print(f" Insufficient credits for deduction: user {user_id}, need {cost}, have {current}")
                return False
            transaction.update(ref, {"credits": current - cost})
            return True

        transaction = db_client.transaction()
        if _deduct(transaction, user_ref, credit_cost):
            print(f" Deducted {credit_cost} credits from user {user_id} for job {job_id}")
    except Exception as e:
        print(f" Failed to deduct credits for job {job_id}: {e}")


def resolve_generation_cost(
    is_video: bool,
    total_images: int,
    has_refs: bool,
    app_card_id: Optional[str],
    costs: Dict[str, int],
) -> int:
    """Server-side credit cost — never trust client-supplied amounts."""
    if app_card_id:
        try:
            card_doc = get_db().collection("app_cards").document(app_card_id).get()
            if card_doc.exists:
                card_cost = card_doc.to_dict().get("credit_cost")
                if isinstance(card_cost, (int, float)) and card_cost >= 0:
                    return int(card_cost)
        except Exception as e:
            print(f" resolve_generation_cost card lookup failed: {e}")
    cost_per_image = costs.get("image_generation", 1)
    if is_video:
        if has_refs:
            return costs.get("video_frame_to_frame", costs.get("video_generation", 7))
        return costs.get("video_image_to_video", costs.get("video_generation", 5))
    return cost_per_image * total_images


def compress_image_b64(b64_data: str, max_size: int = 1024, quality: int = 80) -> str:
    """
    Compress and resize an image encoded as base64 to reduce Gemini API input token costs.
    - max_size: maximum width or height in pixels (default 1024)
    - quality: JPEG compression quality 0-100 (default 80)
    Returns a compressed base64 JPEG string.
    """
    try:
        from PIL import Image
        import io
        raw = base64.b64decode(b64_data)
        img = Image.open(io.BytesIO(raw))
        # Convert to RGB if needed (removes alpha channel for JPEG)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        # Resize only if larger than max_size
        w, h = img.size
        if w > max_size or h > max_size:
            ratio = min(max_size / w, max_size / h)
            new_w = max(1, int(w * ratio))
            new_h = max(1, int(h * ratio))
            img = img.resize((new_w, new_h), Image.LANCZOS)
        # Re-encode as JPEG
        out_buf = io.BytesIO()
        img.save(out_buf, format="JPEG", quality=quality, optimize=True)
        compressed = base64.b64encode(out_buf.getvalue()).decode("utf-8")
        original_len = len(b64_data)
        new_len = len(compressed)
        print(f" Image compressed: {original_len} -> {new_len} bytes ({100 * new_len // original_len}% of original)")
        return compressed
    except Exception as e:
        print(f" compress_image_b64 failed (using original): {e}")
        return b64_data


# =========================
# Job Tracking (Database-backed)
# =========================
def create_job(job_data: dict):
    db_client = get_db()
    try:
        job_id = job_data.get("job_id")
        doc_data = {
            "id": job_id,
            "user_id": job_data.get("_user_id"),
            "status": job_data.get("status", "IN_QUEUE"),
            "perspective": job_data.get("perspective"),
            "aspect_ratio": job_data.get("aspect_ratio"),
            "credit_cost": job_data.get("_credit_cost", 0),
            "is_video": 1 if job_data.get("is_video") else 0,
            "message": job_data.get("message"),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        db_client.collection('app_jobs').document(job_id).set(doc_data)
    except Exception as e:
        print(f" create_job error: {e}")

def update_job(job_id: str, updates: dict):
    db_client = get_db()
    try:
        valid_cols = ["status", "prompt_used", "image_base64", "image_data_url", 
                      "filename", "file_url", "error", "details", "message", "kling_task_id"]
        
        doc_updates = {}
        for k, v in updates.items():
            if k in valid_cols:
                doc_updates[k] = v
        
        if not doc_updates:
            return
            
        doc_updates["updated_at"] = datetime.utcnow().isoformat()
        db_client.collection('app_jobs').document(job_id).update(doc_updates)
    except Exception as e:
        print(f" update_job error: {e}")

def get_job(job_id: str) -> dict:
    db_client = get_db()
    try:
        doc = db_client.collection('app_jobs').document(job_id).get()
        if not doc.exists:
            return None
        d = doc.to_dict()
        return {
            "ok": d.get("status") != "FAILED",
            "job_id": d.get("id"),
            "status": d.get("status"),
            "perspective": d.get("perspective"),
            "aspect_ratio": d.get("aspect_ratio"),
            "_user_id": d.get("user_id"),
            "_credit_cost": d.get("credit_cost", 0),
            "is_video": bool(d.get("is_video")),
            "prompt_used": d.get("prompt_used"),
            "image_base64": d.get("image_base64"),
            "image_data_url": d.get("image_data_url"),
            "filename": d.get("filename"),
            "file_url": d.get("file_url"),
            "error": d.get("error"),
            "details": d.get("details"),
            "message": d.get("message"),
            "kling_task_id": d.get("kling_task_id")
        }
    except Exception as e:
        print(f" get_job error: {e}")
        return None

# =========================
# 1)  RunPod
# =========================
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "").strip()
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID", "").strip()

if not RUNPOD_API_KEY:
    # :     .env  Environment Variables
    #    
    print(" RUNPOD_API_KEY is empty. Set it in environment variables.")

RUN_URL = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/run"
STATUS_URL = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status"  # + /{job_id}

# =========================
# 2)  FastAPI + CORS
# =========================
app = FastAPI(
    docs_url=None if ENVIRONMENT == "production" else "/docs",
    redoc_url=None if ENVIRONMENT == "production" else "/redoc",
    openapi_url=None if ENVIRONMENT == "production" else "/openapi.json",
)

@app.on_event("startup")
def startup_event():
    print("Running startup tasks...")
    try:
        init_db_tables()
    except Exception as e:
        print(f"Failed to initialize database tables: {e}")

_cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,"
        "https://gen-lang-client-0550261552.web.app,"
        "https://gen-lang-client-0550261552.firebaseapp.com",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

app.mount("/static", StaticFiles(directory="static"), name="static")

import asyncio

class CancelJobsRequest(BaseModel):
    job_ids: List[str]

@app.post("/cancel-jobs")
async def cancel_jobs(req: CancelJobsRequest, authorization: Optional[str] = Header(None)):
    token = extract_bearer_token(authorization)
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    db_client = get_db()
    cancelled_count = 0
    for job_id in req.job_ids:
        job_ref = db_client.collection('app_jobs').document(job_id)
        job_doc = job_ref.get()
        if job_doc.exists:
            data = job_doc.to_dict()
            if data.get('user_id') == user['id'] and data.get('status') in ['IN_QUEUE', 'PROCESSING']:
                job_ref.update({"status": "CANCELLED"})
                cancelled_count += 1
                
    return {"ok": True, "cancelled": cancelled_count}

@app.get("/")
def root():
    return {"ok": True, "message": "AI backend is running (Firebase)", "docs": "/docs"}

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/proxy-download")
def proxy_download(url: str, authorization: Optional[str] = Header(None)):
    token = extract_bearer_token(authorization)
    if not get_user_from_token(token):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not url:
        return JSONResponse(status_code=400, content={"error": "No URL provided"})
    if not is_url_safe_for_proxy(url):
        return JSONResponse(status_code=403, content={"error": "URL not allowed"})
    try:
        response = requests.get(url, stream=True, timeout=15, allow_redirects=True)
        response.raise_for_status()
        final_url = response.url or url
        if not is_url_safe_for_proxy(final_url):
            return JSONResponse(status_code=403, content={"error": "Redirect target not allowed"})
        
        content_type = response.headers.get("Content-Type", "application/octet-stream")
        ext = "mp4" if "video" in content_type else "png"
        filename = f"studio_creation_{int(time.time())}.{ext}"
        
        def iterfile():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
        
        return StreamingResponse(iterfile(), media_type=content_type, headers=headers)
    except requests.RequestException:
        return JSONResponse(status_code=502, content={"error": "Failed to fetch remote file"})
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Download failed"})

# =========================
# Auth Endpoints
# =========================
from pydantic import BaseModel

class RegisterBody(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None

class LoginBody(BaseModel):
    email: str
    password: str

@app.post("/auth/register")
def auth_register(body: RegisterBody):
    return JSONResponse(status_code=400, content={"ok": False, "error": "Backend register disabled. Please use Firebase Web SDK from the frontend."})

@app.post("/auth/login")
def auth_login(body: LoginBody):
    return JSONResponse(status_code=400, content={"ok": False, "error": "Backend login disabled. Please use Firebase Web SDK from the frontend."})

@app.post("/auth/logout")
def auth_logout(authorization: Optional[str] = Header(None)):
    return {"ok": True}

@app.get("/auth/me")
def auth_me(authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    # Fetch fresh user data including credits
    db_client = get_db()
    try:
        user_doc = db_client.collection('users').document(user["id"]).get()
        if user_doc.exists:
            user = user_doc.to_dict()
    except Exception:
        pass
    return {"ok": True, "user": build_user_payload(user)}

# =========================
# Subscription / Credits Endpoints
# =========================

class SubscribeBody(BaseModel):
    plan_id: str


class AdminAdjustCreditsBody(BaseModel):
    user_id: str
    credits: int
    reason: Optional[str] = "admin_adjustment"

@app.post("/subscribe")
def subscribe(body: SubscribeBody, authorization: Optional[str] = Header(None)):
    """Subscribe to a plan - test mode only when SUBSCRIBE_TEST_MODE=true."""
    if not SUBSCRIBE_TEST_MODE:
        return JSONResponse(
            status_code=403,
            content={"ok": False, "error": "Subscription requires payment integration. Disabled in production."},
        )
    token = extract_bearer_token(authorization)
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    db_client = get_db()
    try:
        plan_doc = db_client.collection('app_plans').document(body.plan_id).get()
        if not plan_doc.exists:
            return JSONResponse(status_code=404, content={"ok": False, "error": "Plan not found"})
        plan = plan_doc.to_dict()
        user_ref = db_client.collection('users').document(user["id"])
        user_doc = user_ref.get()
        current_credits = user_doc.to_dict().get("credits", 0) if user_doc.exists else 0
        new_credits = current_credits + plan.get("credits", 0)
        
        user_ref.set({
            "credits": new_credits,
            "plan_id": plan.get("id"),
            "plan_name": plan.get("name")
        }, merge=True)
        updated = user_ref.get().to_dict()
        return {"ok": True, "user": build_user_payload(updated), "credits_added": plan.get("credits", 0), "plan": plan.get("name", "Unknown Plan")}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

@app.get("/credits")
def get_credits(authorization: Optional[str] = Header(None)):
    """Get current user credits balance."""
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    db_client = get_db()
    try:
        user_doc = db_client.collection('users').document(user["id"]).get()
        if not user_doc.exists:
            return JSONResponse(status_code=404, content={"ok": False, "error": "User not found"})
        ud = user_doc.to_dict()
        return {"ok": True, "credits": ud.get("credits", 0), "plan_id": ud.get("plan_id"), "plan_name": ud.get("plan_name", "free")}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

@app.post("/admin/adjust-credits")
def admin_adjust_credits(body: AdminAdjustCreditsBody, authorization: Optional[str] = Header(None)):
    """Admin: manually add or remove credits from a user."""
    token = (authorization or "").replace("Bearer ", "").strip()
    admin = require_admin_user(token)
    if not admin:
        return JSONResponse(status_code=403, content={"ok": False, "error": "Admin access required"})
    db_client = get_db()
    try:
        user_ref = db_client.collection('users').document(body.user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return JSONResponse(status_code=404, content={"ok": False, "error": "User not found"})
        
        current_credits = user_doc.to_dict().get("credits", 0)
        new_credits = max(0, current_credits + body.credits)
        user_ref.update({"credits": new_credits})
        return {"ok": True, "user_id": body.user_id, "credits": new_credits}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

# =========================
# Credit Costs Endpoints
# =========================

@app.get("/credit-costs")
def get_credit_costs():
    """Public: get credit cost per operation."""
    db_client = get_db()
    try:
        costs = db_client.collection('app_credit_costs').order_by('operation').stream()
        rows = [c.to_dict() for c in costs]
        
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content={"ok": True, "data": rows},
            headers={"Cache-Control": "public, max-age=300"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

class CreditCostUpdateBody(BaseModel):
    operation: str
    cost: int
    label: Optional[str] = None

@app.post("/admin/credit-costs")
def update_credit_cost(body: CreditCostUpdateBody, authorization: Optional[str] = Header(None)):
    """Admin: update credit cost for an operation."""
    token = (authorization or "").replace("Bearer ", "").strip()
    admin = require_admin_user(token)
    if not admin:
        return JSONResponse(status_code=403, content={"ok": False, "error": "Admin access required"})
    if body.cost < 0:
        return JSONResponse(status_code=400, content={"ok": False, "error": "Cost must be >= 0"})
    db_client = get_db()
    try:
        costs_ref = db_client.collection('app_credit_costs')
        query = costs_ref.where(filter=FieldFilter("operation", "==", body.operation)).stream()
        existing = list(query)
        
        if existing:
            doc_ref = existing[0].reference
            label = body.label or existing[0].to_dict().get("label")
            doc_ref.update({
                "cost": body.cost,
                "label": label,
                "updated_at": datetime.utcnow().isoformat()
            })
        else:
            new_id = str(uuid.uuid4())
            costs_ref.document(new_id).set({
                "id": new_id,
                "operation": body.operation,
                "label": body.label or body.operation,
                "cost": body.cost,
                "updated_at": datetime.utcnow().isoformat()
            })
        get_credit_costs_map(force_refresh=True)
        return {"ok": True, "operation": body.operation, "cost": body.cost}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

# =========================
# Sessions Endpoints
# =========================

@app.get("/sessions")
def get_sessions(authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    db_client = get_db()
    try:
        sessions = (
            db_client.collection("app_user_sessions")
            .where(filter=FieldFilter("user_id", "==", user["id"]))
            .limit(200)
            .stream()
        )
        result = []
        for s in sessions:
            d = s.to_dict()
            resps = d.get("resps", "{}")
            if isinstance(resps, str):
                try: d["resps"] = json_lib.loads(resps)
                except: d["resps"] = {}
            result.append(d)
        result.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return {"ok": True, "data": result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


class SessionCreateBody(BaseModel):
    title: Optional[str] = "New Session"
    resps: Optional[dict] = {}
    parent_session_id: Optional[str] = None

@app.post("/sessions")
def create_session(body: SessionCreateBody, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    db_client = get_db()
    try:
        sid = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        session_data = {
            "id": sid,
            "user_id": user["id"],
            "title": body.title,
            "resps": body.resps or {},
            "parent_session_id": body.parent_session_id,
            "created_at": now,
            "updated_at": now
        }
        db_client.collection('app_user_sessions').document(sid).set(session_data)
        return {"ok": True, "data": session_data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


class SessionUpdateBody(BaseModel):
    title: Optional[str] = None
    resps: Optional[dict] = None

@app.patch("/sessions/{session_id}")
def update_session(session_id: str, body: SessionUpdateBody, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    db_client = get_db()
    try:
        doc_ref = db_client.collection('app_user_sessions').document(session_id)
        doc = doc_ref.get()
        if not doc.exists or doc.to_dict().get("user_id") != user["id"]:
            return JSONResponse(status_code=404, content={"ok": False, "error": "Session not found"})
        
        updates = {"updated_at": datetime.utcnow().isoformat()}
        if body.title is not None:
            updates["title"] = body.title
        if body.resps is not None:
            updates["resps"] = body.resps
            
        doc_ref.update(updates)
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    db_client = get_db()
    try:
        doc_ref = db_client.collection('app_user_sessions').document(session_id)
        doc = doc_ref.get()
        if doc.exists and doc.to_dict().get("user_id") == user["id"]:
            doc_ref.delete()
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


# =========================
# Admin & Public Content Endpoints
# =========================

@app.get("/admin/stats")
def get_admin_stats(authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = require_admin_user(token)
    if not user:
        return JSONResponse(status_code=403, content={"ok": False, "error": "Admin access required"})
    db_client = get_db()
    try:
        users_agg = db_client.collection("users").count().get()
        sessions_agg = db_client.collection("app_user_sessions").count().get()
        users_count = users_agg[0][0].value
        sessions_count = sessions_agg[0][0].value
        return {"ok": True, "stats": {"users": users_count, "sessions": sessions_count}}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@app.get("/content/{content_type}")
def get_content(content_type: str):
    db_client = get_db()
    try:
        if content_type == "tools":
            query = db_client.collection('app_tools').order_by('created_at').stream()
        elif content_type == "apps":
            query = db_client.collection('app_cards').order_by('created_at').stream()
        elif content_type == "plans":
            query = db_client.collection('app_plans').order_by('price').stream()
        elif content_type == "hero":
            query = db_client.collection('app_hero').order_by('created_at').stream()
        elif content_type == "prompts":
            query = db_client.collection('app_prompts').stream()
        else:
            return JSONResponse(status_code=400, content={"ok": False, "error": "Invalid type"})
        
        result = []
        for doc in query:
            d = doc.to_dict()
            if content_type == "plans" and "features" in d:
                if isinstance(d["features"], str):
                    try: d["features"] = json_lib.loads(d["features"])
                    except: d["features"] = []
            result.append(d)
        if content_type == "prompts":
            result.sort(key=lambda x: (x.get("type", ""), x.get("created_at", "")))
        
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content={"ok": True, "data": result},
            headers={"Cache-Control": "public, max-age=300"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


class ContentUpdateBody(BaseModel):
    id: Optional[str] = None
    data: dict

@app.post("/content/{content_type}")
def modify_content(content_type: str, body: ContentUpdateBody, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = require_admin_user(token)
    if not user:
        return JSONResponse(status_code=403, content={"ok": False, "error": "Admin access required"})
    db_client = get_db()
    try:
        item_id = body.id or str(uuid.uuid4())
        d = body.data
        d["id"] = item_id
        
        if content_type == "tools":
            ref = db_client.collection('app_tools').document(item_id)
        elif content_type == "apps":
            ref = db_client.collection('app_cards').document(item_id)
        elif content_type == "plans":
            ref = db_client.collection('app_plans').document(item_id)
        elif content_type == "hero":
            ref = db_client.collection('app_hero').document(item_id)
        elif content_type == "prompts":
            ref = db_client.collection('app_prompts').document(item_id)
        else:
            return JSONResponse(status_code=400, content={"ok": False, "error": "Invalid type"})
        
        ref.set(d, merge=True)
        return {"ok": True, "id": item_id}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@app.delete("/content/{content_type}/{item_id}")
def delete_content(content_type: str, item_id: str, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = require_admin_user(token)
    if not user:
        return JSONResponse(status_code=403, content={"ok": False, "error": "Admin access required"})
    db_client = get_db()
    try:
        if content_type == "tools":
            ref = db_client.collection('app_tools').document(item_id)
        elif content_type == "apps":
            ref = db_client.collection('app_cards').document(item_id)
        elif content_type == "plans":
            ref = db_client.collection('app_plans').document(item_id)
        elif content_type == "hero":
            ref = db_client.collection('app_hero').document(item_id)
        elif content_type == "prompts":
            ref = db_client.collection('app_prompts').document(item_id)
        else:
            return JSONResponse(status_code=400, content={"ok": False, "error": "Invalid type"})
            
        ref.delete()
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@app.post("/admin/upload-image")
async def admin_upload_image(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = require_admin_user(token)
    if not user:
        return JSONResponse(status_code=403, content={"ok": False, "error": "Admin access required"})
    
    try:
        content = await file.read()
        upload_error = validate_image_upload(content, file.content_type)
        if upload_error:
            return JSONResponse(status_code=400, content={"ok": False, "error": upload_error})
        ext = file.filename.split('.')[-1].lower() if file.filename and '.' in file.filename else 'jpg'
        if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
            return JSONResponse(status_code=400, content={"ok": False, "error": "Invalid file extension"})
        filename = f"uploaded_{int(time.time())}_{uuid.uuid4().hex[:6]}.{ext}"
        
        print(f" Upload request: {filename}")
        
        if storage_bucket:
            content_type = file.content_type or "image/jpeg"
            if ext.lower() == 'png': content_type = "image/png"
            elif ext.lower() == 'webp': content_type = "image/webp"
            elif ext.lower() == 'gif': content_type = "image/gif"
            
            blob = storage_bucket.blob(f"uploads/{filename}")
            blob.upload_from_string(content, content_type=content_type)
            blob.make_public()
            file_url = blob.public_url
            print(f" Image uploaded to Firebase successfully!")
            return {"ok": True, "url": file_url, "storage": "firebase", "filename": filename}
        else:
            # Fallback: Save locally
            filepath = os.path.join("static", filename)
            with open(filepath, "wb") as f:
                f.write(content)
                
            api_base = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
            file_url = f"{api_base}/static/{filename}"
            return {"ok": True, "url": file_url, "storage": "local", "filename": filename}
            
    except Exception as e:
        print(f" Upload error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": "Upload failed"})

# =========================
# 3) Prompt Templates
# =========================
BASE_PROMPT = """
professional architectural visualization, accurate proportions, realistic geometry
""".strip()

NEG_PROMPT = """
top view, floor plan, blueprint, layout drawing, 2D plan, interior plan, cutaway, dollhouse view, isometric plan, schematic drawing, low quality, blurry, distorted geometry, bad proportions, warped, deformed, cartoon, unrealistic materials, noise, messy lines
""".strip()

#  Kling  . api-singapore : kling-v2-6  kling-v1-1 ( /)
KLING_VIDEO_MODEL = os.getenv("KLING_VIDEO_MODEL", "kling-v2-6")
#       (      v1 )
KLING_VIDEO_MODEL_FALLBACK = os.getenv("KLING_VIDEO_MODEL_FALLBACK", "kling-v1-1")

PERSPECTIVES = {
    "Photorealistic Exterior": "photorealistic 3D exterior render, high-res architectural photography, stunning facade",
    "Floor Plan to 3D": "convert 2D floor plan layout to a rich 3D floor plan layout, photorealistic top-down perspective, high detail interior",
    "Architectural Plan, Elevation & Section": "architectural plan elevation section, top down or orthographic, clean lines, technical drawing style, precise",
    "Physical Model": "physical scale model on table, studio lighting, miniature model, 3D craft",
    "BIM Model": "BIM Villa Exterior, Futuristic luxury villa at dusk, photorealistic, warm interior glow, wet asphalt reflections, full neon cyan holographic BIM overlay showing 3D structural framework, floor plans, and dimensions, cinematic wide-angle, ultra-realistic, HDR, 8K, UnrealFuturistic luxury villa at dusk, photorealistic, warm interior glow, wet asphalt reflections, full neon cyan holographic BIM overlay showing 3D structural framework, floor plans, and dimensions, cinematic wide-angle, ultra-realistic, HDR, 8K, Unreal",
    "Night Shot": "Night Shot, Use Night for Night technique: Night for night shoots actual night scenes at night, capturing authentic darkness, city lights, and nocturnal atmosphere impossible to replicate during the day. This expensive approach requires powerful lighting but delivers superior results compared to day-for-night techniques.",
    "Sunset/Golden Hour": "Golden hour lighting, warm sunlight, sunset, beautiful twilight sky, dramatic long shadows, photorealistic",
    "Helicopter Shot": "Helicopter Shot, Use Helicopter Shot technique: A helicopter shot is a sweeping aerial shot typically taken from a helicopter, allowing the camera to weave through landscapes, follow vehicles, or capture dramatic overhead perspectives. These shots create a sense of epic scale and freedom of movement that's difficult to achieve with other methods. Often used as establishing shots in big-budget productions.",
    "Architectural analysis sketch": "Architectural analysis sketch, no changes to architectural design, no adding or removing elements, only stylistic transformation",
    "Concept Studio conceptual design": "Concept Studio conceptual design, Convert the frist and the secend floor and the elevation into a diagram illustrated as a Concept Studio conceptual design, including an explanation of the elements used, an explanation of the proportions and distribution, a diagram illustrating the functional relationships between the sleeping area, the family area, the hospitality area, and the service area, and an explanation illustrating the axis of movement, privacy, and comfortable views. The result will be a high-resolution schematic drawing. no changes to architectural design, no adding or removing elements, only stylistic transformation",
    "Axonometric diagram": "create an exploded axonometric diagram of this building with all elements including facade, structure, windows and circulation and indoor spaces being shown. minimal axonometric diagram. white background. realistic style. annotations. floors are the last 2 pic",
    "axonometric diagram": "create an exploded axonometric diagram of this building with all elements including facade, structure, windows and circulation and indoor spaces being shown. minimal axonometric diagram. white background. realistic style. annotations. floors are the last 2 pic",
    "Architectural concept sketch": "Architectural concept sketch on vintage parchment paper,. The image should be a multi-panel presentation board including: a central isometric view of the building in an urban context, a 'Massing Study' progression at the top, 'Brick Facade Detail' with zoomed-in texture, and 'Entrance & Base' details at the bottom. Hand-drawn style using fine-liner pens and soft graphite shading, featuring architectural annotations and elegant English/Arabic calligraphy notes. Aesthetic: technical but artistic, cream-colored paper,",
    "Interior Working": "working diligently to complete the interior plastering works with precision, according to the approved specifications. floors are the last 2 pic",
    "interior working": "working diligently to complete the interior plastering works with precision, according to the approved specifications. floors are the last 2 pic",
    "Aerial Bird's-Eye": "aerial birds-eye view, high altitude, contextual surroundings, 3D top-down perspective",
    "Vertical Top-Down": "vertical top-down view, directly from above, orthographic feel, architectural floor plan",
    "Facade Detail": "facade detail closeup, materials and textures, sharp focus, exterior",
    "Entrance Close-Up": "main entrance close-up, focus on doorway, realistic exterior materials",
    "Interior Lobby": "interior lobby matching style, realistic interior lighting, clean design, inside view",
    "Photorealistic Interior": "photorealistic 3D interior render, high resolution architectural photography, modern beautiful interior space, interior design",
    "Interior Concept Sketch": "Interior concept sketch, fine-liner pens and soft graphite shading, aesthetic interior layout presentation, concept art",
    "Living Room Design": "photorealistic living room interior, cozy, modern furniture, beautiful warm natural lighting, high end decor, ultra detailed",
    "Bedroom Design": "cozy modern bedroom interior, comfortable bed, beautiful ambient lighting, high end hotel room style, intricate details",
    "Kitchen & Dining": "luxury modern kitchen and dining room interior, beautiful cabinets, island counter, natural light, elegant dining table, photorealistic",
    "Bathroom Design": "modern luxury bathroom interior, beautiful tiles, stylish fixtures, spa-like atmosphere, bright lighting, photorealistic interior",
    "Office/Workspace": "modern professional office workspace interior, productive atmosphere, ergonomic furniture, good lighting, corporate feeling",
    "Night/Ambient Lighting Interior": "interior space at night, beautiful ambient lighting, cozy atmosphere, glowing mood lights, indirect lighting, architectural lighting",
    "Daylight Interior": "interior space during daytime, bright natural daylight streaming through windows, sunny, uplifting atmosphere, clean look",
    "Custom Scene": "",
}


def build_prompt(perspective: str, custom: Optional[str] = None) -> str:
    """
    :  `Custom Scene`     .
         +   .
    """
    custom = (custom or "").strip()

    # Custom Scene must be driven ONLY by the user's prompt (no fixed template text).
    if perspective == "Custom Scene":
        return custom

    # Fetch from Firestore prompt table first
    db_client = get_db()
    extra = ""
    try:
        query = db_client.collection('app_prompts').where(filter=FieldFilter("title", "==", perspective)).stream()
        docs = list(query)
        if docs:
            extra = docs[0].to_dict().get("prompt_text", "")
        else:
            extra = PERSPECTIVES.get(perspective, "")
    except Exception:
        extra = PERSPECTIVES.get(perspective, "")

    parts = []
    if custom:
        # For non-custom scenes, keep user's additions but don't let them replace perspective intent.
        parts.append(custom)
    parts.append(BASE_PROMPT)
    if extra:
        parts.append(extra)
    parts.append("highly detailed, ultra realistic, sharp, 8k, global illumination, trending on artstation")
    return " | ".join([p.strip() for p in parts if p.strip() and p != ""])

# =========================
# 4) Workflow (ComfyUI)
# =========================
def build_workflow(prompt: str, negative: str, has_image: bool = False, denoise: float = 1.0, width: int = 1024, height: int = 1024, steps: int = 25, cfg: float = 7.5, seed: Optional[int] = None) -> Dict[str, Any]:
    if seed is None:
        import random
        seed = random.randint(1, 100000000)

    wf = {
        "3": {
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": cfg,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": denoise if has_image else 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["11", 0] if has_image else ["5", 0]
            },
            "class_type": "KSampler"
        },
        "4": {
            "inputs": {
                "ckpt_name": "flux1-dev-fp8.safetensors"
            },
            "class_type": "CheckpointLoaderSimple"
        },
        "6": {
            "inputs": {
                "text": prompt,
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "7": {
            "inputs": {
                "text": negative,
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "8": {
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            },
            "class_type": "VAEDecode"
        },
        "9": {
            "inputs": {
                "filename_prefix": "ai_architecture",
                "images": ["8", 0]
            },
            "class_type": "SaveImage"
        }
    }

    if has_image:
        wf["10"] = {
            "inputs": {
                "image": "input_image.png",
                "upload": "image"
            },
            "class_type": "LoadImage"
        }
        wf["11"] = {
            "inputs": {
                "pixels": ["10", 0],
                "vae": ["4", 2]
            },
            "class_type": "VAEEncode"
        }
    else:
        wf["5"] = {
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1
            },
            "class_type": "EmptyLatentImage"
        }

    return wf


# =========================
# 5) RunPod Helpers
# =========================
def runpod_headers() -> Dict[str, str]:
    if not RUNPOD_API_KEY:
        raise RuntimeError("RUNPOD_API_KEY is missing. Put it in environment variables.")
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {RUNPOD_API_KEY}"
    }

def runpod_run(workflow: dict, images: Optional[list] = None) -> Dict[str, Any]:
    payload = {"input": {"workflow": workflow}}
    if images:
        payload["input"]["images"] = images
    r = requests.post(RUN_URL, headers=runpod_headers(), json=payload, timeout=60)
    r.raise_for_status()
    return r.json()


def runpod_wait(job_id: str, timeout_sec: int = 600, poll_every: float = 2.0) -> Dict[str, Any]:
    start = time.time()
    while True:
        if time.time() - start > timeout_sec:
            return {"status": "TIMEOUT", "id": job_id}

        s = requests.get(f"{STATUS_URL}/{job_id}", headers=runpod_headers(), timeout=60)
        s.raise_for_status()
        data = s.json()

        st = data.get("status")
        if st in ("COMPLETED", "FAILED"):
            return data

        time.sleep(poll_every)

# ...existing code...
def extract_first_image(final: Dict[str, Any]) -> Dict[str, str]:
    """
        :
    - final.output.images[0].data (base64)
    -  final.output.files[0].url ( )     base64
    """
    import base64

    output = final.get("output") or {}
    # 1)    base64
    images = output.get("images") or []
    if images:
        first = images[0] or {}
        b64 = first.get("data") or first.get("b64") or ""
        filename = first.get("filename") or "result.png"
        if b64:
            data_url = f"data:image/png;base64,{b64}"
            return {"image_base64": b64, "image_data_url": data_url, "filename": filename}

    # 2)   (url)
    files = output.get("files") or []
    if files:
        first = files[0] or {}
        url = first.get("url") or first.get("file") or ""
        filename = first.get("filename") or (os.path.basename(url) if url else "result.png")
        if url:
            try:
                resp = requests.get(url, timeout=30)
                resp.raise_for_status()
                b64 = base64.b64encode(resp.content).decode("utf-8")
                return {"image_base64": b64, "image_data_url": f"data:image/png;base64,{b64}", "filename": filename, "file_url": url}
            except Exception:
                return {"file_url": url, "filename": filename}

    return {}
# ...existing code...
# =========================
# 6) Background Task for Gemini
# =========================
def process_gemini_job(
    job_id: str,
    prompt: str,
    input_image_b64: Optional[str],
    mime_type: str,
    reference_images: Optional[list] = None,
    aspect_ratio: str = "9:16",
    perspective: str = "",
    model_name: str = "nano-banana-pro-preview",
):
    try:
        # Check if cancelled before starting
        db_client = get_db()
        job_ref = db_client.collection('app_jobs').document(job_id)
        job_doc = job_ref.get()
        if job_doc.exists and job_doc.to_dict().get("status") == "CANCELLED":
            print(f" Job {job_id} was cancelled before starting.")
            return

        update_job(job_id, {"status": "PROCESSING"})
        time.sleep(1)

        # For Custom Scene: we still must include aspect ratio guidance to respect the size choice.
        final_prompt = (prompt or "").strip()
        
        ratio_instructions = {
            "1:1": "Aspect ratio 1:1 (square).",
            "9:16": "Aspect ratio 9:16 (vertical).",
            "16:9": "Aspect ratio 16:9 (landscape).",
            "4:5": "Aspect ratio 4:5 (portrait).",
        }
        size_hint = ratio_instructions.get(aspect_ratio, ratio_instructions["9:16"])
        
        # Explicitly instruct the model to return ONLY the image, preventing wasteful output text tokens
        no_text_hint = "\nIMPORTANT: Generate ONLY the image. Do not output any descriptive text, explanations, or reasoning."
        
        if final_prompt:
            final_prompt = f"{final_prompt}\n{size_hint}{no_text_hint}"
        else:
            final_prompt = f"{size_hint}{no_text_hint}"

        parts = [{"text": final_prompt}]
        if input_image_b64:
            # Compress input image to reduce Gemini API token costs
            compressed_input = compress_image_b64(input_image_b64, max_size=1024, quality=80)
            parts.append({
                "inlineData": {
                    "mimeType": "image/jpeg",
                    "data": compressed_input
                }
            })
            
        if reference_images:
            for ref in reference_images:
                # Compress reference images to reduce input token costs
                compressed_ref = compress_image_b64(ref["b64"], max_size=1024, quality=75)
                parts.append({
                    "inlineData": {
                        "mimeType": "image/jpeg",
                        "data": compressed_ref
                    }
                })
                
        GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
        if not model_name: 
            model_name = "nano-banana-pro-preview"

        is_imagen = model_name.startswith("imagen")
        
        if is_imagen:
            URL = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predict?key={GEMINI_API_KEY}"
            payload = {
                "instances": [
                    {"prompt": final_prompt}
                ],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": aspect_ratio if aspect_ratio in ["1:1", "3:4", "4:3", "9:16", "16:9"] else "1:1",
                    "outputOptions": {
                        "mimeType": "image/jpeg"
                    }
                }
            }
        else:
            URL = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "contents": [
                    {
                        "parts": parts
                    }
                ],
                # Request image-only output modality to suppress extra descriptive text tokens.
                # responseModalities IMAGE tells the model to return the image without a text companion.
                # Note: responseMimeType "image/jpeg" is NOT supported here (causes 400).
                "generationConfig": {
                    "responseModalities": ["IMAGE"]
                }
            }
        
        r = None
        # Only retry on rate-limit (429) or network errors — NOT on 5xx server errors
        # because 5xx often means the model already processed the request (billed) and retrying doubles the cost.
        for attempt in range(2):
            try:
                print(f" Gemini API attempt {attempt + 1} for job {job_id}")
                r = requests.post(URL, json=payload, timeout=120)
                print(f" Gemini API response status: {r.status_code}")
                
                if r.status_code == 200:
                    print(f" Gemini API success for job {job_id}")
                    break
                    
                # Log error details
                error_text = r.text[:500] if r.text else "No error text"
                print(f" Gemini API error {r.status_code}: {error_text}")
                
                # Retry ONLY on 429 (rate limit) — safe, not billed on rate limit
                # Do NOT retry on 5xx: the model may have already processed & billed the request
                if r.status_code == 429:
                    if attempt == 0:
                        print(f" Rate limited (429). Retrying after 10 seconds...")
                        time.sleep(10)
                        continue
                        
                update_job(job_id, {"status": "FAILED", "error": f"Gemini API error {r.status_code}", "details": error_text})
                return
            except requests.Timeout:
                # Timeout means no response received — safe to retry once
                print(f" Gemini API timeout on attempt {attempt + 1}")
                if attempt == 0:
                    time.sleep(3)
                    continue
                raise
            except Exception as e:
                print(f" Gemini API request error: {e}")
                if attempt == 0:
                    time.sleep(3)
                    continue
                raise

        # Check if response is valid
        if not r or r.status_code != 200:
            error_msg = "No response from Gemini API"
            if r:
                error_msg = f"Gemini API returned status {r.status_code}: {r.text[:500]}"
            print(f" {error_msg}")
            update_job(job_id, {"status": "FAILED", "error": "Gemini API error", "details": error_msg})
            return

        data = r.json()
        print(f" Gemini API response data keys: {list(data.keys())}")
        
        try:
            if is_imagen:
                base64_img = data["predictions"][0]["bytesBase64"]
            else:
                base64_img = data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
            print(f" Successfully extracted image from API response")
            
            # Save image to Supabase Storage (persistent) or local static (fallback)
            static_filename = f"{job_id}.jpg"
            file_url = None
            raw = base64.b64decode(base64_img)
            
            # Try Firebase Storage first
            if storage_bucket:
                try:
                    blob = storage_bucket.blob(static_filename)
                    blob.upload_from_string(raw, content_type="image/jpeg")
                    blob.make_public()
                    file_url = blob.public_url
                    print(f" Gemini image saved to Firebase: {file_url}")
                except Exception as sup_err:
                    print(f" Firebase save failed for generated image: {sup_err}, using local")
            
            # Fallback: save locally
            if not file_url:
                static_path = os.path.join("static", static_filename)
                try:
                    with open(static_path, "wb") as f:
                        f.write(raw)
                    api_base = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
                    file_url = f"{api_base}/static/{static_filename}"
                    print(f" Gemini image saved locally: {static_path}")
                except Exception as save_error:
                    print(f" Failed to save image locally: {save_error}")
            # Check if cancelled mid-flight before saving and deducting credits
            job_doc = job_ref.get()
            # Check if cancelled mid-flight before saving and deducting credits
            job_doc = job_ref.get()
            if job_doc.exists and job_doc.to_dict().get("status") == "CANCELLED":
                print(f" Job {job_id} was cancelled mid-flight. Discarding result.")
                return

            update_payload = {
                "status": "COMPLETED",
                "prompt_used": final_prompt,
                "filename": f"{job_id}.jpg"
            }
            if file_url:
                update_payload["file_url"] = file_url
            update_job(job_id, update_payload)
            print(f" Job {job_id} completed successfully")
            # Deduct credits ONLY on success
            deduct_credits_on_success(job_id)
            
        except (KeyError, IndexError) as e:
            print(f" Failed to parse Gemini response: {e}")
            print(f" Response data: {data}")
            update_job(job_id, {"status": "FAILED", "error": "Unexpected response format from Gemini", "details": f"{str(e)} - Response: {str(data)[:500]}"})
            
    except requests.Timeout:
        print(f" Gemini API timeout for job {job_id}")
        update_job(job_id, {"status": "TIMEOUT", "error": "Nano Banana API Timeout."})
    except Exception as e:
        print(f" Unexpected error in process_gemini_job: {e}")
        import traceback
        traceback.print_exc()
        update_job(job_id, {"status": "FAILED", "error": "Server error", "details": str(e)})

# =========================
# 7) Video Journey Task
# =========================
def create_crossfade_video(images_b64, output_path, fps=30, transition_duration=2, hold_duration=3):
    try:
        # pyrefly: ignore [missing-import]
        import cv2
        # pyrefly: ignore [missing-import]
        import numpy as np
    except ImportError:
        print("Missing cv2 or numpy. Cannot generate video.")
        return False

    if not images_b64:
        return False

    imgs = []
    for b64 in images_b64:
        try:
            nparr = np.frombuffer(base64.b64decode(b64), np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is not None:
                imgs.append(img)
        except Exception as e:
            print("Failed to decode image:", e)

    if not imgs:
        return False

    # Resize all to match the first image
    h, w = imgs[0].shape[:2]
    # Ensure dimensions are even (required for most h264 codecs)
    w = w if w % 2 == 0 else w + 1
    h = h if h % 2 == 0 else h + 1
    
    resized_imgs = []
    for img in imgs:
        resized = cv2.resize(img, (w, h))
        resized_imgs.append(resized)
    imgs = resized_imgs

    fourcc = cv2.VideoWriter_fourcc(*'VP80')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    total_frames_hold = int(hold_duration * fps)
    total_frames_trans = int(transition_duration * fps)

    for i in range(len(imgs)):
        img = imgs[i]
        next_img = imgs[i+1] if i < len(imgs) - 1 else None

        # Hold frame with slow zoom in (Ken Burns Effect)
        for frame_idx in range(total_frames_hold):
            progress = frame_idx / float(total_frames_hold + total_frames_trans)
            zoom = 1.0 + 0.08 * progress  # 8% zoom over total duration
            M = cv2.getRotationMatrix2D((w/2.0, h/2.0), 0, zoom)
            zoomed_img = cv2.warpAffine(img, M, (w, h))
            out.write(zoomed_img)

        # Transition to next if exists
        if next_img is not None:
            for tf in range(total_frames_trans):
                alpha = tf / float(total_frames_trans)
                beta = 1.0 - alpha
                
                # Current image continues zooming out
                progress_1 = (total_frames_hold + tf) / float(total_frames_hold + total_frames_trans)
                zoom_1 = 1.0 + 0.08 * progress_1
                M1 = cv2.getRotationMatrix2D((w/2.0, h/2.0), 0, zoom_1)
                zoomed_current = cv2.warpAffine(img, M1, (w, h))
                
                # Next image starts zooming
                progress_2 = tf / float(total_frames_hold + total_frames_trans)
                zoom_2 = 1.0 + 0.08 * progress_2
                M2 = cv2.getRotationMatrix2D((w/2.0, h/2.0), 0, zoom_2)
                zoomed_next = cv2.warpAffine(next_img, M2, (w, h))

                blended = cv2.addWeighted(zoomed_next, alpha, zoomed_current, beta, 0.0)
                out.write(blended)

    out.release()
    return True

def generate_kling_jwt():
    # pyrefly: ignore [missing-import]
    import jwt
    import time
    import os
    ak = os.getenv("KLING_API_KEY", "")
    sk = os.getenv("KLING_SECRET_KEY", "")
    if not ak or not sk:
        raise Exception("KLING_API_KEY or KLING_SECRET_KEY is missing.")
    headers = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": ak,
        "exp": int(time.time()) + 1800,
        "nbf": int(time.time()) - 5
    }
    return jwt.encode(payload, sk, algorithm="HS256", headers=headers)

def process_video_journey(
    job_id: str,
    perspectives: List[str],
    custom_prompt: str,
    input_image_b64: Optional[str],
    mime_type: str,
    reference_images: Optional[list],
    aspect_ratio: str,
    model_name: Optional[str] = None,
):
    import time
    import requests
    import os

    try:
        # Check if cancelled before starting
        db_client = get_db()
        job_ref = db_client.collection('app_jobs').document(job_id)
        job_doc = job_ref.get()
        if job_doc.exists and job_doc.to_dict().get("status") == "CANCELLED":
            print(f" Video Job {job_id} was cancelled before starting.")
            return

        update_job(job_id, {"status": "PROCESSING"})
        update_job(job_id, {"message": "Initializing Kling AI video generation..."})

        # =========================
        # A) Kling API video generation (preferred, matches official quality)
        #    Supports end frame via `image_tail` on supported models/plans.
        # =========================
        # Handle multiple perspectives for the text prompt
        p_strings = []
        for p in perspectives:
            p_extra = PERSPECTIVES.get(p, "")
            if p_extra:
                p_strings.append(p_extra)
        
        custom_prompt_clean = (custom_prompt or "").strip()
        is_custom_scene_only = (
            len(perspectives) == 1 and (perspectives[0] or "").strip() == "Custom Scene"
        )

        # For Custom Scene: do NOT inject fixed prompt text.
        if is_custom_scene_only:
            prompt_text = custom_prompt_clean[:2500]
        else:
            prompt_parts = []
            if custom_prompt_clean:
                prompt_parts.append(custom_prompt_clean)
            prompt_parts.append(BASE_PROMPT)
            prompt_parts.extend(p_strings)
            prompt_parts.append(
                "highly detailed, ultra realistic, sharp, 8k, global illumination, trending on artstation, cinematic video"
            )
            final_prompt = " | ".join([p.strip() for p in prompt_parts if p.strip() and p != ""])
            prompt_text = final_prompt[:2500]  # Kling character limit
        
        token = generate_kling_jwt()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        kling_ar = "16:9"
        if aspect_ratio in ["16:9", "9:16", "1:1"]:
            kling_ar = aspect_ratio
            
        base_url = "https://api-singapore.klingai.com/v1/videos"

        def build_kling_payload(m_name: str):
            if input_image_b64:
                url_ep = f"{base_url}/image2video"
                pl = {
                    "model_name": m_name,
                    "image": input_image_b64,
                    "prompt": prompt_text,
                }
                if reference_images:
                    tail_b64 = None
                    for ref in reference_images:
                        b64_val = (ref or {}).get("b64")
                        if b64_val:
                            tail_b64 = b64_val
                            break
                    if tail_b64:
                        pl["image_tail"] = tail_b64
                        pl["mode"] = "pro"  #       start/end frame
                return pl, url_ep
            else:
                return {
                    "model_name": m_name,
                    "prompt": prompt_text,
                    "aspect_ratio": kling_ar
                }, f"{base_url}/text2video"

        model_to_use = (model_name or "").strip() or os.getenv("KLING_VIDEO_MODEL", "kling-v2-6")
        payload, url = build_kling_payload(model_to_use)

        r = requests.post(url, headers=headers, json=payload, timeout=60)
        r_json = r.json()

        #             (image_tail)
        if (r.status_code != 200 or r_json.get("code") != 0):
            err_msg = r_json.get("message", str(r_json))
            if "model_name" in err_msg.lower() and "invalid" in err_msg.lower():
                model_to_use = os.getenv("KLING_VIDEO_MODEL_FALLBACK", "kling-v1-1")
                payload, url = build_kling_payload(model_to_use)
                r = requests.post(url, headers=headers, json=payload, timeout=60)
                r_json = r.json()

        if r.status_code != 200 or r_json.get("code") != 0:
            err_msg = r_json.get('message', str(r_json))
            if r.status_code == 429 or "balance" in err_msg.lower():
                raise Exception("Kling AI Error: Account balance not enough.")
            raise Exception(f"API Error: {err_msg}")

        task_id = r_json.get("data", {}).get("task_id")
        if not task_id:
            raise Exception("No task_id returned from Kling API")

        update_job(job_id, {"message": "Video generation started..."})
        update_job(job_id, {"kling_task_id": task_id})

        # Polling
        poll_url = f"{url}/{task_id}"
        
        max_attempts = 120  # up to 10 minutes (5 sec intervals)
        attempts = 0
        video_url = None
        
        while attempts < max_attempts:
            # Check if cancelled mid-flight
            job_doc = job_ref.get()
            if job_doc.exists and job_doc.to_dict().get("status") == "CANCELLED":
                print(f" Video Job {job_id} was cancelled mid-flight. Discarding result.")
                return

            time.sleep(5)
            attempts += 1
            # Refresh token to avoid expiration
            headers["Authorization"] = f"Bearer {generate_kling_jwt()}"
            
            try:
                p_res = requests.get(poll_url, headers=headers, timeout=30)
                p_data = p_res.json()
                
                if p_res.status_code != 200 or p_data.get("code") != 0:
                    continue
                    
                task_status = p_data.get("data", {}).get("task_status", "").lower()
                
                if task_status in ["succeed", "completed"]:
                    videos = p_data.get("data", {}).get("task_result", {}).get("videos", [])
                    if videos:
                        video_url = videos[0].get("url")
                    break
                elif task_status in ["failed", "error"]:
                    task_error = p_data.get("data", {}).get("task_status_msg", "Unknown error")
                    raise Exception(f"Task failed: {task_error}")
                
                update_job(job_id, {"message": f"Video generating... (Status: {task_status})"})
            except Exception as e:
                if "failed" in str(e).lower():
                    raise e
                pass # silently retry on network errors during polling
                
        if not video_url:
            raise Exception("Timeout waiting for Kling API video.")

        # Download the video
        video_filename = f"{job_id}.mp4"
        video_path = os.path.join("static", video_filename)
        
        update_job(job_id, {"message": "Downloading generated video..."})
        v_res = requests.get(video_url, stream=True, timeout=60)
        v_res.raise_for_status()
        
        # Read video content
        video_content = b""
        with open(video_path, "wb") as f:
            for chunk in v_res.iter_content(chunk_size=8192):
                video_content += chunk
                f.write(chunk)

        # Try to upload to Firebase Storage
        final_video_url = None
        if storage_bucket:
            try:
                blob = storage_bucket.blob(video_filename)
                blob.upload_from_string(video_content, content_type="video/mp4")
                blob.make_public()
                final_video_url = blob.public_url
                print(f" Video saved to Firebase: {final_video_url}")
            except Exception as sup_err:
                print(f" Firebase video upload failed: {sup_err}, using local URL")

        # Fallback to local URL
        if not final_video_url:
            api_base = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
            final_video_url = f"{api_base}/static/{video_filename}"
            print(f" Video saved locally: {video_path}")

        update_job(job_id, {
            "status": "COMPLETED",
            "file_url": final_video_url,
            "filename": video_filename,
        })
        print(f" Video job {job_id} completed successfully")
        # Deduct credits ONLY on success
        deduct_credits_on_success(job_id)

    except Exception as e:
        update_job(job_id, {"status": "FAILED", "error": "Journey generation failed via Kling", "details": str(e)})
        print(f" Video job {job_id} failed - credits NOT deducted")


# =========================
# 8) Endpoints: generate & status
# =========================
@app.post("/generate")
async def generate(
    background_tasks: BackgroundTasks,
    perspective: List[str] = Form(...),
    custom_prompt: str = Form(""),
    denoise: float = Form(0.75),
    aspect_ratio: List[str] = Form(["9:16"]),
    image_count: List[Any] = Form([1]),
    is_video: bool = Form(False),
    model_name: List[str] = Form(["nano-banana-pro-preview"]),
    duration: Optional[str] = Form(None),
    resolution: Optional[str] = Form(None),
    generateAudio: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    refs: List[UploadFile] = File(None),
    authorization: Optional[str] = Header(None),
    app_card_id: Optional[str] = Form(None),
):
    try:
        # --- Credit check & deduction ---
        token = extract_bearer_token(authorization)
        user = get_user_from_token(token) if token else None
        if not user:
            return JSONResponse(
                status_code=401,
                content={"ok": False, "error": "Authentication required"},
            )

        # Calculate total images to generate
        total_images = 0
        if not is_video:
            for idx in range(len(perspective)):
                raw_c = image_count[idx] if idx < len(image_count) else 1
                try:
                    c = max(1, min(int(raw_c) if raw_c not in (None, "") else 1, 10))
                except (TypeError, ValueError):
                    c = 1
                total_images += c

        # Get credit costs from DB (cached)
        costs = get_credit_costs_map()

        cost_per_image = costs.get("image_generation", 1)
        has_refs = refs and any(r.filename for r in refs)
        total_cost = resolve_generation_cost(
            is_video=is_video,
            total_images=total_images,
            has_refs=has_refs,
            app_card_id=app_card_id,
            costs=costs,
        )

        # Validate credits but DO NOT deduct yet - deduction happens on success
        if user:
            user_credits = user.get("credits", 0) or 0
            if user_credits < total_cost:
                return JSONResponse(
                    status_code=402,
                    content={
                        "ok": False,
                        "error": "insufficient_credits",
                        "message": f"Not enough credits. Required: {total_cost}, Available: {user_credits}",
                        "required": total_cost,
                        "available": user_credits
                    }
                )
        input_image_b64 = None
        mime_type = "image/png"
        if file is not None:
            content = await file.read()
            if content:
                upload_error = validate_image_upload(content, file.content_type)
                if upload_error:
                    return JSONResponse(status_code=400, content={"ok": False, "error": upload_error})
                input_image_b64 = base64.b64encode(content).decode("utf-8")
                mime_type = file.content_type or "image/png"
                
        reference_images = []
        if refs:
            for r in refs:
                if r.filename:
                    r_content = await r.read()
                    if r_content:
                        upload_error = validate_image_upload(r_content, r.content_type)
                        if upload_error:
                            return JSONResponse(status_code=400, content={"ok": False, "error": upload_error})
                        r_b64 = base64.b64encode(r_content).decode("utf-8")
                        r_mime = r.content_type or "image/png"
                        reference_images.append({"b64": r_b64, "mime_type": r_mime})

        job_ids = []
        base_time = int(time.time() * 1000)

        if is_video:
            job_id = f"journey_{base_time}"
            video_perspective = perspective[0] if perspective else "Custom Scene"
            video_ar = aspect_ratio[0] if len(aspect_ratio) > 0 else "9:16"
            create_job({
                "job_id": job_id,
                "status": "IN_QUEUE",
                "message": "Initializing Video Journey...",
                "perspective": video_perspective,
                "is_video": True,
                "aspect_ratio": video_ar,
                "_user_id": user["id"] if user else None,
                "_credit_cost": total_cost,
            })
            background_tasks.add_task(
                process_video_journey,
                job_id,
                perspective,
                custom_prompt,
                input_image_b64,
                mime_type,
                reference_images,
                video_ar,
                model_name[0] if len(model_name) > 0 else "nano-banana-pro-preview",
            )
            job_ids.append(job_id)
        else:
            for idx, p in enumerate(perspective):
                prompt = build_prompt(p, custom_prompt)
                
                ar = aspect_ratio[idx] if idx < len(aspect_ratio) else "9:16"
                raw_c = image_count[idx] if idx < len(image_count) else 1
                try:
                    c = max(1, min(int(raw_c) if raw_c not in (None, "") else 1, 10))
                except (TypeError, ValueError):
                    c = 1
                
                for c_idx in range(c):
                    job_id = f"gemini_{base_time}_{idx}_{c_idx}"
                    
                    # Store cost_per_image (not total_cost) so each job deducts only its own share.
                    # total_cost is the sum for ALL images; storing it per job would multiply deductions.
                    create_job({
                        "job_id": job_id,
                        "status": "IN_QUEUE",
                        "perspective": p,
                        "aspect_ratio": ar,
                        "_user_id": user["id"] if user else None,
                        "_credit_cost": cost_per_image,  # Fixed: was total_cost (caused N×N credit deductions)
                    })
                    
                    #     
                    background_tasks.add_task(
                        process_gemini_job,
                        job_id,
                        prompt,
                        input_image_b64,
                        mime_type,
                        reference_images,
                        ar,
                        p,
                        model_name[idx] if idx < len(model_name) else (model_name[0] if len(model_name) > 0 else "nano-banana-pro-preview")
                    )
                    job_ids.append(job_id)
        
        #    
        return {
            "ok": True,
            "job_ids": job_ids,
            "status": "IN_QUEUE",
            "message": "Jobs successfully queued. Please check status periodically."
        }

    except Exception as e:
        print(f"Generate error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to create jobs"},
        )

@app.get("/estimate-cost")
def estimate_cost(
    is_video: bool = False,
    image_count: int = 1,
    perspective_count: int = 1,
):
    """Get estimated credit cost before generation."""
    image_count = max(1, min(image_count, 100))
    perspective_count = max(1, min(perspective_count, 20))
    costs_raw = get_credit_costs_map()
    costs = {
        op: {"cost": cost, "label": op.replace("_", " ").title()}
        for op, cost in costs_raw.items()
    }

    if is_video:
        total = costs_raw.get("video_generation", 5)
        return {"ok": True, "total_cost": total, "breakdown": {"video": total}, "costs": costs}
    cost_per_image = costs_raw.get("image_generation", 1)
    total = cost_per_image * image_count * perspective_count
    return {
        "ok": True,
        "total_cost": total,
        "breakdown": {
            "per_image": cost_per_image,
            "images": image_count,
            "perspectives": perspective_count,
        },
        "costs": costs,
    }


@app.get("/status/{job_id}")
def check_status(job_id: str, authorization: Optional[str] = Header(None)):
    token = extract_bearer_token(authorization)
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    job = get_job(job_id)
    if not job:
        return JSONResponse(
            status_code=404,
            content={"error": "Job not found", "status": "FAILED"},
        )
    if not user_can_access_job(user, job):
        return JSONResponse(status_code=403, content={"ok": False, "error": "Access denied"})
    return sanitize_job_response(job, user)

@app.get("/status-stream")
async def check_status_stream(job_ids: str, authorization: Optional[str] = Header(None)):
    """
    SSE endpoint to monitor multiple jobs.
    `job_ids` should be comma-separated.
    """
    token = extract_bearer_token(authorization)
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})

    jids = [jid.strip() for jid in job_ids.split(",") if jid.strip()][:20]
    if not jids:
        return JSONResponse(status_code=400, content={"ok": False, "error": "No job IDs provided"})

    for jid in jids:
        job = get_job(jid)
        if job and not user_can_access_job(user, job):
            return JSONResponse(status_code=403, content={"ok": False, "error": "Access denied"})
    
    async def event_stream():
        import json
        import asyncio
        completed = set()
        while len(completed) < len(jids):
            updates = []
            for jid in jids:
                if jid in completed:
                    continue
                job = await asyncio.to_thread(get_job, jid)
                if job:
                    if not user_can_access_job(user, job):
                        updates.append({"job_id": jid, "status": "FAILED", "error": "Access denied"})
                        completed.add(jid)
                        continue
                    updates.append(sanitize_job_response(job, user))
                    if job["status"] in ["COMPLETED", "FAILED", "TIMEOUT", "CANCELLED"]:
                        completed.add(jid)
                else:
                    updates.append({"job_id": jid, "status": "FAILED", "error": "Job not found"})
                    completed.add(jid)
            
            if updates:
                yield f"data: {json.dumps(updates)}\n\n"
            
            if len(completed) == len(jids):
                break
                
            await asyncio.sleep(2)
            
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
