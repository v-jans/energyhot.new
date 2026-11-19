#!/usr/bin/env bash
# ============================================================
# aihot_update.sh — AIHOT 版本更新（严格按 docs/deploy.md 的顺序执行）
#   建议备份 → 拉新代码 → 构建 → 停 api/worker/web → 迁移(setup) → 启动
# 用法：bash aihot_update.sh 项目目录 [https]
#   例：bash aihot_update.sh /www/wwwroot/myhot
# 注意：worker 停止时会等付费调用收尾（最长约 8 分钟），属于正常现象，不要中断。
# ============================================================
set -euo pipefail

DIR="${1:-}"
MODE="${2:-}"
[ -d "$DIR" ] || { echo "用法：bash aihot_update.sh 项目目录 [https]"; exit 1; }
cd "$DIR"
[ -f .env ] || { echo "✗ 没有 .env"; exit 1; }

PROFILE=()
[ "$MODE" = "https" ] && PROFILE=(--profile https)

echo "==> 0/5 备份提醒：正式跑之前先备份！"
echo "    手动备份：bash aihot_backup.sh $DIR"
echo "    （配置了 COS 自动备份的话，确认昨天 04:10 的备份正常即可）"
read -r -p "确认已备份，继续更新？(y/N) " yn
[ "$yn" = "y" ] || { echo "已取消。先备份再来。"; exit 1; }

echo "==> 1/5 拉取最新代码"
if [ -d .git ]; then
  git pull --ff-only
else
  echo "✗ 目录不是 git 仓库（本地打包上传的部署方式）。请："
  echo "  1. 在 Mac 上用脚本包里的 mac_pack.sh 打最新源码包；"
  echo "  2. 上传到服务器解压覆盖本目录（.env 与数据卷不受影响）；"
  echo "  3. 重跑本脚本。"
  exit 1
fi

echo "==> 2/5 构建新镜像（走 npmmirror 加速）"
docker compose "${PROFILE[@]}" build --build-arg NPM_REGISTRY=https://registry.npmmirror.com

echo "==> 3/5 停止 api / worker / web（worker 排空任务最长约 8 分钟，请等待）"
docker compose stop api worker web

echo "==> 4/5 跑数据库迁移（setup 失败会中止；不要跳过迁移强行启动）"
docker compose "${PROFILE[@]}" run --rm setup

echo "==> 5/5 启动全部服务"
docker compose "${PROFILE[@]}" up -d
sleep 3
docker compose "${PROFILE[@]}" ps

echo
echo "✓ 更新完成。到后台「运行」页确认版本与定时任务正常。"
echo "  迁移若失败：先看上面的报错处理，重跑本脚本即可（第 1 步 git 已是最新，无害）。"
