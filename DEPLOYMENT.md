# AstraPlan 部署检查清单

## 前置准备

- [ ] 已安装 Node.js (v16+)
- [ ] 已安装 Wrangler CLI (`npm install -g wrangler`)
- [ ] 已登录 Cloudflare (`wrangler login`)
- [ ] 已创建 Azure 应用（用于微软 OAuth）

## 部署步骤

### 1. 克隆和安装
```bash
git clone <repository>
cd AstraPlan
npm install
```

### 2. 创建 D1 数据库
```bash
npx wrangler d1 create astraplan
```
- [ ] 复制返回的 `database_id`
- [ ] 更新 `wrangler.jsonc` 中的 `database_id`

### 3. 初始化数据库
```bash
npx wrangler d1 execute astraplan --file=./schema.sql
```
- [ ] 确认表已创建

### 4. 配置环境变量

#### 必需的 Secrets
```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put MS_REDIRECT_URI
npx wrangler secret put RP_NAME
npx wrangler secret put RP_ID
```

- [ ] JWT_SECRET (随机字符串，建议 32 字符以上)
- [ ] ENCRYPTION_KEY (随机字符串，建议 32 字符以上)
- [ ] MS_CLIENT_ID (Azure 应用 ID)
- [ ] MS_CLIENT_SECRET (Azure 应用密钥)
- [ ] MS_REDIRECT_URI (https://your-domain.workers.dev/api/auth/ms/callback)
- [ ] RP_NAME (WebAuthn Relying Party 名称，如 "AstraPlan")
- [ ] RP_ID (你的域名，如 "your-domain.workers.dev")

#### 可选的 Secrets (共享 AI 资源)
```bash
npx wrangler secret put SHARED_AI_API_KEY
npx wrangler secret put SHARED_AI_BASE_URL
npx wrangler secret put SHARED_AI_MODEL
```

- [ ] SHARED_AI_API_KEY (可选)
- [ ] SHARED_AI_BASE_URL (可选)
- [ ] SHARED_AI_MODEL (可选)

### 5. 创建管理员邀请码
```bash
npx wrangler d1 execute astraplan --command="INSERT INTO users (invite_code, remaining_quota, is_admin) VALUES ('YOUR-ADMIN-CODE', 9999, 1);"
```
- [ ] 记录管理员邀请码

### 6. 部署
```bash
npm run deploy
```
- [ ] 确认部署成功
- [ ] 记录 Workers URL

## 部署后配置

### Azure 应用配置
1. 访问 [Azure Portal](https://portal.azure.com/)
2. 打开你的应用注册
3. 添加重定向 URI：`https://your-workers-url/api/auth/ms/callback`
4. 确保以下权限已添加：
   - [ ] Calendars.ReadWrite
   - [ ] User.Read
   - [ ] offline_access

### 首次使用
1. [ ] 访问你的 Workers URL
2. [ ] 使用管理员邀请码注册
3. [ ] 登录管理面板
4. [ ] 创建普通用户邀请码

## 测试清单

### 认证测试
- [ ] 用户名/密码注册
- [ ] 用户名/密码登录
- [ ] 微软账号登录
- [ ] 退出登录

### Chat 功能测试
- [ ] 发送文本消息
- [ ] 上传图片
- [ ] 创建日程
- [ ] 修改日程
- [ ] 删除日程
- [ ] 查询日程

### 设置页面测试
- [ ] 查看个人信息
- [ ] 修改密码
- [ ] 配置 AI 资源
- [ ] 配置用户提示词
- [ ] 绑定/解绑微软账号
- [ ] 启用 ICS 订阅
- [ ] 切换数据源

### 管理功能测试
- [ ] 创建邀请码
- [ ] 查看邀请码列表
- [ ] 修改邀请码额度
- [ ] 停用邀请码

### PWA 测试
- [ ] 添加到主屏幕
- [ ] 离线访问
- [ ] Service Worker 缓存

## 常见问题

### Q: 部署失败
**检查：**
- Wrangler 版本是否最新
- 是否已登录 Cloudflare
- wrangler.jsonc 配置是否正确

### Q: 数据库连接失败
**检查：**
- D1 数据库是否已创建
- database_id 是否正确
- 表是否已初始化

### Q: 微软登录失败
**检查：**
- Azure 应用配置是否正确
- 重定向 URI 是否匹配
- 权限是否已添加并同意

### Q: AI 响应异常
**检查：**
- AI API Key 是否有效
- API 额度是否充足
- 网络是否正常

## 监控和维护

### 日志查看
```bash
npx wrangler tail
```

### 数据库查询
```bash
npx wrangler d1 execute astraplan --command="SELECT * FROM users LIMIT 10;"
```

### 更新部署
```bash
git pull
npm install
npm run deploy
```

## 回滚

如果需要回滚：
```bash
npx wrangler rollback
```

## 备份

定期备份 D1 数据库：
```bash
npx wrangler d1 export astraplan --output=backup.sql
```

## 安全建议

- [ ] 定期更换 JWT_SECRET
- [ ] 定期更换 ENCRYPTION_KEY
- [ ] 定期审查用户和邀请码
- [ ] 监控 API 使用情况
- [ ] 启用 Cloudflare 安全功能

## 性能优化

- [ ] 启用 Smart Placement
- [ ] 配置合适的缓存策略
- [ ] 监控 Worker 执行时间
- [ ] 优化数据库查询

---

**部署完成日期：** _______________

**部署人员：** _______________

**Workers URL：** _______________

**管理员邀请码：** _______________
