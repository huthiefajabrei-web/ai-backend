# حل مشكلة الصور المفقودة عند التحديث

## المشكلة
عند رفع تحديثات الكود للسيرفر، الصور المحفوظة في مجلد `static/` المحلي تختفي لأن:
1. مجلد `static/` غير مرفوع مع الكود (عادة في `.gitignore`)
2. الصور محفوظة محلياً فقط وليست في قاعدة بيانات دائمة

## الحل: استخدام Supabase Storage

### الخطوة 1: تثبيت مكتبة Supabase
```bash
pip install supabase
```

### الخطوة 2: إضافة إعدادات Supabase في `.env`
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_BUCKET=app-images
```

### الخطوة 3: إنشاء Bucket في Supabase
1. افتح لوحة تحكم Supabase
2. اذهب إلى Storage
3. أنشئ bucket جديد باسم `app-images`
4. اجعله Public للوصول المباشر للصور

### الخطوة 4: تحديث كود رفع الصور

استبدل دالة `admin_upload_image` في `main.py` بالكود التالي:

```python
from supabase import create_client, Client

# في بداية الملف بعد تحميل المتغيرات
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "app-images").strip()

supabase_client: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
            result = supabase_client.storage.from_(SUPABASE_BUCKET).upload(
                filename,
                content,
                {"content-type": file.content_type or "image/jpeg"}
            )
            
            # الحصول على الرابط العام
            file_url = supabase_client.storage.from_(SUPABASE_BUCKET).get_public_url(filename)
            return {"ok": True, "url": file_url}
        else:
            # Fallback: حفظ محلي (للتطوير فقط)
            filepath = os.path.join("static", filename)
            with open(filepath, "wb") as f:
                f.write(content)
            api_base = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
            file_url = f"{api_base}/static/{filename}"
            return {"ok": True, "url": file_url}
            
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
```

### الخطوة 5: ترحيل الصور الموجودة (اختياري)

إذا كان لديك صور في `static/` تريد نقلها:

```python
# سكريبت لترحيل الصور
import os
from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

for filename in os.listdir("static"):
    if filename.endswith(('.jpg', '.jpeg', '.png', '.webp')):
        filepath = os.path.join("static", filename)
        with open(filepath, "rb") as f:
            content = f.read()
            supabase.storage.from_(SUPABASE_BUCKET).upload(
                filename,
                content,
                {"content-type": "image/jpeg"}
            )
        print(f"✅ Uploaded: {filename}")
```

## الفوائد
✅ الصور محفوظة بشكل دائم في Supabase
✅ لا تختفي عند تحديث الكود
✅ CDN سريع للصور
✅ نسخ احتياطي تلقائي
✅ إدارة سهلة من لوحة تحكم Supabase
