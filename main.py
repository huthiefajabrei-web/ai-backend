import os
import time
import base64
import uuid
import hashlib
import secrets
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv()

import requests
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# =========================
# SQLite Database Layer
# (MySQL server not required - SQLite is built into Python)
# =========================
# MYSQL CODE - معلّق مؤقتاً (لم يُحذف، يمكن إعادة تفعيله عند تثبيت MySQL server)
# try:
#     import mysql.connector
#     from mysql.connector import pooling
# except ImportError:
#     pass
# MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
# MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
# ...etc

import psycopg2
import psycopg2.extras
import threading

# URL-encode special chars in password so psycopg2 can parse the URI correctly
from urllib.parse import quote_plus

DATABASE_URL = os.getenv("DATABASE_URL", "")
_db_lock = threading.Lock()

def get_db():
    """Return a new PostgreSQL connection with RealDict cursor support."""
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn

def _execute(conn, sql: str, params=None):
    """Helper: execute a single SQL statement via a cursor, return cursor."""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(sql, params or ())
    return cur

def init_mysql_tables():
    """Create PostgreSQL tables if they don't exist."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          TEXT PRIMARY KEY,
            email       TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name   TEXT,
            created_at  TEXT DEFAULT (now()::text)
        )""")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id                  TEXT PRIMARY KEY,
            user_id             TEXT NOT NULL,
            title               TEXT,
            resps               TEXT,
            parent_session_id   TEXT,
            created_at          TEXT DEFAULT (now()::text),
            updated_at          TEXT DEFAULT (now()::text)
        )""")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS auth_tokens (
            token       TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            expires_at  TEXT NOT NULL
        )""")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS app_tools (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            description TEXT,
            icon        TEXT,
            action_id   TEXT,
            created_at  TEXT DEFAULT (now()::text)
        )""")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS app_cards (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            description TEXT,
            image_url   TEXT,
            category    TEXT,
            action_id   TEXT,
            created_at  TEXT DEFAULT (now()::text)
        )""")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS app_plans (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            price       REAL NOT NULL,
            credits     INTEGER NOT NULL,
            period      TEXT DEFAULT 'mo',
            features    TEXT,
            is_popular  INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (now()::text)
        )""")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS app_hero (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            description TEXT,
            image_url   TEXT NOT NULL,
            action_id   TEXT DEFAULT 'generation',
            created_at  TEXT DEFAULT (now()::text)
        )""")
        cur.execute("""
        CREATE TABLE IF NOT EXISTS app_prompts (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            prompt_text TEXT NOT NULL,
            type        TEXT NOT NULL,
            created_at  TEXT DEFAULT (now()::text)
        )""")
        conn.commit()

        # Seed tools if empty
        cur.execute("SELECT COUNT(*) as cnt FROM app_tools")
        if cur.fetchone()["cnt"] == 0:
            cur.execute("""INSERT INTO app_tools (id, title, description, icon, action_id) VALUES
                ('t1','AI Image Generation','Generate stunning interior and exterior designs from text prompts or reference images.','Wand2','generation'),
                ('t2','Image to Video','Transform static designs into immersive walkthrough videos with cutting-edge AI.','Video','generation'),
                ('t3','AI Upscaling','Enhance image quality up to 16x with Magnific AI for print-ready results.','ZoomIn','generation')""")
            cur.execute("""INSERT INTO app_cards (id, title, description, image_url, category, action_id) VALUES
                ('a1','Shot to CAD Board','Transform architectural photographs into professional CAD board layouts with plans.','https://images.unsplash.com/photo-1628169222588-444a1eb405d4?w=500&q=80','Architecture','generation'),
                ('a2','Shot to Physical Model','Transform buildings into miniature white 3D printed architectural models on a display base.','https://images.unsplash.com/photo-1518384401463-d3876163c195?w=500&q=80','Architecture','generation'),
                ('a3','Model to Full Scene','Transform 3D models or renders into fully realized architectural scenes with environment.','https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=500&q=80','Architecture','generation'),
                ('a4','Multiple Angles','Generate multiple perspective views of a building from different angles seamlessly.','https://images.unsplash.com/photo-1545083036-728b9fb6f827?w=500&q=80','Architecture','generation')""")
            cur.execute("""INSERT INTO app_plans (id, name, price, credits, period, features, is_popular) VALUES
                ('p1','Starter',19.99,100,'mo','["100 AI Generations","Standard Resolution","Community Support","Basic Styles"]',0),
                ('p2','Pro',49.99,500,'mo','["500 AI Generations","High Resolution (4K)","Priority Support","All Architectural Styles","Video Generation"]',1),
                ('p3','Studio',199.99,3000,'mo','["3000 AI Generations","Ultra Resolution (8K)","24/7 Dedicated Support","Custom Model Training","API Access"]',0)""")
            conn.commit()

        # Seed hero if empty
        cur.execute("SELECT COUNT(*) as cnt FROM app_hero")
        if cur.fetchone()["cnt"] == 0:
            cur.execute("""INSERT INTO app_hero (id, title, description, image_url, action_id) VALUES
                ('h1','Modern Mansion','Transform exterior photographs into photorealistic architectural renders.','https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80','generation'),
                ('h2','Curved Architecture','Generate stunning architectural visualizations with full material and lighting control.','https://images.unsplash.com/photo-1613490908679-b3a5105220fa?w=800&q=80','generation'),
                ('h3','Interior Design','Create beautiful photorealistic interior renders from basic 3D models or photos.','https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80','generation')""")
            conn.commit()

        cur.close()
        print(f"✅ PostgreSQL tables ready (Supabase)")
    except Exception as e:
        print(f"❌ PostgreSQL init error: {e}")
        conn.rollback()
    finally:
        conn.close()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hashlib.sha256(password.encode()).hexdigest() == hashed

def create_token(user_id: str) -> str:
    token = secrets.token_hex(64)
    expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (%s, %s, %s)",
            (token, user_id, expires_at)
        )
        conn.commit()
        cur.close()
    finally:
        conn.close()
    return token

def get_user_from_token(token: str) -> Optional[dict]:
    if not token:
        return None
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        now = datetime.utcnow().isoformat()
        cur.execute("""
            SELECT u.id, u.email, u.full_name, u.created_at
            FROM auth_tokens t
            JOIN users u ON t.user_id = u.id
            WHERE t.token = %s AND t.expires_at > %s
        """, (token, now))
        row = cur.fetchone()
        cur.close()
        return dict(row) if row else None
    except Exception as e:
        print(f"❌ get_user_from_token error: {e}")
        return None
    finally:
        conn.close()

import json as json_lib

def serialize_dates(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

os.makedirs("static", exist_ok=True)

def migrate_db():
    """No-op for PostgreSQL: schema is managed by init_mysql_tables."""
    pass


# ذاكرة مؤقتة لتخزين حالة المهام
jobs: Dict[str, dict] = {}

# =========================
# 1) إعدادات RunPod
# =========================
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "").strip()
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID", "").strip()

if not RUNPOD_API_KEY:
    # مهم: الأفضل تخلي المفتاح في .env أو Environment Variables
    # وما تكتبه داخل الكود
    print("⚠️ RUNPOD_API_KEY is empty. Set it in environment variables.")

RUN_URL = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/run"
STATUS_URL = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status"  # + /{job_id}

# =========================
# 2) تطبيق FastAPI + CORS
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
async def on_startup():
    init_mysql_tables()
    # Seed app_prompts if empty
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT COUNT(*) as cnt FROM app_prompts")
        if cur.fetchone()["cnt"] == 0:
            for k, v in PERSPECTIVES.items():
                if not v: continue
                ptype = 'Interior' if any(word in k.lower() for word in ['interior', 'room', 'kitchen', 'bathroom', 'office', 'lobby']) else 'Exterior'
                cur.execute(
                    "INSERT INTO app_prompts (id, title, prompt_text, type) VALUES (%s, %s, %s, %s)",
                    (str(uuid.uuid4()), k, v, ptype)
                )
            conn.commit()
        cur.close()
    finally:
        conn.close()


@app.get("/")
def root():
    return {"ok": True, "message": "AI backend is running", "docs": "/docs"}

@app.get("/health")
def health():
    return {"ok": True}

# =========================
# MySQL Auth Endpoints
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
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM users WHERE email = %s", (body.email,))
        if cur.fetchone():
            return JSONResponse(status_code=409, content={"ok": False, "error": "Email already registered"})
        uid = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO users (id, email, password_hash, full_name) VALUES (%s, %s, %s, %s)",
            (uid, body.email, hash_password(body.password), body.full_name)
        )
        conn.commit()
        cur.close()
        token = create_token(uid)
        return {
            "ok": True,
            "token": token,
            "user": {"id": uid, "email": body.email, "full_name": body.full_name}
        }
    except Exception as e:
        conn.rollback()
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


@app.post("/auth/login")
def auth_login(body: LoginBody):
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, email, password_hash, full_name FROM users WHERE email = %s", (body.email,))
        row = cur.fetchone()
        cur.close()
        if not row or not verify_password(body.password, row["password_hash"]):
            return JSONResponse(status_code=401, content={"ok": False, "error": "Invalid email or password"})
        user = dict(row)
        token = create_token(user["id"])
        return {
            "ok": True,
            "token": token,
            "user": {"id": user["id"], "email": user["email"], "full_name": user["full_name"]}
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


@app.post("/auth/logout")
def auth_logout(authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    if not token:
        return {"ok": True}
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM auth_tokens WHERE token = %s", (token,))
        conn.commit()
        cur.close()
    finally:
        conn.close()
    return {"ok": True}


@app.get("/auth/me")
def auth_me(authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    return {"ok": True, "user": {
        "id": user["id"],
        "email": user["email"],
        "full_name": user.get("full_name"),
    }}

# =========================
# SQLite Sessions Endpoints
# =========================

@app.get("/sessions")
def get_sessions(authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, user_id, title, resps, parent_session_id, created_at, updated_at
            FROM user_sessions WHERE user_id = %s ORDER BY updated_at DESC
        """, (user["id"],))
        rows = cur.fetchall()
        cur.close()
        result = []
        for r in rows:
            d = dict(r)
            d["resps"] = json_lib.loads(d["resps"]) if d["resps"] else {}
            result.append(d)
        return {"ok": True, "data": result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


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
    conn = get_db()
    try:
        sid = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO user_sessions (id, user_id, title, resps, parent_session_id, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (sid, user["id"], body.title, json_lib.dumps(body.resps or {}), body.parent_session_id, now, now))
        conn.commit()
        cur.close()
        return {"ok": True, "data": {
            "id": sid, "user_id": user["id"], "title": body.title,
            "resps": body.resps or {}, "parent_session_id": body.parent_session_id,
            "created_at": now, "updated_at": now,
        }}
    except Exception as e:
        conn.rollback()
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


class SessionUpdateBody(BaseModel):
    title: Optional[str] = None
    resps: Optional[dict] = None

@app.patch("/sessions/{session_id}")
def update_session(session_id: str, body: SessionUpdateBody, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM user_sessions WHERE id = %s AND user_id = %s", (session_id, user["id"]))
        if not cur.fetchone():
            return JSONResponse(status_code=404, content={"ok": False, "error": "Session not found"})
        fields, values = [], []
        if body.title is not None:
            fields.append("title = %s"); values.append(body.title)
        if body.resps is not None:
            fields.append("resps = %s"); values.append(json_lib.dumps(body.resps))
        fields.append("updated_at = %s"); values.append(datetime.utcnow().isoformat())
        values.append(session_id)
        cur.execute(f"UPDATE user_sessions SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()
        cur.close()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM user_sessions WHERE id = %s AND user_id = %s", (session_id, user["id"]))
        conn.commit()
        cur.close()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


# =========================
# Admin & Public Content Endpoints
# =========================

@app.get("/admin/stats")
def get_admin_stats():
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT COUNT(*) as cnt FROM users")
        users_count = cur.fetchone()["cnt"]
        cur.execute("SELECT COUNT(*) as cnt FROM user_sessions")
        sessions_count = cur.fetchone()["cnt"]
        cur.close()
        return {"ok": True, "stats": {"users": users_count, "sessions": sessions_count}}
    finally:
        conn.close()


@app.get("/content/{content_type}")
def get_content(content_type: str):
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if content_type == "tools":
            cur.execute("SELECT * FROM app_tools ORDER BY created_at ASC")
        elif content_type == "apps":
            cur.execute("SELECT * FROM app_cards ORDER BY created_at ASC")
        elif content_type == "plans":
            cur.execute("SELECT * FROM app_plans ORDER BY price ASC")
        elif content_type == "hero":
            cur.execute("SELECT * FROM app_hero ORDER BY created_at ASC")
        elif content_type == "prompts":
            cur.execute("SELECT * FROM app_prompts ORDER BY type ASC, created_at ASC")
        else:
            return JSONResponse(status_code=400, content={"ok": False, "error": "Invalid type"})
        rows = cur.fetchall()
        cur.close()
        result = []
        for r in rows:
            d = dict(r)
            if content_type == "plans" and d.get("features"):
                try: d["features"] = json_lib.loads(d["features"])
                except: d["features"] = []
            result.append(d)
        return {"ok": True, "data": result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


class ContentUpdateBody(BaseModel):
    id: Optional[str] = None
    data: dict

@app.post("/content/{content_type}")
def modify_content(content_type: str, body: ContentUpdateBody, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    conn = get_db()
    try:
        item_id = body.id or str(uuid.uuid4())
        d = body.data
        cur = conn.cursor()
        if content_type == "tools":
            cur.execute("""
                INSERT INTO app_tools (id, title, description, icon, action_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                title=EXCLUDED.title, description=EXCLUDED.description, icon=EXCLUDED.icon, action_id=EXCLUDED.action_id
            """, (item_id, d.get("title",""), d.get("description",""), d.get("icon",""), d.get("action_id","generation")))
        elif content_type == "apps":
            cur.execute("""
                INSERT INTO app_cards (id, title, description, image_url, category, action_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                title=EXCLUDED.title, description=EXCLUDED.description, image_url=EXCLUDED.image_url, category=EXCLUDED.category, action_id=EXCLUDED.action_id
            """, (item_id, d.get("title",""), d.get("description",""), d.get("image_url",""), d.get("category",""), d.get("action_id","generation")))
        elif content_type == "plans":
            features = json_lib.dumps(d.get("features",[])) if isinstance(d.get("features"), list) else d.get("features","[]")
            cur.execute("""
                INSERT INTO app_plans (id, name, price, credits, period, features, is_popular)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                name=EXCLUDED.name, price=EXCLUDED.price, credits=EXCLUDED.credits, period=EXCLUDED.period, features=EXCLUDED.features, is_popular=EXCLUDED.is_popular
            """, (item_id, d.get("name",""), float(d.get("price",0)), int(d.get("credits",0)), d.get("period","mo"), features, int(d.get("is_popular",0))))
        elif content_type == "hero":
            cur.execute("""
                INSERT INTO app_hero (id, title, description, image_url, action_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                title=EXCLUDED.title, description=EXCLUDED.description, image_url=EXCLUDED.image_url, action_id=EXCLUDED.action_id
            """, (item_id, d.get("title",""), d.get("description",""), d.get("image_url",""), d.get("action_id","generation")))
        elif content_type == "prompts":
            cur.execute("""
                INSERT INTO app_prompts (id, title, prompt_text, type)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, type=EXCLUDED.type
            """, (item_id, d.get("title",""), d.get("prompt_text",""), d.get("type","Exterior")))
        else:
            cur.close()
            return JSONResponse(status_code=400, content={"ok": False, "error": "Invalid type"})
        conn.commit()
        cur.close()
        return {"ok": True, "id": item_id}
    except Exception as e:
        conn.rollback()
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


@app.delete("/content/{content_type}/{item_id}")
def delete_content(content_type: str, item_id: str, authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    conn = get_db()
    try:
        cur = conn.cursor()
        if content_type == "tools":
            cur.execute("DELETE FROM app_tools WHERE id = %s", (item_id,))
        elif content_type == "apps":
            cur.execute("DELETE FROM app_cards WHERE id = %s", (item_id,))
        elif content_type == "plans":
            cur.execute("DELETE FROM app_plans WHERE id = %s", (item_id,))
        elif content_type == "hero":
            cur.execute("DELETE FROM app_hero WHERE id = %s", (item_id,))
        elif content_type == "prompts":
            cur.execute("DELETE FROM app_prompts WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        conn.close()


@app.post("/admin/upload-image")
async def admin_upload_image(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    token = (authorization or "").replace("Bearer ", "").strip()
    user = get_user_from_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    
    try:
        content = await file.read()
        ext = file.filename.split('.')[-1] if file.filename and '.' in file.filename else 'jpg'
        filename = f"uploaded_{int(time.time())}_{uuid.uuid4().hex[:6]}.{ext}"
        filepath = os.path.join("static", filename)
        with open(filepath, "wb") as f:
            f.write(content)
            
        api_base = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
        file_url = f"{api_base}/static/{filename}"
        return {"ok": True, "url": file_url}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

# =========================
# 3) Prompt Templates
# =========================
BASE_PROMPT = """
professional architectural visualization, accurate proportions, realistic geometry
""".strip()

NEG_PROMPT = """
top view, floor plan, blueprint, layout drawing, 2D plan, interior plan, cutaway, dollhouse view, isometric plan, schematic drawing, low quality, blurry, distorted geometry, bad proportions, warped, deformed, cartoon, unrealistic materials, noise, messy lines
""".strip()

# نموذج Kling لتوليد الفيديو. api-singapore يقبل: kling-v2-6 أو kling-v1-1 (حسب الحزمة/المنطقة)
KLING_VIDEO_MODEL = os.getenv("KLING_VIDEO_MODEL", "kling-v2-6")
# نموذج احتياطي عند رفض النموذج الأساسي (مثلاً مناطق مثل اليمن قد تدعم v1 فقط)
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
    الهدف: جعل `Custom Scene` يتبع نص المستخدم قدر الإمكان.
    لباقي الأنماط نُبقي قالب المعمار + الستايل كما كان.
    """
    custom = (custom or "").strip()

    # Custom Scene must be driven ONLY by the user's prompt (no fixed template text).
    if perspective == "Custom Scene":
        return custom

    # Fetch from SQLite database
    conn = get_db()
    extra = ""
    try:
        row = conn.execute("SELECT prompt_text FROM app_prompts WHERE title = ?", (perspective,)).fetchone()
        if row:
            extra = row["prompt_text"]
        else:
            extra = PERSPECTIVES.get(perspective, "")
    except Exception:
        extra = PERSPECTIVES.get(perspective, "")
    finally:
        conn.close()

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
    يحاول يطلع أول صورة من:
    - final.output.images[0].data (base64)
    - أو final.output.files[0].url (لملف خارجي) ويقوم بجلبه وتحويله الى base64
    """
    import base64

    output = final.get("output") or {}
    # 1) صور مضمّنة كـ base64
    images = output.get("images") or []
    if images:
        first = images[0] or {}
        b64 = first.get("data") or first.get("b64") or ""
        filename = first.get("filename") or "result.png"
        if b64:
            data_url = f"data:image/png;base64,{b64}"
            return {"image_base64": b64, "image_data_url": data_url, "filename": filename}

    # 2) ملفات خارجية (url)
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
        jobs[job_id]["status"] = "PROCESSING"
        time.sleep(1)

        # For Custom Scene: do NOT add any fixed text beyond what user typed.
        # For other perspectives: we may include aspect ratio guidance to reduce odd cropping.
        final_prompt = (prompt or "").strip()
        if (perspective or "").strip() != "Custom Scene":
            ratio_instructions = {
                "1:1": "Aspect ratio 1:1 (square).",
                "9:16": "Aspect ratio 9:16 (vertical).",
                "16:9": "Aspect ratio 16:9 (landscape).",
                "4:5": "Aspect ratio 4:5 (portrait).",
            }
            size_hint = ratio_instructions.get(aspect_ratio, ratio_instructions["9:16"])
            if final_prompt:
                final_prompt = f"{final_prompt}\n{size_hint}"
            else:
                final_prompt = size_hint

        parts = [{"text": final_prompt}]
        if input_image_b64:
            parts.append({
                "inlineData": {
                    "mimeType": mime_type,
                    "data": input_image_b64
                }
            })
            
        if reference_images:
            for ref in reference_images:
                parts.append({
                    "inlineData": {
                        "mimeType": ref["mime_type"],
                        "data": ref["b64"]
                    }
                })
                
        payload = {
            "contents": [
                {
                    "parts": parts
                }
            ]
        }
        
        GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
        if not model_name: 
            model_name = "nano-banana-pro-preview"
        URL = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        
        r = None
        for attempt in range(2):
            try:
                r = requests.post(URL, json=payload, timeout=120)
                if r.status_code == 200:
                    break
                if r.status_code in (429,) or (500 <= r.status_code < 600):
                    if attempt == 0:
                        time.sleep(5)
                        continue
                jobs[job_id] = {
                    "ok": False,
                    "status": "FAILED",
                    "error": "Gemini API error",
                    "details": (r.text[:500] if r.text else str(r.status_code)) if r else "No response"
                }
                return
            except requests.Timeout:
                if attempt == 0:
                    time.sleep(3)
                    continue
                raise

        data = r.json()
        try:
            base64_img = data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
            # Save image to static so file_url persists after DB save (frontend strips base64)
            static_filename = f"{job_id}.jpg"
            static_path = os.path.join("static", static_filename)
            try:
                raw = base64.b64decode(base64_img)
                with open(static_path, "wb") as f:
                    f.write(raw)
            except Exception:
                pass  # keep image_data_url for in-session display if static write fails
            api_base = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
            file_url = f"{api_base}/static/{static_filename}" if os.path.isfile(static_path) else None
            current_job = jobs.get(job_id, {})
            update_payload = {
                "ok": True,
                "status": "COMPLETED",
                "prompt_used": final_prompt,
                "image_base64": base64_img,
                "image_data_url": f"data:image/jpeg;base64,{base64_img}",
                "filename": f"{job_id}.jpg"
            }
            if file_url:
                update_payload["file_url"] = file_url
            current_job.update(update_payload)
            jobs[job_id] = current_job
        except (KeyError, IndexError) as e:
            jobs[job_id] = {
                "ok": False,
                "status": "FAILED",
                "error": "Unexpected response format from Gemini",
                "details": str(e)
            }
            
    except requests.Timeout:
        jobs[job_id] = {
            "ok": False,
            "status": "TIMEOUT",
            "error": "Nano Banana API Timeout."
        }
    except Exception as e:
        jobs[job_id] = {
            "ok": False,
            "status": "FAILED",
            "error": "Server error",
            "details": str(e)
        }

# =========================
# 7) Video Journey Task
# =========================
def create_crossfade_video(images_b64, output_path, fps=30, transition_duration=2, hold_duration=3):
    try:
        import cv2
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

def process_video_journey(job_id: str, perspectives: List[str], custom_prompt: str, input_image_b64: Optional[str], mime_type: str, reference_images: Optional[list], aspect_ratio: str):
    import time
    import requests
    import os

    try:
        jobs[job_id]["status"] = "PROCESSING"
        jobs[job_id]["message"] = "Initializing Kling AI video generation..."

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
                        pl["mode"] = "pro"  # مطلوب إجبارياً عند استخدام صورة نهاية start/end frame
                return pl, url_ep
            else:
                return {
                    "model_name": m_name,
                    "prompt": prompt_text,
                    "aspect_ratio": kling_ar
                }, f"{base_url}/text2video"

        model_to_use = os.getenv("KLING_VIDEO_MODEL", "kling-v2-6")
        payload, url = build_kling_payload(model_to_use)

        r = requests.post(url, headers=headers, json=payload, timeout=60)
        r_json = r.json()

        # إرجاع محاولة النموذج الاحتياطي لو النموذج الأساسي غير متوفر مع إبقاء المعطيات (image_tail)
        if (r.status_code != 200 or r_json.get("code") != 0):
            err_msg = r_json.get("message", str(r_json))
            if "model_name" in err_msg.lower() and "invalid" in err_msg.lower():
                model_to_use = os.getenv("KLING_VIDEO_MODEL_FALLBACK", "kling-v1")
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

        jobs[job_id]["message"] = "Video generation started..."
        jobs[job_id]["kling_task_id"] = task_id

        # Polling
        poll_url = f"{url}/{task_id}"
        
        max_attempts = 120  # up to 10 minutes (5 sec intervals)
        attempts = 0
        video_url = None
        
        while attempts < max_attempts:
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
                
                jobs[job_id]["message"] = f"Video generating... (Status: {task_status})"
            except Exception as e:
                if "failed" in str(e).lower():
                    raise e
                pass # silently retry on network errors during polling
                
        if not video_url:
            raise Exception("Timeout waiting for Kling API video.")

        # Download the video
        video_filename = f"{job_id}.mp4"
        video_path = os.path.join("static", video_filename)
        
        jobs[job_id]["message"] = "Downloading generated video..."
        v_res = requests.get(video_url, stream=True, timeout=60)
        v_res.raise_for_status()
        with open(video_path, "wb") as f:
            for chunk in v_res.iter_content(chunk_size=8192):
                f.write(chunk)

        current_job = jobs.get(job_id, {})
        current_job.update({
            "ok": True,
            "status": "COMPLETED",
            "is_video": True,
            "file_url": f"http://127.0.0.1:8000/static/{video_filename}",
            "filename": video_filename,
        })
        jobs[job_id] = current_job

    except Exception as e:
        jobs[job_id] = {
            "ok": False,
            "status": "FAILED",
            "error": "Journey generation failed via Kling",
            "details": str(e),
        }


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
    model_name: str = Form("nano-banana-pro-preview"),
    file: Optional[UploadFile] = File(None),
    refs: List[UploadFile] = File(None),
):
    try:
        input_image_b64 = None
        mime_type = "image/png"
        if file is not None:
            content = await file.read()
            if content:
                import base64
                input_image_b64 = base64.b64encode(content).decode("utf-8")
                mime_type = file.content_type or "image/png"
                
        reference_images = []
        if refs:
            import base64
            for r in refs:
                if r.filename:
                    r_content = await r.read()
                    if r_content:
                        r_b64 = base64.b64encode(r_content).decode("utf-8")
                        r_mime = r.content_type or "image/png"
                        reference_images.append({"b64": r_b64, "mime_type": r_mime})

        job_ids = []
        base_time = int(time.time() * 1000)

        if is_video:
            job_id = f"journey_{base_time}"
            video_perspective = perspective[0] if perspective else "Custom Scene"
            video_ar = aspect_ratio[0] if len(aspect_ratio) > 0 else "9:16"
            jobs[job_id] = {
                "ok": True,
                "job_id": job_id,
                "status": "IN_QUEUE",
                "message": "Initializing Video Journey...",
                "perspective": video_perspective,
                "is_video": True,
                "aspect_ratio": video_ar,
            }
            background_tasks.add_task(process_video_journey, job_id, perspective, custom_prompt, input_image_b64, mime_type, reference_images, video_ar)
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
                    
                    # إنشاء السجل المبدئي
                    jobs[job_id] = {
                        "ok": True,
                        "job_id": job_id,
                        "status": "IN_QUEUE",
                        "perspective": p,
                        "aspect_ratio": ar
                    }
                    
                    # تحويل مهمة التوليد إلى الخلفية
                    background_tasks.add_task(
                        process_gemini_job,
                        job_id,
                        prompt,
                        input_image_b64,
                        mime_type,
                        reference_images,
                        ar,
                        p,
                        model_name
                    )
                    job_ids.append(job_id)
        
        # إرجاع رد سريع للمستخدم
        return {
            "ok": True,
            "job_ids": job_ids,
            "status": "IN_QUEUE",
            "message": "Jobs successfully queued. Please check status periodically."
        }

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to create jobs", "details": str(e)}
        )

@app.get("/status/{job_id}")
def check_status(job_id: str):
    if job_id not in jobs:
        return JSONResponse(
            status_code=404,
            content={"error": "Job not found", "status": "FAILED"}
        )
    return jobs[job_id]

@app.on_event("startup")
def startup_event():
    init_mysql_tables()