#!/usr/bin/env bash
# ============================================================
# mac_pack.sh — 在 Mac 上把 AIHOT 项目源码打成「上传服务器用的 zip」
# 自动排除：node_modules、.git、.data（本地数据）、.env（密钥）、DS_Store
# 用法：cd 到项目根目录后执行   bash mac_pack.sh
# 产出：当前目录下 aihot-src.zip（.env 请单独上传，见手册第七章）
# ============================================================
set -euo pipefail

NAME="${1:-aihot-src}"
OUT="$(pwd)/${NAME}.zip"

[ -f docker-compose.yml ] || { echo "✗ 请先 cd 到项目根目录（有 docker-compose.yml 的那层）再运行"; exit 1; }
rm -f "$OUT"

echo "==> 打包源码（排除依赖/密钥/本地数据）"
zip -rq "$OUT" . \
  -x "node_modules/*" \
  -x "*/node_modules/*" \
  -x ".git/*" \
  -x ".data/*" \
  -x ".env" \
  -x "*.DS_Store" \
  -x "*/.DS_Store"

echo "✓ 打包完成：$OUT"
ls -lh "$OUT"
echo
cat <<'EOF'
接下来（手册第七章）：
1. 宝塔面板【文件】→ 进入 /www/wwwroot → 上传这个 zip → 解压；
2. 单独上传 .env（不要打进 zip，也不要提交 Git）；
3. 服务器上执行：bash aihot_deploy.sh /www/wwwroot/解压后的目录名
提示：项目里如果新增了其他构建产物目录，在 -x 参数里照样加一行排除。
EOF
