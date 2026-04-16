"""
كود محدث لدالة رفع الصور مع دعم Supabase Storage
انسخ هذا الكود واستبدل به دالة admin_upload_image في main.py
"""

# أضف هذا في بداية main.py بعد الـ imports
"""
from supabase import create_client, Client

# إعداد Supabase Storage
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "app-images").strip()

supabase_client: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase Storage connected")
    except Exception as e:
        print(f"⚠️ Supabase Storage connection failed: {e}")
"""

# استبدل دالة admin_upload_image بهذا الكود:
"""
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
        ext = file.filename.split('.')[-1] if file.filename and '.' in file.filename else 'jpg'
        filename = f"uploaded_{int(time.time())}_{uuid.uuid4().hex[:6]}.{ext}"
        
        # رفع إلى Supabase Storage
        if supabase_client:
            # تحديد نوع المحتوى
            content_type = file.content_type or "image/jpeg"
            if ext.lower() == 'png':
                content_type = "image/png"
            elif ext.lower() == 'webp':
                content_type = "image/webp"
            elif ext.lower() == 'gif':
                content_type = "image/gif"
            
            try:
                # رفع الملف إلى Supabase
                result = supabase_client.storage.from_(SUPABASE_BUCKET).upload(
                    filename,
                    content,
                    {"content-type": content_type, "upsert": "true"}
                )
                
                # الحصول على الرابط العام
                file_url = supabase_client.storage.from_(SUPABASE_BUCKET).get_public_url(filename)
                
                print(f"✅ Image uploaded to Supabase: {filename}")
                return {"ok": True, "url": file_url, "storage": "supabase"}
                
            except Exception as supabase_error:
                print(f"⚠️ Supabase upload failed: {supabase_error}")
                # Fallback إلى التخزين المحلي
                pass
        
        # Fallback: حفظ محلي (للتطوير أو عند فشل Supabase)
        filepath = os.path.join("static", filename)
        with open(filepath, "wb") as f:
            f.write(content)
            
        api_base = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
        file_url = f"{api_base}/static/{filename}"
        
        print(f"⚠️ Image saved locally: {filename}")
        return {"ok": True, "url": file_url, "storage": "local"}
            
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
"""

print("""
📝 تعليمات التطبيق:

1. افتح main.py
2. ابحث عن السطر: from dotenv import load_dotenv
3. أضف بعده:
   from supabase import create_client, Client

4. ابحث عن السطر: ADMIN_EMAILS = {
5. أضف قبله:
   # إعداد Supabase Storage
   SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
   SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
   SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "app-images").strip()
   
   supabase_client: Optional[Client] = None
   if SUPABASE_URL and SUPABASE_KEY:
       try:
           supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
           print("✅ Supabase Storage connected")
       except Exception as e:
           print(f"⚠️ Supabase Storage connection failed: {e}")

6. ابحث عن دالة @app.post("/admin/upload-image")
7. استبدلها بالكود أعلاه

8. احفظ الملف وأعد تشغيل السيرفر
""")
