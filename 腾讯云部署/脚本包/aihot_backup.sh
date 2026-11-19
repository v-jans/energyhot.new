#!/usr/bin/env bash
# ============================================================
# aihot_backup.sh — 手动备份数据库（pg_dump 导出为压缩包）
# 注意：只包含数据库，不含上传的图片等附件文件。
# 完整备份（数据库 + 附件）推荐在 .env 配置 DB_BACKUP_STORE_* 用腾讯云 COS
# 自动备份（每天 04:10，见手册第十一章）。
# 用法：bash aihot_backup.sh 项目目录 [备份输出目录]
# ============================================================
set -euo pipefail

DIR="${1:-}"
DEST="${2:-/www/backup/aihot}"
[ -d "$DIR" ] || { echo "用法：bash aihot_backup.sh 项目目录 [备份输出目录]"; exit 1; }
mkdir -p "$DEST"
FILE="$DEST/aihot-$(date +%Y%m%d-%H%M).sql.gz"

cd "$DIR"
echo "==> 导出数据库到 $FILE"
docker compose exec -T db pg_dump -U aihot aihot | gzip > "$FILE"

echo "✓ 数据库已备份："
ls -lh "$FILE"

# 只保留最近 14 份
ls -1t "$DEST"/aihot-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo
echo "恢复方法（见 docs/deploy.md「备份」）：用 pg_restore 把 .dump/.sql 恢复到空数据库。"
echo "上传到别处才算真备份：建议顺手把最新的包下载回 Mac，或直接用 COS 自动备份。"
