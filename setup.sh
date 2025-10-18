#!/bin/bash

echo "🚀 AstraPlan 部署脚本"
echo "===================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Create D1 Database
echo -e "\n${YELLOW}步骤 1: 创建 D1 数据库${NC}"
echo "运行以下命令创建数据库："
echo "  npx wrangler d1 create astraplan"
echo ""
echo "然后将返回的 database_id 更新到 wrangler.jsonc 中"
read -p "已完成？按回车继续..."

# Step 2: Initialize Database
echo -e "\n${YELLOW}步骤 2: 初始化数据库${NC}"
npx wrangler d1 execute astraplan --file=./schema.sql
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 数据库初始化成功${NC}"
else
    echo -e "${RED}✗ 数据库初始化失败${NC}"
    exit 1
fi

# Step 3: Setup Secrets
echo -e "\n${YELLOW}步骤 3: 配置环境变量${NC}"

echo "设置 JWT 密钥..."
JWT_SECRET=$(openssl rand -base64 32)
echo "$JWT_SECRET" | npx wrangler secret put JWT_SECRET

echo "设置加密密钥..."
ENCRYPTION_KEY=$(openssl rand -base64 32)
echo "$ENCRYPTION_KEY" | npx wrangler secret put ENCRYPTION_KEY

echo -e "\n${YELLOW}请输入微软 OAuth 配置:${NC}"
read -p "MS_CLIENT_ID: " MS_CLIENT_ID
echo "$MS_CLIENT_ID" | npx wrangler secret put MS_CLIENT_ID

read -p "MS_CLIENT_SECRET: " MS_CLIENT_SECRET
echo "$MS_CLIENT_SECRET" | npx wrangler secret put MS_CLIENT_SECRET

read -p "MS_REDIRECT_URI (e.g., https://your-domain.workers.dev/api/auth/ms/callback): " MS_REDIRECT_URI
echo "$MS_REDIRECT_URI" | npx wrangler secret put MS_REDIRECT_URI

read -p "RP_NAME (e.g., AstraPlan): " RP_NAME
echo "$RP_NAME" | npx wrangler secret put RP_NAME

read -p "RP_ID (e.g., your-domain.workers.dev): " RP_ID
echo "$RP_ID" | npx wrangler secret put RP_ID

echo -e "\n${YELLOW}是否配置共享 AI 资源？(y/n)${NC}"
read -p "> " SETUP_AI
if [ "$SETUP_AI" = "y" ]; then
    read -p "SHARED_AI_API_KEY: " SHARED_AI_API_KEY
    echo "$SHARED_AI_API_KEY" | npx wrangler secret put SHARED_AI_API_KEY
    
    read -p "SHARED_AI_BASE_URL (可选): " SHARED_AI_BASE_URL
    if [ -n "$SHARED_AI_BASE_URL" ]; then
        echo "$SHARED_AI_BASE_URL" | npx wrangler secret put SHARED_AI_BASE_URL
    fi
    
    read -p "SHARED_AI_MODEL (可选): " SHARED_AI_MODEL
    if [ -n "$SHARED_AI_MODEL" ]; then
        echo "$SHARED_AI_MODEL" | npx wrangler secret put SHARED_AI_MODEL
    fi
fi

# Step 4: Create Admin Invite Code
echo -e "\n${YELLOW}步骤 4: 创建管理员邀请码${NC}"
ADMIN_CODE="ADMIN-$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')-$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')"
npx wrangler d1 execute astraplan --command="INSERT INTO users (invite_code, remaining_quota, is_admin) VALUES ('$ADMIN_CODE', 9999, 1);"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 管理员邀请码创建成功${NC}"
    echo -e "${GREEN}管理员邀请码: $ADMIN_CODE${NC}"
    echo -e "${YELLOW}请保存此邀请码，用于注册管理员账号${NC}"
else
    echo -e "${RED}✗ 创建失败${NC}"
fi

# Step 5: Deploy
echo -e "\n${YELLOW}步骤 5: 部署到 Cloudflare Workers${NC}"
read -p "现在部署？(y/n): " DEPLOY
if [ "$DEPLOY" = "y" ]; then
    npm run deploy
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 部署成功！${NC}"
    else
        echo -e "${RED}✗ 部署失败${NC}"
        exit 1
    fi
fi

echo -e "\n${GREEN}===================="
echo -e "🎉 设置完成！"
echo -e "====================${NC}"
echo ""
echo "下一步："
echo "1. 访问你的 Workers 域名"
echo "2. 使用管理员邀请码: $ADMIN_CODE"
echo "3. 注册管理员账号"
echo "4. 开始使用！"
echo ""
