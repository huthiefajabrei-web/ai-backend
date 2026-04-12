-- ============================================
-- جداول مشروع AI Architecture + RLS
-- شغّل هذا الملف في Supabase: SQL Editor → New query → Paste → Run
-- ============================================

-- جدول أعمال المستخدم (كل عملية توليد صور/فيديو)
CREATE TABLE IF NOT EXISTS public.user_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  input_image_url TEXT,
  perspectives TEXT[],
  custom_prompt TEXT,
  output_urls JSONB DEFAULT '[]'::jsonb,
  aspect_ratio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- فهرس لتسريع جلب أعمال المستخدم
CREATE INDEX IF NOT EXISTS idx_user_works_user_id ON public.user_works(user_id);
CREATE INDEX IF NOT EXISTS idx_user_works_created_at ON public.user_works(created_at DESC);

-- تفعيل Row Level Security
ALTER TABLE public.user_works ENABLE ROW LEVEL SECURITY;

-- السياسات: المستخدم يرى ويضيف ويحدّث ويحذف أعماله فقط
CREATE POLICY "Users can read own works"
  ON public.user_works FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own works"
  ON public.user_works FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own works"
  ON public.user_works FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own works"
  ON public.user_works FOR DELETE
  USING (auth.uid() = user_id);

-- (اختياري) جدول الاشتراكات/الخطط لربط الدفع لاحقاً
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- التحديث يُدار من الباك إند (service role) لاحقاً عند الدفع
CREATE POLICY "Users can insert own subscription"
  ON public.user_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- جدول الجلسات (Sessions) لحفظ أعمال وبيانات واجهة المستخدم
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'New Session',
  resps JSONB DEFAULT '{}'::jsonb,
  parent_session_id UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add parent_session_id column if upgrading an existing table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_sessions'
      AND column_name = 'parent_session_id'
  ) THEN
    ALTER TABLE public.user_sessions
      ADD COLUMN parent_session_id UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- فهرس لتسريع البحث عن جلسات المستخدم
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_updated_at ON public.user_sessions(updated_at DESC);

-- تفعيل الأمان (Row Level Security)
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- سياسات الجلسات: المستخدم يمكنه فقط قراءة، إضافة، تحديث، وحذف جلساته
DROP POLICY IF EXISTS "Users can select own sessions" ON public.user_sessions;
CREATE POLICY "Users can select own sessions"
  ON public.user_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.user_sessions;
CREATE POLICY "Users can insert own sessions"
  ON public.user_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
CREATE POLICY "Users can update own sessions"
  ON public.user_sessions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;
CREATE POLICY "Users can delete own sessions"
  ON public.user_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- دالة لتحديث وقت التعديل تلقائياً في جدول الجلسات
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تفعيل التحديث التلقائي للحقل `updated_at` في `user_sessions`
DROP TRIGGER IF EXISTS update_user_sessions_updated_at ON public.user_sessions;
CREATE TRIGGER update_user_sessions_updated_at
BEFORE UPDATE ON public.user_sessions
FOR EACH ROW
EXECUTE PROCEDURE public.handle_updated_at();
