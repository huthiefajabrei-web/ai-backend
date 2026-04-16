# إصلاح مشكلة Gemini API

## المشكلة:
```json
{
  "ok": false,
  "status": "FAILED",
  "error": "Gemini API error",
  "details": "No response"
}
```

## السبب:
1. عدم وجود logging كافٍ لمعرفة سبب الفشل
2. عدم التحقق من صحة الـ response قبل معالجته
3. رسائل خطأ غير واضحة

## الإصلاح:

### 1. إضافة Logging مفصل
- طباعة كل محاولة اتصال
- طباعة status code من Gemini
- طباعة تفاصيل الأخطاء
- طباعة مفاتيح الـ response

### 2. تحسين معالجة الأخطاء
- التحقق من صحة الـ response قبل المعالجة
- إضافة معلومات أكثر في رسائل الخطأ
- إضافة job_id و perspective و aspect_ratio في كل response

### 3. تحسين Retry Logic
- إعادة المحاولة عند timeout
- إعادة المحاولة عند 429 أو 5xx errors
- طباعة رسائل واضحة عند كل محاولة

## الاختبار:

### 1. شغّل السيرفر:
```bash
uvicorn main:app --reload
```

### 2. راقب الـ logs:
ستظهر رسائل مثل:
```
🔄 Gemini API attempt 1 for job gemini_xxx
📡 Gemini API response status: 200
✅ Gemini API success for job gemini_xxx
📦 Gemini API response data keys: ['candidates', 'usageMetadata']
✅ Successfully extracted image from Gemini response
💾 Saved image to static/gemini_xxx.jpg
🎉 Job gemini_xxx completed successfully
```

### 3. إذا فشل:
ستظهر رسائل واضحة مثل:
```
❌ Gemini API error 400: Invalid API key
```
أو
```
❌ Failed to parse Gemini response: KeyError: 'candidates'
📄 Response data: {'error': {'message': '...'}}
```

## الأسباب المحتملة للفشل:

### 1. API Key غير صحيح
**الحل:** تحقق من `GEMINI_API_KEY` في `.env`

### 2. Model غير متاح
**الحل:** النموذج الحالي `nano-banana-pro-preview` قد لا يكون متاحاً
جرب تغييره إلى:
- `gemini-2.0-flash-exp`
- `gemini-1.5-flash`
- `gemini-1.5-pro`

### 3. Quota exceeded
**الحل:** تحقق من حصة API في Google Cloud Console

### 4. Request too large
**الحل:** قلل حجم الصور المرفوعة

## التحديثات:

### ملف main.py:
- السطر 1075-1115: تحسين retry logic مع logging
- السطر 1117-1175: تحسين معالجة الـ response مع logging
- السطر 1177-1195: تحسين معالجة الأخطاء مع logging

## الخطوات التالية:

1. أعد تشغيل السيرفر
2. جرب توليد صورة
3. راقب الـ logs في Terminal
4. إذا ظهر خطأ، انسخ الرسالة الكاملة
5. سيكون من السهل معرفة السبب الآن

---

**تم الإصلاح:** 16 أبريل 2026
