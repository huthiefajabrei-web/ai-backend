"""
سكريبت لإصلاح مشكلة تخزين الصور
يقوم بترحيل الصور من المجلد المحلي إلى Supabase Storage
"""
import os
from dotenv import load_dotenv

load_dotenv()

try:
    from supabase import create_client
    
    SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
    SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "app-images").strip()
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ يرجى إضافة SUPABASE_URL و SUPABASE_KEY في ملف .env")
        exit(1)
    
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # التحقق من وجود Bucket أو إنشاؤه
    try:
        buckets = supabase.storage.list_buckets()
        bucket_exists = any(b.name == SUPABASE_BUCKET for b in buckets)
        
        if not bucket_exists:
            print(f"⚠️ Bucket '{SUPABASE_BUCKET}' غير موجود")
            print("يرجى إنشاؤه من لوحة تحكم Supabase:")
            print(f"1. اذهب إلى {SUPABASE_URL}/project/_/storage/buckets")
            print(f"2. أنشئ bucket جديد باسم: {SUPABASE_BUCKET}")
            print("3. اجعله Public")
            exit(1)
    except Exception as e:
        print(f"⚠️ تحذير: {e}")
    
    # ترحيل الصور من static/
    static_dir = "static"
    if not os.path.exists(static_dir):
        print(f"❌ المجلد {static_dir} غير موجود")
        exit(1)
    
    uploaded_count = 0
    failed_count = 0
    
    for filename in os.listdir(static_dir):
        if filename.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
            filepath = os.path.join(static_dir, filename)
            try:
                with open(filepath, "rb") as f:
                    content = f.read()
                    
                # تحديد نوع المحتوى
                content_type = "image/jpeg"
                if filename.lower().endswith('.png'):
                    content_type = "image/png"
                elif filename.lower().endswith('.webp'):
                    content_type = "image/webp"
                elif filename.lower().endswith('.gif'):
                    content_type = "image/gif"
                
                # رفع الصورة
                result = supabase.storage.from_(SUPABASE_BUCKET).upload(
                    filename,
                    content,
                    {"content-type": content_type, "upsert": "true"}
                )
                
                # الحصول على الرابط العام
                public_url = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(filename)
                print(f"✅ {filename} -> {public_url}")
                uploaded_count += 1
                
            except Exception as e:
                print(f"❌ فشل رفع {filename}: {e}")
                failed_count += 1
    
    print(f"\n📊 النتيجة:")
    print(f"   ✅ تم رفع: {uploaded_count} صورة")
    print(f"   ❌ فشل: {failed_count} صورة")
    
    if uploaded_count > 0:
        print(f"\n💡 الآن يمكنك حذف المجلد {static_dir} بأمان")
        print("   الصور محفوظة في Supabase Storage")

except ImportError:
    print("❌ مكتبة supabase غير مثبتة")
    print("قم بتثبيتها باستخدام: pip install supabase")
    exit(1)
