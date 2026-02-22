# MeMeMeow 🥕🐱

和萝卜猫一起练英语口语！

## 这是什么？

**MeMeMeow** 是一个英语口语跟读练习工具。

核心玩法很简单：把你喜欢的 YouTube 或 TikTok 视频链接粘贴进来，AI 自动提取英文内容，然后你跟着一句句读。读对了奖励萝卜🥕，集满 10 个可以看萝卜猫跳舞💃 读累了点一下猫咪击个掌 ✋ 放松一下。

为什么做这个？因为练口语最大的问题是「不知道读什么」和「没有反馈」。MeMeMeow 让你用自己感兴趣的内容练习，还有即时的语音识别反馈告诉你读得对不对。

**试试看：https://mememeow.vercel.app**

## 功能特点

- 📹 支持 YouTube / YouTube Shorts / TikTok 视频内容提取
- 📄 支持上传 PDF 和 TXT 文件
- ✏️ 支持直接粘贴英文文字
- 🎤 实时语音识别跟读练习
- 🔊 TTS 示范朗读（卡拉OK式单词高亮）
- 🥕 萝卜积分激励系统
- 💃 集满 10 萝卜看猫跳舞（4种音乐风格可选）
- ✋ 点击猫咪击掌互动
- 📝 错题本功能
- 📊 学习统计
- 🌍 自动检测语言（仅支持英文内容）

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **后端**: Vercel Serverless Functions
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth (Google OAuth)
- **语音识别**: Web Speech API
- **语音合成**: Web Speech API (TTS)
- **视频转写**: Google Gemini API
- **视频下载**: RapidAPI (YouTube/TikTok)

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

在 Supabase SQL Editor 中执行：

1. `supabase-schema.sql` - 创建表结构
2. `supabase/migrations/001_add_rpc_functions.sql` - RPC 函数
3. `supabase/migrations/002_add_rls_policies.sql` - RLS 策略

### 4. 启动开发服务器

```bash
npm run dev
```

## 部署

项目部署在 Vercel：

1. 连接 GitHub 仓库到 Vercel
2. 配置环境变量
3. 部署

线上地址: https://mememeow.vercel.app

## 项目结构

```
mememeow/
├── api/                    # Vercel Serverless Functions
│   ├── extract.ts          # 视频内容提取 API
│   └── extract-pdf.ts      # PDF 文本提取 API
├── src/
│   ├── api/               # API 客户端
│   │   └── client.ts      # Supabase API 封装
│   ├── components/        # React 组件
│   │   ├── CarrotCat.tsx  # 萝卜猫组件
│   │   ├── DancingCat.tsx # 跳舞动画（含音乐风格选择）
│   │   ├── LinkInput.tsx  # 链接/文件输入
│   │   └── ReadingArea.tsx # 跟读区域（含TTS示范）
│   ├── context/           # React Context
│   │   └── AuthContext.tsx # 认证上下文
│   ├── pages/             # 页面组件
│   │   ├── Home.tsx
│   │   └── Login.tsx
│   ├── types/             # TypeScript 类型
│   └── lib/               # 工具库
│       └── supabase.ts
├── public/
│   └── cat.jpg            # 萝卜猫图片
├── supabase/
│   └── migrations/        # 数据库迁移
└── vercel.json            # Vercel 配置
```

## 核心功能

### 视频提取
- YouTube: 使用 RapidAPI 下载音频，Gemini 转写
- TikTok: 使用 RapidAPI 下载视频，Gemini 转写
- 自动检测语言，非英文内容会提示用户

### 跟读练习
- Web Speech API 实时语音识别
- 改进的匹配算法（Levenshtein距离 + 词序）
- 80% 匹配度通过
- TTS 示范朗读，卡拉OK式单词高亮

### 萝卜猫跳舞
- 10 萝卜触发
- 4 种音乐风格可选：Disco / EDM / Chill / 可爱
- 全屏迪斯科灯光效果
- 15秒跳舞时间

## 许可

MIT
