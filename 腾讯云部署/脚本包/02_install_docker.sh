#!/usr/bin/env bash
# ============================================================
# 02_install_docker.sh — 命令行安装 Docker + Compose，并配置国内镜像加速
# 说明：如果你已在宝塔【软件商店】安装「Docker 管理」，可以不执行本脚本，
#       但镜像加速仍建议按下文的 daemon.json 配置（宝塔 Docker 设置里填同样内容）。
# 加速地址会随时间失效（2026-11 核对可用），失效时更新 daemon.json 即可。
# 用法：bash 02_install_docker.sh
# ============================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "✗ 请用 root 运行：sudo bash 02_install_docker.sh"; exit 1; }

if command -v docker >/dev/null 2>&1; then
  echo "==> 已安装 Docker：$(docker --version)，跳过安装步骤"
else
  echo "==> 安装 Docker 与 Compose 插件（Ubuntu 官方源）"
  apt-get update -y
  apt-get install -y docker.io docker-compose-v2
fi

systemctl enable --now docker

echo "==> 写入国内镜像加速配置 /etc/docker/daemon.json（原配置自动备份）"
mkdir -p /etc/docker
cp -f /etc/docker/daemon.json /etc/docker/daemon.json.bak 2>/dev/null || true
cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run",
    "https://dytt.online"
  ]
}
EOF
systemctl restart docker

echo "==> 验证：拉取并运行测试镜像 hello-world"
if docker run --rm hello-world >/dev/null 2>&1; then
  echo "✓ Docker 就绪（镜像拉取正常）"
else
  echo "✗ 拉取失败：加速地址可能已失效。两个办法："
  echo "  1. 参照手册第六章，把 daemon.json 里的地址换成最新可用清单里的；"
  echo "  2. 用「离线导入」：Mac 上 docker save 打包镜像 → 上传 → docker load（见手册第六章）。"
  exit 1
fi

docker compose version
echo
echo "✓ 完成。AIHOT 部署请继续：上传代码后执行 aihot_deploy.sh"
