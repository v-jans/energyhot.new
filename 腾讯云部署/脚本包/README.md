# 腾讯云轻量服务器部署脚本包

配套《腾讯云轻量服务器部署手册》使用，手册里的章节号在下方对应列出。
目标项目：AIHOT 行业热点网站（本仓库）。`examples/` 里附带了公众号资讯线的
wewe-rss、n8n 两个服务的 compose 示例，以后部署它们时直接复用。

## 一、在 Mac 上执行（1 个）

| 脚本 | 作用 | 对应手册 |
|---|---|---|
| `mac_pack.sh` | 把项目源码打成上传用的 zip（自动排除 node_modules / .git / .data / .env / DS_Store） | 第七章 |

用法：`cd 项目根目录`（有 docker-compose.yml 的那层），然后 `bash /路径/mac_pack.sh`。

## 二、在服务器上执行（按顺序，6 个）

| 脚本 | 作用 | 对应手册 |
|---|---|---|
| `00_init_server.sh` | 系统更新、基础工具、时区上海、创建 2G swap | 第四章 |
| `01_install_btpanel.sh` | 安装宝塔面板（官方正式版脚本），装完自动打印面板地址和账号密码 | 第五章 |
| `02_install_docker.sh` | 命令行装 Docker + Compose，配置国内镜像加速（也可在宝塔软件商店装 Docker，加速配置照抄） | 第六章 |
| `aihot_deploy.sh` | AIHOT 首次部署 / 重建：npmmirror 加速构建 → 启动五容器 | 第八章 |
| `aihot_update.sh` | 版本更新：备份确认 → git pull → 构建 → 停 api/worker/web → 迁移 → 启动 | 第十一章 |
| `aihot_backup.sh` | 手动备份数据库到 /www/backup/aihot（保留 14 份）；完整备份仍建议配 COS 自动备份 | 第十一章 |

服务器侧统一用法：`bash 脚本名 参数`。AIHOT 三个脚本都要传项目目录，
末尾可加可选参数 `https`（走 Caddy 的 HTTPS 方式，需先在 .env 配好域名四件套，
见手册第十章）。

## 三、把脚本包传到服务器

Mac 终端执行（IP 换成你的）：

```bash
scp -r "脚本包目录的路径" root@你的服务器IP:/root/deploy-scripts
```

然后 `ssh root@你的服务器IP`，`cd /root/deploy-scripts` 依次执行。

## 四、examples/（暂不部署，留作公众号资讯线）

- `docker-compose.wewe-rss.yml`：公众号文章转 RSS。安全红线：完全私有化部署 + 专用微信读书小号 + 强 AUTH_CODE。
- `docker-compose.n8n.yml`：自动化工作流引擎。务必先改 `N8N_ENCRYPTION_KEY`。

部署方式与 AIHOT 同理：放独立目录 → 改参数 → `docker compose up -d` → 控制台防火墙放行对应端口。

## 五、两个提醒

1. 镜像加速地址会随时间失效（2026-11 核对可用）。`docker pull` 连续失败时，
   更新 `/etc/docker/daemon.json` 里的地址，或按手册第六章用「离线导入」兜底。
2. `docker compose down -v` 会删掉数据卷（数据库、上传文件、证书）。日常重启用
   `docker compose restart` 或 `stop / up -d`，永远不要随手加 `-v`。
