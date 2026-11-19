#!/usr/bin/env bash
# ============================================================
# aihot_deploy.sh — AIHOT 首次部署 / 重新构建（对齐 docs/deploy.md）
# 用法：bash aihot_deploy.sh 项目目录 [https]
#   例：bash aihot_deploy.sh /www/wwwroot/myhot
#       bash aihot_deploy.sh /www/wwwroot/myhot https   （走 Caddy 的 HTTPS 方式）
# 前提：目录里有完整代码、docker-compose.yml，以及填好的 .env（含 SITE_URL）
# ============================================================
set -euo pipefail

DIR="${1:-}"
MODE="${2:-}"
[ -d "$DIR" ] || { echo "用法：bash aihot_deploy.sh 项目目录 [https]"; exit 1; }
cd "$DIR"
[ -f .env ] || { echo "✗ $DIR 下没有 .env：请先把 .env 传上来（见手册第七章），SITE_URL 要写成实际访问地址"; exit 1; }
[ -f docker-compose.yml ] || { echo "✗ $DIR 下没有 docker-compose.yml"; exit 1; }

PROFILE=()
[ "$MODE" = "https" ] && PROFILE=(--profile https)

echo "==> 1/2 构建镜像（国内服务器统一走 npmmirror 加速 npm 下载）"
docker compose "${PROFILE[@]}" build --build-arg NPM_REGISTRY=https://registry.npmmirror.com

echo "==> 2/2 启动（首次启动 setup 会先跑数据库迁移 + 种子数据，再拉起其余服务）"
docker compose "${PROFILE[@]}" up -d
sleep 3
docker compose "${PROFILE[@]}" ps

echo
cat <<'EOF'
✓ 部署完成。首次启动后约半小时内容才陆续出来（每条资料要过模型）。
  打开   http://服务器IP:3000        （HTTPS 站点用你的域名）
  后台   http://服务器IP:3000/admin  密码是 .env 里的 ADMIN_PASSWORD
  日志   docker compose logs -f --tail 100 api worker web
  防火墙：控制台放行 3000（或 HTTPS 时的 80/443），见手册第九章。
EOF
