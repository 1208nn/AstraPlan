#!/bin/bash

echo "🔍 AstraPlan 项目验证"
echo "===================="

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

checks_passed=0
checks_total=0

check() {
    checks_total=$((checks_total + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}✗${NC} $2"
    fi
}

echo -e "\n${YELLOW}检查项目文件...${NC}"
[ -f "package.json" ]; check $? "package.json 存在"
[ -f "wrangler.jsonc" ]; check $? "wrangler.jsonc 存在"
[ -f "schema.sql" ]; check $? "schema.sql 存在"
[ -f "tsconfig.json" ]; check $? "tsconfig.json 存在"

echo -e "\n${YELLOW}检查源代码...${NC}"
[ -f "src/index.ts" ]; check $? "主入口文件存在"
[ -d "src/api" ]; check $? "API 目录存在"
[ -d "src/services" ]; check $? "服务目录存在"
[ -d "src/db" ]; check $? "数据库目录存在"
[ -d "src/utils" ]; check $? "工具目录存在"

echo -e "\n${YELLOW}检查前端文件...${NC}"
[ -f "public/index.html" ]; check $? "HTML 文件存在"
[ -f "public/app.js" ]; check $? "JavaScript 文件存在"
[ -f "public/manifest.json" ]; check $? "PWA Manifest 存在"
[ -f "public/sw.js" ]; check $? "Service Worker 存在"

echo -e "\n${YELLOW}检查文档...${NC}"
[ -f "README.md" ]; check $? "README.md 存在"
[ -f "QUICKSTART.md" ]; check $? "QUICKSTART.md 存在"
[ -f "DEPLOYMENT.md" ]; check $? "DEPLOYMENT.md 存在"
[ -f "FEATURES.md" ]; check $? "FEATURES.md 存在"

echo -e "\n${YELLOW}检查 TypeScript 语法...${NC}"
if command -v npx &> /dev/null; then
    if npx tsc --noEmit &> /dev/null; then
        check 0 "TypeScript 编译检查通过"
    else
        check 1 "TypeScript 编译检查失败"
    fi
else
    echo -e "${YELLOW}⚠${NC} 跳过 TypeScript 检查（未安装）"
fi

echo -e "\n===================="
echo -e "总计: ${checks_passed}/${checks_total} 通过"

if [ $checks_passed -eq $checks_total ]; then
    echo -e "${GREEN}✓ 项目验证通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 项目验证失败${NC}"
    exit 1
fi
