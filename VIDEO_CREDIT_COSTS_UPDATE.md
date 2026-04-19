# تحديث: تكاليف منفصلة لأنواع الفيديو ✅

## التغييرات المطبقة

### 1. إضافة تكاليف جديدة في قاعدة البيانات

تم إضافة نوعين جديدين من تكاليف الفيديو:

| العملية | الوصف | التكلفة الافتراضية |
|---------|-------|---------------------|
| `video_image_to_video` | فيديو: صورة إلى فيديو | 5 كريدت |
| `video_frame_to_frame` | فيديو: إطار بداية → إطار نهاية | 7 كريدت |

### 2. التعديلات في Backend (`main.py`)

#### دالة `generate()`

```python
# تحديد نوع الفيديو تلقائياً
if is_video:
    has_refs = refs and any(r.filename for r in refs)
    if has_refs:
        # Frame to Frame mode
        cost_per_video = costs.get("video_frame_to_frame", 7)
    else:
        # Image to Video mode
        cost_per_video = costs.get("video_image_to_video", 5)
```

**المنطق:**
- إذا كان هناك `refs` (صور مرجعية) → **Frame to Frame**
- إذا لم يكن هناك `refs` → **Image to Video**

### 3. التعديلات في Frontend

#### `app/page.tsx`
- ✅ إضافة `video_image_to_video` و `video_frame_to_frame` في state
- ✅ جلب التكاليف من API وحفظها

#### `app/components/ControlPanel.tsx`
- ✅ تحديث Props لتشمل الأنواع الجديدة
- ✅ حساب التكلفة بناءً على نوع الفيديو (Image to Video أو Frame to Frame)
- ✅ عرض نوع الفيديو في معاينة التكلفة

### 4. لوحة التحكم

لوحة التحكم (`/admin`) تعرض الآن جميع التكاليف:

- ✅ Image Generation (per image)
- ✅ Video: Image to Video
- ✅ Video: Frame to Frame

يمكن للأدمن تعديل التكلفة مباشرة من اللوحة والتغييرات **تظهر فوراً** في الموقع.

---

## كيفية الاستخدام

### من لوحة التحكم:

1. اذهب إلى `/admin`
2. اختر تبويب **"Credit Costs"**
3. عدّل التكلفة لكل نوع
4. اضغط **Save**
5. **التغييرات تظهر فوراً** في الموقع عند تحديث الصفحة

### التكاليف الحالية:

- **صورة واحدة**: 1 كريدت
- **فيديو (صورة → فيديو)**: 5 كريدت
- **فيديو (إطار → إطار)**: 7 كريدت

---

## عرض التكلفة في الواجهة

الآن عند اختيار نوع الفيديو، ستظهر التكلفة الصحيحة:

```
🎬 Image to Video → "Video (Image to Video) costs 5 credits"
🎬 Frame to Frame → "Video (Frame to Frame) costs 7 credits"
```

---

## ملاحظات

- التكاليف تُخصم **فقط عند النجاح**
- إذا فشل التوليد → لا يُخصم شيء
- النظام يتعرف تلقائياً على نوع الفيديو من:
  - وجود `refs` في الطلب
  - أو `videoGenerationMode` في الواجهة

---

## الاختبار

1. أعد تشغيل الـ backend:
   ```bash
   python main.py
   ```

2. أعد تشغيل الـ frontend:
   ```bash
   cd ai-architecture
   npm run dev
   ```

3. اذهب إلى `/admin` وعدّل التكاليف

4. افتح الصفحة الرئيسية وجرّب:
   - **Image to Video**: ارفع صورة واحدة فقط → ستظهر تكلفة 5
   - **Frame to Frame**: ارفع صورة بداية + نهاية → ستظهر تكلفة 7

5. التغييرات من لوحة التحكم **تظهر فوراً** بعد تحديث الصفحة ✅
