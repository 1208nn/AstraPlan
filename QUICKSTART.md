# AstraPlan 快速开始指南

## 5 分钟快速部署

### 1. 准备工作（1分钟）
```bash
# 克隆项目
git clone <repository>
cd AstraPlan

# 安装依赖
npm install

# 登录 Cloudflare
npx wrangler login
```

### 2. 创建数据库（1分钟）
```bash
# 创建 D1 数据库
npx wrangler d1 create astraplan

# 复制返回的 database_id，更新到 wrangler.jsonc 中
# 然后初始化数据库
npx wrangler d1 execute astraplan --file=./schema.sql
```

### 3. 配置环境变量（2分钟）

#### 快速配置（最小化配置）
```bash
# 生成密钥
echo "$(openssl rand -base64 32)" | npx wrangler secret put JWT_SECRET
echo "$(openssl rand -base64 32)" | npx wrangler secret put ENCRYPTION_KEY

# 配置微软 OAuth（需要先在 Azure 创建应用）
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put MS_REDIRECT_URI

# 配置 WebAuthn
echo "AstraPlan" | npx wrangler secret put RP_NAME
echo "your-domain.workers.dev" | npx wrangler secret put RP_ID
```

### 4. 创建管理员（30秒）
```bash
# 创建管理员邀请码
npx wrangler d1 execute astraplan --command="INSERT INTO users (invite_code, remaining_quota, is_admin) VALUES ('ADMIN-INIT-CODE', 9999, 1);"
```

### 5. 部署（30秒）
```bash
npm run deploy
```

## 完成！🎉

访问你的 Workers URL，使用 `ADMIN-INIT-CODE` 注册管理员账号。

---

## 本地开发

```bash
# 复制环境变量模板
cp .dev.vars.example .dev.vars

# 编辑 .dev.vars，填入你的配置

# 启动本地开发服务器
npm run dev
```

---

## 使用自动化脚本

如果你想要更简单的部署过程，可以使用自动化脚本：

```bash
chmod +x setup.sh
./setup.sh
```

这个脚本会引导你完成所有配置步骤。

---

## 下一步

1. **创建 Azure 应用**
   - 访问 https://portal.azure.com/
   - 注册新应用
   - 配置权限：Calendars.ReadWrite, User.Read, offline_access
   - 设置重定向 URI：`https://your-domain.workers.dev/api/auth/ms/callback`

2. **注册管理员账号**
   - 访问你的 Workers URL
   - 点击"注册"
   - 使用 `ADMIN-INIT-CODE` 作为邀请码
   - 设置用户名和密码

3. **创建普通用户邀请码**
   - 登录管理面板
   - 点击"管理" → "创建邀请码"
   - 分享邀请码给其他用户

4. **配置 AI 资源**
   - 在设置页面配置你的 AI API Key
   - 支持：OpenAI, Google AI, GitHub Models, Cloudflare AI 等

---

## 常见问题

### Q: 如何获取 Azure 应用 ID 和密钥？
访问 https://portal.azure.com/ → Azure Active Directory → 应用注册 → 新注册

### Q: 部署后无法访问？
检查 Cloudflare Workers 路由是否正确配置

### Q: 微软登录失败？
确保 Azure 应用的重定向 URI 与部署的 URL 完全匹配

### Q: AI 不响应？
检查 AI API Key 是否有效，额度是否充足

---

## 获取帮助

- 查看完整文档：[README.md](README.md)
- 查看部署清单：[DEPLOYMENT.md](DEPLOYMENT.md)
- 提交 Issue：GitHub Issues

---

祝你使用愉快！🚀
