#!/usr/bin/env bash
# ============================================================
# 01_install_btpanel.sh — 安装宝塔面板（Ubuntu / Debian）
# 内部执行宝塔官方正式版安装脚本（2026-11 从官网 bt.cn 核对）；
# 官方命令如有更新，以 https://www.bt.cn/new/download 页面为准。
# 用法：bash 01_install_btpanel.sh
# ============================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "✗ 请用 root 运行：sudo bash 01_install_btpanel.sh"; exit 1; }

echo "==> 下载并运行宝塔官方安装脚本（约 2-5 分钟）"
wget -O install_panel.sh https://download.bt.cn/install/install_panel.sh
bash install_panel.sh ed8484bec

echo
echo "==> 面板登录信息如下（面板地址 / 用户名 / 密码，请立即抄录保存）："
bt default

echo
cat <<'EOF'
下一步：
1. 在腾讯云轻量服务器控制台【防火墙】里放行上面显示的面板端口（协议 TCP）；
2. 浏览器打开面板地址，绑定宝塔官网账号后进入面板；
3. 建议在【面板设置】里修改端口和安全入口后再对外使用。
EOF
