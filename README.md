# MeMeMeow 🥕🐱

和萝卜猫一起练英语口语！跟读视频内容，赚萝卜看猫跳舞。

## 功能特点

- 📹 支持 YouTube、TikTok、Instagram 视频内容提取
- 🎤 实时语音识别跟读练习
- 🥕 萝卜积分激励系统
- 💃 集满 10 萝卜看猫跳舞
- 📝 错题本功能
- 📊 学习统计

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **后端**: Vercel Serverless Functions
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth (Google OAuth)
- **语音识别**: Web Speech API
- **视频转写**: Google Gemini API

## 开发设置

### 1. 克隆项目

```bash
git clone https://github.com/caraleeqiu/mememeow.git
cd mememeow
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# APIs
GEMINI_API_KEY=your_gemini_api_key
RAPIDAPI_KEY=your_rapidapi_key
```

### 3. 配置 Supabase

在 Supabase SQL Editor 中执行迁移文件：

```bash
# 1. 创建 RPC 函数（原子操作）
supabase/migrations/001_add_rpc_functions.sql

# 2. 启用 RLS 策略（安全）
supabase/migrations/002_add_rls_policies.sql
```

### 4. 启动开发服务器

```bash
npm run dev
```

## 部署

项目部署在 Vercel：

1. 连接 GitHub 仓库到 Vercel
2. 配置环境变量
3. 部署

## 项目结构

```
mememeow/
├── api/                    # Vercel Serverless Functions
│   └── extract.ts          # 视频内容提取 API
├── src/
│   ├── api/               # API 客户端
│   │   └── client.ts      # Supabase API 封装
│   ├── components/        # React 组件
│   │   ├── CarrotCat.tsx  # 萝卜猫组件
│   │   ├── DancingCat.tsx # 跳舞动画
│   │   ├── LinkInput.tsx  # 链接输入
│   │   └── ReadingArea.tsx # 跟读区域
│   ├── context/           # React Context
│   │   └── AuthContext.tsx # 认证上下文
│   ├── hooks/             # 自定义 Hooks
│   │   └── useSpeechRecognition.ts
│   ├── pages/             # 页面组件
│   │   ├── Home.tsx
│   │   └── Login.tsx
│   ├── types/             # TypeScript 类型
│   └── lib/               # 工具库
│       └── supabase.ts
├── supabase/
│   └── migrations/        # 数据库迁移
└── vercel.json            # Vercel 配置
```

## 匹配算法

跟读匹配使用改进的算法：

1. **Levenshtein 距离** - 处理拼写相似的词
2. **词序敏感** - 位置正确的词获得额外分数
3. **长度惩罚** - 过长或过短的回答会扣分
4. **阈值**: 80% 匹配度算通过

## 许可

MIT
