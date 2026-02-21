-- MeMeMeow Database Schema for Supabase

-- 用户扩展表（Supabase Auth 已有 users，这里存额外信息）
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  carrots INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文章/视频内容表
CREATE TABLE IF NOT EXISTS contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  sentences JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 跟读记录表
CREATE TABLE IF NOT EXISTS reading_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  sentence_index INTEGER NOT NULL,
  sentence_text TEXT NOT NULL,
  user_speech TEXT,
  is_correct BOOLEAN NOT NULL,
  attempts INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_id, sentence_index)
);

-- 错题本
CREATE TABLE IF NOT EXISTS mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  sentence_index INTEGER NOT NULL,
  sentence_text TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  is_mastered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_id, sentence_index)
);

-- 跳舞记录
CREATE TABLE IF NOT EXISTS dance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  carrots_spent INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dance_records ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能访问自己的数据
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own contents" ON contents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contents" ON contents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own contents" ON contents FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own reading records" ON reading_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reading records" ON reading_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reading records" ON reading_records FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own mistakes" ON mistakes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mistakes" ON mistakes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mistakes" ON mistakes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own dance records" ON dance_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own dance records" ON dance_records FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 自动创建 profile 的触发器
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
