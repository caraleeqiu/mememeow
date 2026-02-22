-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dance_records ENABLE ROW LEVEL SECURITY;

-- Profiles: 用户只能访问自己的 profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Contents: 用户只能访问自己的内容
CREATE POLICY "Users can view own contents"
  ON contents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contents"
  ON contents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contents"
  ON contents FOR DELETE
  USING (auth.uid() = user_id);

-- Reading Records: 用户只能访问自己的跟读记录
CREATE POLICY "Users can view own reading records"
  ON reading_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reading records"
  ON reading_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reading records"
  ON reading_records FOR UPDATE
  USING (auth.uid() = user_id);

-- Mistakes: 用户只能访问自己的错题本
CREATE POLICY "Users can view own mistakes"
  ON mistakes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mistakes"
  ON mistakes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mistakes"
  ON mistakes FOR UPDATE
  USING (auth.uid() = user_id);

-- Dance Records: 用户只能访问自己的跳舞记录
CREATE POLICY "Users can view own dance records"
  ON dance_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dance records"
  ON dance_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);
