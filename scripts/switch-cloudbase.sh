#!/bin/bash
# 切换小程序到微信云托管通道
# 用法: bash switch-cloudbase.sh <公网域名> <环境ID> [服务名]
set -e
DOMAIN="$1"
ENVID="$2"
SVC="${3:-xiyuzero-api}"
if [ -z "$DOMAIN" ] || [ -z "$ENVID" ]; then
  echo "用法: bash switch-cloudbase.sh <公网域名> <环境ID> [服务名]"
  exit 1
fi
cd "$(dirname "$0")/../.."
MINI="/Users/madrid/WorkBuddy/2026-09-20-20-14-06/xiyuzero-miniprogram"
cd "$MINI"

# 1. 改 .env
cat > .env << EOF
# API 基址：小程序内 TTS 发音走 InnerAudioContext.src（downloadFile 域名校验），
# 数据接口在 USE_CLOUDBASE=1 时走 callContainer（免域名校验）。
# 两者都指向云托管默认域名（腾讯已备案）。
TARO_APP_API_BASE=https://$DOMAIN
# 云托管通道开关与目标（数据接口走 callContainer）
TARO_APP_USE_CLOUDBASE=1
TARO_APP_CLOUDBASE_ENV=$ENVID
TARO_APP_CLOUDBASE_SERVICE=$SVC
EOF
echo "=== .env 已更新 ==="
cat .env

# 2. 验证服务可达
echo "=== 验证 API ==="
code=$(curl -s --noproxy '*' -o /tmp/api-check.json -w "%{http_code}" "https://$DOMAIN/api/units?pageSize=1")
echo "GET /api/units?pageSize=1 → $code"
head -c 120 /tmp/api-check.json; echo
[ "$code" = "200" ] || echo "⚠️ API 未返回 200，请检查部署状态"

# 3. 重新构建
echo "=== build:weapp ==="
npm run build:weapp 2>&1 | tail -3
echo "=== 完成 ==="
