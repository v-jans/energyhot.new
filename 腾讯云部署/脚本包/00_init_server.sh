#!/usr/bin/env bash
# ============================================================
# 00_init_server.sh — 腾讯云轻量服务器初始化（Ubuntu / Debian）
# 做四件事：系统更新、装基础工具、时区设为上海、创建 2G swap
# 用法：root 登录服务器后执行   bash 00_init_server.sh
# ============================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "✗ 请用 root 运行：sudo bash 00_init_server.sh"; exit 1; }

echo "==> 1/4 系统更新（新机器第一次约 1-5 分钟）"
apt-get update -y
apt-get upgrade -y

echo "==> 2/4 安装基础工具"
apt-get install -y curl wget git unzip htop

echo "==> 3/4 时区设为 Asia/Shanghai"
timedatectl set-timezone Asia/Shanghai

echo "==> 4/4 配置 2G swap（构建镜像 / 多容器时防止内存不足被杀进程）"
if swapon --show | grep -q .; then
  echo "    已有 swap，跳过："
  swapon --show
else
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    swap 已创建，并已写入 fstab（重启后仍生效）"
fi

echo
free -h
echo
echo "✓ 初始化完成。下一步：bash 01_install_btpanel.sh"
