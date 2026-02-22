# MeMeMeow 🥕

英语跟读练习应用 - 通过视频内容学习英语口语

## 功能特性

- **视频内容提取**：支持 YouTube、TikTok、Instagram 视频
- **语音跟读**：使用浏览器语音识别进行跟读练习
- **智能评分**：自动匹配用户语音和原文
- **萝卜奖励**：跟读正确获得萝卜，可兑换猫猫跳舞
- **错题本**：记录错误句子，方便复习
- **粘贴文字**：直接粘贴英文内容进行练习
- **上传文件**：支持 .txt, .md 文件

## 技术栈

- **前端**：React + TypeScript + Vite
- **后端**：Vercel Serverless Functions
- **数据库**：Supabase (PostgreSQL)
- **认证**：Supabase Auth (支持 Google OAuth)
- **视频处理**：
  - YouTube: `youtube-transcript` (免费字幕 API)
  - TikTok: RapidAPI TikTok Downloader + Gemini 转写
  - Instagram: Cobalt.tools + Gemini 转写

## 环境变量

### 前端 (.env.local)
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Vercel 环境变量
```
GEMINI_API_KEY=your_gemini_api_key
RAPIDAPI_KEY=your_rapidapi_key
```

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

## 部署

项目使用 Vercel 部署：

```bash
# 手动部署
npx vercel --prod
```

## 数据库结构

详见 `supabase-schema.sql`

主要表：
- `profiles` - 用户资料和萝卜数量
- `contents` - 提取的内容和句子
- `reading_records` - 跟读记录
- `mistakes` - 错题本
- `dance_records` - 跳舞记录

## API 端点

- `POST /api/extract` - 提取视频内容
  - 参数：`{ url: string }`
  - 返回：`{ title, sentences, platform, type }`

## License

MIT
