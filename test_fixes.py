"""
سكريبت اختبار الإصلاحات
يتحقق من أن جميع الإصلاحات تعمل بشكل صحيح
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

print("🔍 اختبار الإصلاحات...\n")

# 1. اختبار اتصال قاعدة البيانات
print("1️⃣ اختبار قاعدة البيانات PostgreSQL...")
try:
    import psycopg2
    import psycopg2.extras
    
    DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
    if not DATABASE_URL:
        print("   ❌ DATABASE_URL غير موجود في .env")
        sys.exit(1)
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    
    # اختبار الاستعلام الذي كان يسبب المشكلة
    cur.execute("SELECT COUNT(*) as cnt FROM app_tools")
    result = cur.fetchone()
    
    # يجب أن يعمل بدون خطأ "tuple indices"
    count = result["cnt"]
    print(f"   ✅ قاعدة البيانات تعمل بشكل صحيح (عدد الأدوات: {count})")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"   ❌ خطأ في قاعدة البيانات: {e}")
    sys.exit(1)

# 2. اختبار Supabase Storage
print("\n2️⃣ اختبار Supabase Storage...")
try:
    from supabase import create_client
    
    SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
    SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "app-images").strip()
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("   ⚠️ Supabase غير مُعد (اختياري للتطوير المحلي)")
        print("   💡 لتفعيله، أضف SUPABASE_URL و SUPABASE_KEY في .env")
    else:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # اختبار الاتصال
        buckets = supabase.storage.list_buckets()
        bucket_exists = any(b.name == SUPABASE_BUCKET for b in buckets)
        
        if bucket_exists:
            print(f"   ✅ Supabase Storage متصل (Bucket: {SUPABASE_BUCKET})")
            
            # اختبار قائمة الملفات
            files = supabase.storage.from_(SUPABASE_BUCKET).list()
            print(f"   📁 عدد الملفات في Bucket: {len(files)}")
        else:
            print(f"   ⚠️ Bucket '{SUPABASE_BUCKET}' غير موجود")
            print(f"   💡 أنشئه من: {SUPABASE_URL}/project/_/storage/buckets")
            
except ImportError:
    print("   ⚠️ مكتبة supabase غير مثبتة")
    print("   💡 ثبّتها: pip install supabase")
except Exception as e:
    print(f"   ❌ خطأ في Supabase: {e}")

# 3. اختبار المجلد المحلي
print("\n3️⃣ اختبار المجلد المحلي...")
static_dir = "static"
if os.path.exists(static_dir):
    images = [f for f in os.listdir(static_dir) 
              if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif'))]
    print(f"   📁 عدد الصور في {static_dir}: {len(images)}")
    
    if len(images) > 0:
        print(f"   💡 يمكنك ترحيل هذه الصور إلى Supabase باستخدام:")
        print(f"      python fix_storage.py")
else:
    print(f"   ⚠️ المجلد {static_dir} غير موجود")
    os.makedirs(static_dir, exist_ok=True)
    print(f"   ✅ تم إنشاء المجلد {static_dir}")

# 4. اختبار المتغيرات المطلوبة
print("\n4️⃣ اختبار المتغيرات في .env...")
required_vars = {
    "DATABASE_URL": "✅ موجود" if os.getenv("DATABASE_URL") else "❌ مفقود",
    "RUNPOD_API_KEY": "✅ موجود" if os.getenv("RUNPOD_API_KEY") else "⚠️ مفقود (اختياري)",
    "ADMIN_EMAILS": "✅ موجود" if os.getenv("ADMIN_EMAILS") else "⚠️ مفقود (اختياري)",
    "SUPABASE_URL": "✅ موجود" if os.getenv("SUPABASE_URL") else "⚠️ مفقود (اختياري)",
    "SUPABASE_KEY": "✅ موجود" if os.getenv("SUPABASE_KEY") else "⚠️ مفقود (اختياري)",
}

for var, status in required_vars.items():
    print(f"   {var}: {status}")

print("\n" + "="*50)
print("✅ اكتمل الاختبار!")
print("="*50)

print("\n📋 الخطوات التالية:")
print("1. إذا كانت قاعدة البيانات تعمل ✅ - الإصلاح الأول نجح")
print("2. إذا كان Supabase متصل ✅ - يمكنك استخدام التخزين السحابي")
print("3. إذا كان لديك صور في static/ - شغّل: python fix_storage.py")
print("4. شغّل السيرفر: uvicorn main:app --reload")
