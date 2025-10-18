# AstraPlan - AI日程助手

自动根据自然语言或图片生成日程安排的 AI 工具，部署在 Cloudflare Workers 上。

## 功能特性

### 核心功能
- 🤖 **AI Chat** - 通过自然语言或图片创建、修改、删除日程
- 📅 **智能日历管理** - 支持微软 Outlook 日历或 D1 数据库存储
- 🔄 **防呆机制** - 自动检测重复日程，避免重复创建
- 📸 **图片识别** - 上传截图自动提取日程信息
- 📱 **PWA 支持** - 可安装到手机/桌面，离线可用

### 用户功能
- ⚙️ **个人配置页**
  - 用户提示词设置（默认地点、时长、提醒时间等）
  - ICS 订阅链接（可导入到其他日历应用）
  - 用户名和密码管理
  - 微软账号绑定/解绑
  - AI 资源配置（自带 API Key 无限额度）
  - 数据源选择（微软日历/D1 数据库）

### 管理员功能
- 👨‍💼 **管理员页**
  - 创建新邀请码
  - 管理邀请码额度
  - 停用邀请码

### 认证系统
- 🔐 多种登录方式
  - 用户名/密码
  - 微软账号登录
  - Passkey 快捷登录
- 🎟️ 邀请码系统
  - 无微软账号：10次聊天额度
  - 微软账号：30次聊天额度
  - 自带 AI API Key：无限额度

## 技术栈

### 后端
- Cloudflare Workers
- D1 数据库（SQLite）
- Hono（Web 框架）
- Microsoft Graph API（Outlook 日历）
- WebAuthn（Passkey 认证）

### AI 支持
- Cloudflare AI
- Google AI
- GitHub Models
- OpenAI
- 其他 OpenAI 兼容服务

### 前端
- Vue 3（CDN 版本）
- Tailwind CSS
- 本地存储（聊天历史）

## 部署指南

### 1. 准备工作

#### 安装依赖
```bash
npm install
```

#### 创建 D1 数据库
```bash
npx wrangler d1 create astraplan
```

记录返回的 `database_id`，更新到 `wrangler.jsonc` 中。

#### 初始化数据库
```bash
npx wrangler d1 execute astraplan --file=./schema.sql
```

### 2. 配置环境变量

#### 微软 OAuth 应用
1. 访问 [Azure Portal](https://portal.azure.com/)
2. 注册新应用，获取 `Client ID` 和 `Client Secret`
3. 设置重定向 URI: `https://your-domain.workers.dev/api/auth/ms/callback`

#### 设置 Secrets
```bash
# 管理员账号（首次部署后创建）
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD

# JWT 密钥
npx wrangler secret put JWT_SECRET

# 加密密钥
npx wrangler secret put ENCRYPTION_KEY

# 微软 OAuth
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put MS_REDIRECT_URI

# WebAuthn（可选）
npx wrangler secret put RP_NAME  # 例如: AstraPlan
npx wrangler secret put RP_ID    # 例如: your-domain.workers.dev

# 共享 AI 资源（可选）
npx wrangler secret put SHARED_AI_API_KEY
npx wrangler secret put SHARED_AI_BASE_URL
npx wrangler secret put SHARED_AI_MODEL
```

### 3. 更新 wrangler.jsonc

确保 `database_id` 已更新：
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "astraplan",
      "database_id": "your-database-id-here"
    }
  ]
}
```

### 4. 部署

#### 开发环境
```bash
npm run dev
```

#### 生产环境
```bash
npm run deploy
```

### 5. 初始化管理员

部署后，需要手动在 D1 数据库中创建管理员邀请码：

```bash
npx wrangler d1 execute astraplan --command="INSERT INTO users (invite_code, remaining_quota, is_admin) VALUES ('ADMIN-INVITE-CODE', 9999, 1);"
```

然后使用该邀请码注册管理员账号。

## 使用指南

### 注册/登录

#### 方式一：用户名/密码
1. 获取邀请码
2. 注册账号（用户名 3-20 字符，密码至少 6 位）
3. 登录

#### 方式二：微软账号
1. 点击"使用微软账号登录"
2. 授权后绑定邀请码和设置用户名
3. 完成注册

### AI 对话

发送消息示例：
- "明天下午3点开会，地点在会议室A"
- "下周一到周五每天上午9点晨会"
- "取消今天的会议"
- "查询本周的日程"
- 上传会议通知截图

### 配置提示词

在设置页面配置默认值，AI 会自动应用：
- 默认地点：如"公司会议室"
- 默认时长：如 60 分钟
- 默认提醒：如提前 15 分钟
- 时区：如 Asia/Shanghai
- 自定义说明：补充信息

### ICS 订阅

1. 在设置页面启用 ICS 订阅
2. 复制订阅链接
3. 在其他日历应用中添加订阅

### 数据源切换

如果同时有微软账号和自己的 AI Key：
- 微软日历：日程同步到 Outlook
- D1 数据库：日程存储在云端数据库

## API 文档

### 认证 API

#### POST /api/auth/register
注册新用户
```json
{
  "username": "user123",
  "password": "password",
  "inviteCode": "XXXX-XXXX-XXXX-XXXX"
}
```

#### POST /api/auth/login
用户登录
```json
{
  "username": "user123",
  "password": "password"
}
```

### Chat API

#### POST /api/chat
发送消息（需要认证）
```json
{
  "message": "明天下午3点开会",
  "image": "data:image/png;base64,...",
  "history": [...]
}
```

### Calendar API

#### GET /api/calendar/events
获取日程列表
- Query: `start`, `end` (可选)

#### POST /api/calendar/events
创建日程

#### PATCH /api/calendar/events/:id
更新日程

#### DELETE /api/calendar/events/:id
删除日程

### 用户 API

#### GET /api/user/profile
获取用户信息

#### POST /api/user/password
修改密码

#### POST /api/user/ai-config
配置 AI 资源

#### POST /api/user/prompt-config
配置提示词

#### POST /api/user/enable-ics
启用 ICS 订阅

### 管理员 API

#### POST /api/admin/invite-codes
创建邀请码

#### GET /api/admin/invite-codes
获取邀请码列表

#### PATCH /api/admin/invite-codes/:code
更新邀请码额度

#### DELETE /api/admin/invite-codes/:code
停用邀请码

## 数据库结构

### users 表
- id: 用户 ID
- username: 用户名
- invite_code: 邀请码
- remaining_quota: 剩余额度
- registered_at: 注册时间
- passkeys: Passkey 列表（JSON）
- password_hash: 密码哈希
- ai_config: AI 配置（加密 JSON）
- ms_token: 微软令牌（加密 JSON）
- ics_subscription_token: ICS 订阅令牌
- user_prompt_config: 用户提示词配置（JSON）
- data_source: 数据源（ms/d1）
- is_admin: 是否管理员

### calendar_events 表
- id: 事件 ID（UUID）
- user_id: 用户 ID
- subject: 标题
- body_content: 内容
- start_datetime: 开始时间
- end_datetime: 结束时间
- location: 地点
- is_all_day: 是否全天
- is_reminder_on: 是否提醒
- reminder_minutes_before: 提醒时间（分钟）
- 等

## 安全性

- ✅ 密码使用 SHA-256 哈希存储
- ✅ 敏感数据（AI Key、微软令牌）使用 AES-GCM 加密
- ✅ JWT 用于会话管理
- ✅ CORS 配置
- ✅ Passkey/WebAuthn 支持

## 开发

```bash
# 本地开发
npm run dev

# 类型生成
npm run cf-typegen

# 部署
npm run deploy
```

## 常见问题

### Q: 额度用完了怎么办？
A: 可以在设置页面配置自己的 AI API Key，获得无限额度。

### Q: 如何备份日程？
A: 使用 ICS 订阅功能，可以导出到其他日历应用。

### Q: 支持哪些 AI 服务？
A: Cloudflare AI、OpenAI、Google AI、GitHub Models、以及任何 OpenAI 兼容的服务。

### Q: 微软账号和数据库可以切换吗？
A: 可以，如果同时绑定了微软账号并配置了自己的 AI Key，可以在设置页面切换数据源。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 作者

AstraPlan Team

