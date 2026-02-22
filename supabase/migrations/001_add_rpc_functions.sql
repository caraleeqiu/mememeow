-- 原子增加萝卜数量
CREATE OR REPLACE FUNCTION increment_carrots(user_id UUID, amount INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_carrots INT;
BEGIN
  UPDATE profiles
  SET carrots = carrots + amount
  WHERE id = user_id
  RETURNING carrots INTO new_carrots;

  RETURN new_carrots;
END;
$$;

-- 原子兑换跳舞（检查余额并扣费）
CREATE OR REPLACE FUNCTION redeem_dance(user_id UUID, cost INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_carrots INT;
  new_carrots INT;
BEGIN
  -- 获取当前萝卜数并锁定行
  SELECT carrots INTO current_carrots
  FROM profiles
  WHERE id = user_id
  FOR UPDATE;

  -- 检查余额
  IF current_carrots < cost THEN
    RAISE EXCEPTION 'Not enough carrots. Need %, have %', cost, current_carrots;
  END IF;

  -- 扣除萝卜
  new_carrots := current_carrots - cost;
  UPDATE profiles SET carrots = new_carrots WHERE id = user_id;

  -- 记录跳舞
  INSERT INTO dance_records (user_id, carrots_spent)
  VALUES (user_id, cost);

  RETURN new_carrots;
END;
$$;

-- 授权 authenticated 用户调用
GRANT EXECUTE ON FUNCTION increment_carrots TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_dance TO authenticated;
