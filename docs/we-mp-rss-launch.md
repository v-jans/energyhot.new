# WeRSS（rachelos/we-mp-rss）落地手册：为 hot-news 提供公众号 RSS

> 适用对象：hot-news 运维/开发者 · 编写日期：2026-11-17
> 上游项目：`https://github.com/rachelos/we-mp-rss`（MIT，v1.0 滚动发布，★5,199）
> 配套决策依据：[公众号信源替代方案选型报告](./wechat-source-options.md)
>
> 本手册只写运维操作与配置，不涉及业务代码实现。所有字段名、路径、默认值均取自上游仓库 `config.example.yaml`、`apis/rss.py`、`apis/mps.py`、`docs/weread-mp.md`、`docs/security-defaults.md` 与 hot-news 本地源码。

---

## 0. 先回答：需要你补充的关键信息

以下 10 项无法从公开资料推断，请逐项确认。括号里是**信息不足时采用的默认假设**——若默认值不成立，请按「影响」列回改。

| # | 需你补充的信息 | 为什么关键 | 默认假设 | 若假设不成立的影响 |
|---|---|---|---|---|
| 1 | **部署位置**：一台什么机器？有 Docker 吗？能否固定公网出口 IP？ | 微信侧按 IP 风控；出口 IP 频繁变化会频繁触发「环境异常」 | 一台 Linux 云主机，Docker 24+，固定公网 IP，仅内网访问 `:8001` | 家庭宽带/动态 IP → 授权频繁失效，需改走代理或放弃自建 |
| 2 | **一个可扫码的微信公众平台账号**：谁能用管理员微信扫码？ | 采集依赖**公众号后台登录态**（token + cookie），不是普通微信号扫码 | 有一个自有公众号，管理员微信可由运维联系到，扫码频次接受约每 2~4 周一次 | 没有公众号 → 方案不可行，直接跳到 §6 替代方案 |
| 3 | **扫码人是否愿意承担账号风险** | 登录态来自微信公众平台后台，非公开接口，存在被风控的可能 | 用**专用小号/测试公众号**，不用公司主号 | 只能用主号 → 需先做风险审批，或改用替代方案 |
| 4 | **8 个目标号的确切名称与 `ghid`** | WeRSS 通过名称搜索公众号入库，hot-news 侧要对齐身份 | 沿用 `industry/sources.json` 的 8 个号，先试点 2 个（天合富家户用光伏官方号、智汇光伏） | 名称有重名/仿冒 → 必须用 `ghid` 或文章链接反查确认 |
| 5 | **hot-news 部署形态**：和 WeRSS 同机 / 同内网 / 跨公网？ | 决定 RSS URL 是内网 IP 还是域名，以及是否要加认证 | 同机或同内网，RSS 走 `http://<内网IP>:8001/feed/...` | 跨公网 → 必须加反代 + TLS + IP 白名单，不能裸暴露 |
| 6 | **通知渠道**：飞书机器人 webhook（用于授权过期告警） | 授权失效若无人知晓，站点会静默断更 | 新建一条专用飞书机器人 webhook，填入 `FEISHU_WEBHOOK`；建议 `SEND_CODE=True` 让通知带二维码 | 无通知 → 必须人工每日巡检，否则断更不可见 |
| 7 | **全文合规口径**：摘要展示还是全文展示？ | WeRSS 默认输出全文 RSS，与 hot-news「公众号不展示全文」冲突 | **保持 hot-news 的 `site_fulltext` 关闭**；WeRSS 侧 `RSS_FULL_CONTEXT=False`，只把 RSS 当「标题 + 摘要 + 时间 + 原文链接」来源（§3.3 解释） | 若要站内全文 → 需单独法务确认，本手册不覆盖 |
| 8 | **试点窗口与验收人**：谁看结果、看多久 | 没有明确决策门，试点会无限延长 | 2 周；运营负责人 + 运维各一人；验收指标见 §5 | 无人验收 → 不要启动试点 |
| 9 | **数据保留策略** | WeRSS 的 SQLite 会持续积累文章全文 | 保留 90 天，`data/` 目录每日备份，不进 git | 合规/存储要求更严 → 需设置 `ARTICLE.TRUE_DELETE=True` 并定期清理 |
| 10 | **是否已有 `RSSHub` / 其他 RSS 网关在同一机器** | 避免端口与路径冲突 | 无冲突，独占 `:8001` | 端口占用 → 改 `PORT` 并同步改所有 feed URL |

---

## 1. 适用场景与前置条件

### 1.1 适用

- 目标是**补盲**：为 hot-news 的 8 个公众号号提供一个不受按次计费约束的通道；
- 已经拥有可用于扫码的自有公众号，且运维能联系到扫码人；
- 部署环境是固定公网出口 IP 的 Linux 主机；
- 接受「小时级延迟」而非分钟级——`GATHER.CONTENT_AUTO_INTERVAL` 默认 59 分钟，RSS 不是实时流；
- 号数控制在 **20 个以内**。超过后应考虑级联模式或回到商业 API（见选型报告 §5.3）。

### 1.2 不适用

- 没有可扫码的公众号，或不允许用任何真实微信账号登录第三方工具；
- 需要分钟级时效（hot-news 现有 `mp_account` 最短 15 分钟）；
- 需要完整历史回补——WeRSS 默认 `MAX_PAGE=5`，只采最近若干页，不能替代存档；
- 需要 SLA 与赔付的商业场景——这是社区项目，无服务承诺。

### 1.3 前置条件清单（逐项打勾再开始）

- [ ] Linux 主机（建议 2C4G 起），Docker 24+ 与 Docker Compose 插件可用
- [ ] 固定公网出口 IP，且能访问 `mp.weixin.qq.com`
- [ ] 一个自有公众号 + 管理员微信在场
- [ ] `data/` 挂载目录已规划，磁盘剩余 ≥ 10 GB
- [ ] 一条专用飞书机器人 webhook
- [ ] hot-news 的管理员账号可用（用于建信源、试抓、改参与方式）
- [ ] 已读并接受 hot-news 的合规红线：`site_fulltext` / `syndicate_fulltext` 保持关闭

---

## 2. 整体流程

```
阶段 A 获取与部署  →  阶段 B 关键配置  →  阶段 C 扫码授权
      ↓
阶段 D 数据源接入（WeRSS 建订阅 → hot-news 建 rss 信源）
      ↓
阶段 E 运行验证（Feed 层 → 条目层 → hot-news 入库层 → 7 天观察）
      ↓
阶段 F 故障排查（按需）  ⇄  阶段 G 日常维护（周期）
      ↓
决策门（2 周）：推广 / 保持混合 / 回退
```

**关键原则：全程双跑。** 试点期间不停用对应的 `mp_account` 源；两套链路同时入库，用同一批文章比对时间、标题、正文状态，再决定是否切换。

---

## 3. 分阶段执行步骤

### 阶段 A：项目获取与部署

**A1. 获取项目（两种方式，任选其一）**

```bash
# 方式一：只拉官方镜像，不克隆源码（推荐，升级最简单）
docker pull ghcr.io/rachelos/we-mp-rss:latest

# 方式二：国内网络慢时用加速镜像
docker pull docker.1ms.run/rachelos/we-mp-rss:latest

# 如需查看配置样例或排查问题，再克隆源码到运维目录（不要放进 hot-news 仓库）
git clone --depth 1 https://github.com/rachelos/we-mp-rss.git /opt/werss-src
```

> 上游 `Dockerfile` 已内置前端静态资源，**不需要自己编译前端**。

**A2. 准备目录与权限**

```bash
mkdir -p /opt/werss/data
chmod 700 /opt/werss/data        # 目录内有 wx.lic（登录态）与文章全文
```

**A3. 用 Compose 部署（SQLite，8 个号足够）**

在 `/opt/werss/docker-compose.yaml` 写入以下内容。这是上游 `compose/docker-compose-sqlite.yaml` 的安全加固版——**关键改动是端口只绑 `127.0.0.1`、默认口令必须替换**：

```yaml
services:
  we-mp-rss:
    image: ghcr.io/rachelos/we-mp-rss:latest
    container_name: we-mp-rss
    restart: unless-stopped
    ports:
      - "127.0.0.1:8001:8001"
    environment:
      TZ: Asia/Shanghai
      DB: sqlite:////app/data/we_mp_rss.db
      USERNAME: "<改成强用户名，不要用 admin>"
      PASSWORD: "<改成 20 位以上强随机密码>"
      SECRET_KEY: "<改成强随机串，openssl rand -hex 32>"
      PORT: "8001"
    volumes:
      - ./data:/app/data
```

**A4. 启动与初检**

```bash
cd /opt/werss && docker compose up -d
docker logs -f we-mp-rss --tail 100     # 看到 Uvicorn 监听 8001 即可 Ctrl-C 退出
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/   # 期望 200
```

首次启动会在 `data/` 下生成 `db.db`（或 `we_mp_rss.db`）、`wx.lic`、`cache/`。**确认这些文件没有被 git 跟踪、没有写进任何公开目录。**

### 阶段 B：关键配置

**B1. 配置优先级与已知坑**

上游支持「环境变量覆盖 `config.yaml` 占位符」。**注意：README 环境变量表与 `config.example.yaml` 的默认值存在冲突**——

| 配置项 | README 写的默认 | config.example.yaml 写的默认 | 处理 |
|---|---|---|---|
| `GATHER.CONTENT` | `True` | `False` | **显式设置**，不要依赖默认 |
| `GATHER.MODEL` | `app` | `web` | **显式设置**为 `app` |
| `GATHER.CONTENT_AUTO_CHECK` | `False` | `True` | **显式设置**为 `True` |

**B2. 落地建议配置（追加到 A3 的 `environment:`，然后 `docker compose up -d` 重建）**

```yaml
      # 采集模式与正文
      GATHER.MODEL: "app"                    # 列表采集走公众平台接口；异常时按 §6.1 切换
      GATHER.CONTENT: "True"                 # 必须采集正文，否则 RSS 只有标题
      GATHER.CONTENT_AUTO_CHECK: "True"      # 自动补采空正文文章
      GATHER.CONTENT_AUTO_INTERVAL: "59"     # 分钟；低于 30 容易触发风控
      GATHER.CONTENT_BATCH_SIZE: "5"
      GATHER.CONTENT_FALLBACK: "True"
      MAX_PAGE: "5"                          # 每个号每次最多翻 5 页列表

      # RSS 输出（重点：与 hot-news 合规口径对齐）
      RSS_FULL_CONTEXT: "False"              # 只输出摘要，不输出全文
      RSS_LOCAL: "False"                     # link 保持 mp.weixin.qq.com 原文地址
      RSS_BASE_URL: "http://127.0.0.1:8001"  # 若 hot-news 在另一台机器，改成内网 IP
      RSS_PAGE_SIZE: "30"                    # 每页条目数；hot-news 首次导入上限 30 条，正好对齐
      RSS_CDATA: "False"

      # 授权与通知
      TOKEN_EXPIRE_MINUTES: "4320"           # 登录会话 3 天
      SEND_CODE: "True"                      # 过期通知附带二维码，减少人工步骤
      FEISHU_WEBHOOK: "<你的飞书机器人 webhook>"
      CODE_TITLE: "WeRSS授权过期-需要重新扫码"

      # 安全：保持默认关闭，不要打开
      ENABLE_CUSTOM_RSS_TEMPLATE: "False"
      ENABLE_WEB_UPDATER: "False"
      SAFE_HIDE_CONFIG: "db,secret,token,weread.cookie,weread.ticket,notice.wechat,notice.feishu,notice.dingding"
```

**B3. 两个必须解释清楚的配置**

- **`RSS_FULL_CONTEXT=False`**：不会让 RSS 带全文。hot-news 只把它当「标题 + 摘要 + 发布时间 + 原文链接」的来源，符合 `docs/sources.md:224`「公众号不因技术上抓得到就获得全文展示」。如果你误设为 `True`，hot-news 的 `rss.ts` 会把 `content:encoded` 当正文抓进去——虽然站上仍不展示全文，但数据传输面变大、合规口径变复杂，**不建议**。
- **`RSS_LOCAL=False`**：保证 RSS 里 `<link>` 是 `mp.weixin.qq.com/s/...` 原文链接，hot-news 的身份归一、发布方前缀判定、原文跳转才成立。设为 `True` 会把 link 改成本地 `/views/article/{id}`，hot-news 会把内容算到自建服务名下，**不要改**。

**B4. 创建 Access Key（后续自动校验 Feed 用）**

浏览器打开 `http://<部署机内网IP>:8001` → 用 A3 设置的管理员账号登录 → 「Access Key 管理」→ 创建 AK，权限只勾 `read`，**Secret Key 只显示一次，立刻存进运维密码库**。AK 用于 `Authorization: AK-SK <ak>:<sk>` 调用 API；本方案的 RSS 读取本身不需要鉴权，AK 主要用于 §5 的自动巡检。

### 阶段 C：微信扫码授权

**C1. 授权到底授权什么**

WeRSS 通过**公众号后台登录态**取文章列表：`driver/token.py` 保存 `token` / `cookie` / `fingerprint` / `expiry` 到 `data/wx.lic`（若配了 Redis 则同时存 Redis）。因此：

- 扫码用的是**微信公众平台后台的管理员微信**，不是普通个人微信；
- 登录态会过期，`jobs/failauth.py` 会按 `CODE_TITLE` 推送通知；`SEND_CODE=True` 时通知里带二维码；
- 登录态文件 `wx.lic` 等同于账号凭证，必须按密钥管理。

**C2. 操作步骤**

1. 浏览器访问 `http://<部署机内网IP>:8001`，用 A3 的账号登录；
2. 进入扫码授权页，页面显示二维码；
3. 由公众号管理员微信扫码并在手机上确认；
4. 页面提示授权成功后，检查 `data/wx.lic` 已写入 `token_data`，且通知渠道收到「WeRss授权成功」（若开启）；
5. 记录本次授权日期。**建议日历提醒：2 周后检查一次登录态，4 周后准备重新扫码。**

**C3. 授权成功的判定**

```bash
docker exec we-mp-rss sh -c 'python -c "import json;d=json.load(open(\"/app/data/wx.lic\"));t=d.get(\"token_data\",{});print(\"token_present:\",bool(t.get(\"token\")),\"expiry:\",t.get(\"expiry\",{}).get(\"expiry_time\"))"'
```

输出 `token_present: True` 且有到期时间即为成功。**不要把这条命令的输出贴到聊天或工单里**——它含会话凭证。

### 阶段 D：数据源接入

**D1. 在 WeRSS 侧建订阅（Web UI，最简单）**

1. 管理界面 → 「订阅」→ 搜索公众号名称 → 核对头像与简介（防重名仿冒）→ 添加；
2. 添加后系统会立刻入队一次抓取（`/mps` 的 `add_mp` 会调用 `WxGather().Model().get_Articles`）；
3. 等 3~10 分钟，确认该号出现在订阅列表且文章数 > 0；
4. 记下该号的 **Feed ID**（形如 `MP_WXS_...`），RSS 地址格式：

```
http://<内网IP>:8001/feed/<Feed_ID>.xml      # RSS 2.0
http://<内网IP>:8001/feed/<Feed_ID>.atom     # Atom
http://<内网IP>:8001/feed/<Feed_ID>.json     # JSON Feed
http://<内网IP>:8001/feed/all.xml            # 全部订阅聚合（不建议给 hot-news 用）
```

> 规格说明：`/feed/{feed_id}.{ext}` 支持 `limit`（1~100，默认 10）与 `offset` 参数。给 hot-news 用**不要加 `limit`**，保持与首页一致，避免分页参数变化导致 `configHash` 反复更新。

**D2. 在 hot-news 侧建 rss 信源（后台「信源」页，不要改 `sources.json`）**

`industry/sources.json` 只在首次启动导入、已存在的不会覆盖；上线后一律走后台。新建时按下列字段填：

| 字段 | 填什么 | 理由 |
|---|---|---|
| `kind` | `rss` | — |
| `id` | `mp-rss-<短名>`，如 `mp-rss-zhihuiguangfu` | 与现有 `mp-*` 区分，便于试点期双跑比对 |
| `config.feedUrl` | `http://<内网IP>:8001/feed/<Feed_ID>.xml` | 指向自建网关 |
| `config.publishedAtUtcOffset` | `"+08:00"` | WeRSS 的 `publish_time` 按北京时间落库；显式声明避免按运行机器时区解析 |
| `config.summaryIsBody` | `false`（保持默认） | WeRSS 的 `description` 是摘要，不应冒充全文 |
| `interval_minutes` | `60` | 与 WeRSS 的 59 分钟补采节奏对齐；不要设 15 分钟徒增请求 |
| `tier` | 与原 `mp_account` 一致（`T1_5` / `T2`） | 入选门槛不变 |
| `participation_mode` | **试点期 `isolated`** | 先在后台「试抓」看抓到什么，确认无误后再改 `editorial` |
| `site_fulltext` | `false` | 合规硬约束 |
| `tier` 外的发布方字段 | 原样迁移 `publisherRole` / `owner_entity_id`（若有） | 保持一手判定不变 |

**D3. 先「试抓」，再放开**

后台信源详情页 → 「试抓一次」→ 检查返回的标题、时间、URL、正文状态。只有试抓结果里 `<link>` 是 `mp.weixin.qq.com/s/...`、时间正确、无乱码，才把 `participation_mode` 从 `isolated` 改为 `editorial`。

> 试点期**保留原 `mp_account` 源并设为 `editorial`**，新 `rss` 源设 `isolated`。这样日报不受影响，同时能在库里比对两套数据。

### 阶段 E：运行验证（3 层验收，缺一不可）

**E1. Feed 层（WeRSS 输出对不对）**

```bash
curl -sS "http://127.0.0.1:8001/feed/<Feed_ID>.xml" | head -c 2000
```

逐项检查：

- [ ] 有 `<item>`，数量与公众号近期发文量相符
- [ ] `<link>` 是 `https://mp.weixin.qq.com/s/...`，不是 `/views/article/...`
- [ ] `<pubDate>`（或 `dc:date`）存在且是北京时间；**缺时间的条目 hot-news 会拒绝公开**
- [ ] `<description>` 是摘要，`<content:encoded>` 为空（因 `RSS_FULL_CONTEXT=False`）
- [ ] 没有 `当前环境异常`、`该内容已被发布者删除` 之类的占位文本

**E2. 条目层（hot-news 解析对不对）**

在后台信源页「试抓」结果里看：

- [ ] `url` 为 `mp.weixin.qq.com/s/...`
- [ ] `publishedAt` 有值且在合理范围（不是 1970、不是明天）
- [ ] `excerpt` 有摘要文字
- [ ] `bodyStatus` 为 `pending` 属**预期行为**——`rss.ts:127` 规定正文 <280 字且 `summaryIsBody=false` 时标记待抓原文。此时 hot-news 会回头请求 `mp.weixin.qq.com` 抓正文。若大量 `bodyStatus` 长期停在 `pending`，说明原文页抓取失败，见 §6.3。

**E3. 入库层（7 天观察）**

每天记录一张对照表，试点 2 个号 × 14 天：

| 日期 | 号 | 原 `mp_account` 新增条数 | 新 `rss` 新增条数 | 新源缺的原源条目 | 新源 `publishedAt` 偏差 | 扫码/告警次数 |
|---|---|---:|---:|---|---|---|

**通过标准**（全部满足才推广）：

- 新源覆盖原源的 **≥ 95%**（按文章 URL 去重比对）
- `publishedAt` 偏差 ≤ 2 小时
- 14 天内手动扫码 ≤ 1 次
- 无连续 24 小时以上的静默断更
- 无「环境异常」告警

**E4. 注意首次导入的正常现象**

hot-news 对新信源首次导入只取前 30 条 / 12 个月内，且「首次发现时已发布超过 48 小时」的条目按原文时间归档，**不进当日日报**。所以 Feed 里有文章、后台试抓有条目、日报里却看不到——这是规则生效，不是故障。等新文章发布后再验收。

### 阶段 F：常见故障排查

| 现象 | 最可能原因 | 处理 |
|---|---|---|
| **F1. 文章列表为空 /「当前环境异常」** | 微信公众平台登录态失效或 IP 被风控 | 看飞书告警 → 重新扫码（§C2）；若 2 天内反复失效，停 24 小时并换出口 IP，不要加密集重试 |
| **F2. 扫码后仍取不到列表** | `GATHER.MODEL` 与实际接口不匹配 | 把 `GATHER.MODEL` 从 `app` 改为 `web` 重建容器；仍失败再试 `api`；三者都失败说明接口变更，转 §6 替代方案 |
| **F3. Feed 有条目但正文为空** | `GATHER.CONTENT=False` 或补采未跑 | 确认显式设了 `GATHER.CONTENT=True`、`GATHER.CONTENT_AUTO_CHECK=True`；在管理页手动触发一次文章补采 |
| **F4. RSS 长时间不更新** | 定时任务没开，或缓存 TTL 未过 | 确认 `ENABLE_JOB=True`；上游要求「UI 消息任务里也要添加定时任务」，检查管理页任务列表；临时验证可访问 `/rss/<feed_id>/fresh` 强制刷新 |
| **F5. hot-news 侧条目全被判为旧文** | Feed 里只有存量、发布时间超 48 小时 | 属首次导入正常现象（E4）；等新发文，不要改 hot-news 的时间规则 |
| **F6. hot-news 侧 `bodyStatus` 长期 `pending`** | hot-news 回头抓 `mp.weixin.qq.com` 原文页失败（防盗链/风控） | 核对 hot-news 的抓取日志；不要靠打开 `RSS_FULL_CONTEXT` 绕过合规口径；必要时临时给该源配 `summaryIsBody=true` 并接受「摘要当正文」的质量损失 |
| **F7. 文章时间错乱（1970 / 未来）** | `publishedAtUtcOffset` 未设或 feed 缺 `pubDate` | 给该源补 `"+08:00"`；若 Feed 本身无 `<pubDate>`，该源不可用，回退原 `mp_account` |
| **F8. 容器重启后登录态丢失** | `data/` 未持久化或 `wx.lic` 被覆盖 | 确认 Compose 的 `./data:/app/data` 挂载；检查是否用了两个不同的 compose 文件管理同一容器 |
| **F9. 管理页能登录但 API 401** | AK 权限不足或 Bearer/AK-SK 混用 | AK 走 `Authorization: AK-SK <ak>:<sk>`；管理界面 JWT 走 Bearer；本方案 RSS 读取无需鉴权 |
| **F10. 上游升级后行为变化** | 滚动发布 `latest` 标签 | 固定镜像摘要（`image: ghcr.io/rachelos/we-mp-rss@sha256:...`），升级前先在测试容器跑 48 小时 |

**排查入口**：`docker logs --tail 200 we-mp-rss`；仓库根目录有 `diagnose_config.py`、`quick_check_parent.py` 等诊断脚本，需克隆源码后进容器运行。

### 阶段 G：后续维护

**每日（自动 + 人工 2 分钟）**

- 飞书告警群：关注「授权过期」「环境异常」两类消息；`SEND_CODE=True` 时按消息里的二维码重新扫码。
- 不要求每日人工看 feed——hot-news 的 `fetch_runs` 与健康度已覆盖这一层。

**每周**

- 后台比对两个源的新增条数（E3 的对照表），新源持续为 0 就按 F1/F3 排查。
- 检查 `data/` 磁盘占用：`du -sh /opt/werss/data`。

**每月**

- 重新扫码一次（即使没告警），避免到期当天断更。
- 备份 `data/`：目录含登录态与文章全文，**备份文件必须加密并放私有存储**，不进 git、不上传公开网盘。
- 检查上游 releases：有安全修复时按 G「升级流程」处理。

**升级流程（保留数据）**

```bash
cd /opt/werss
docker compose pull
docker compose up -d
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/   # 期望 200
curl -sS "http://127.0.0.1:8001/feed/<Feed_ID>.xml" | head -c 300  # 确认 feed 仍正常
```

`data/` 是卷挂载，重建容器不会丢库；但**升级后登录态可能失效**，准备重新扫码。

**密钥轮换**

- AK：新建 → 改巡检脚本 → 删除旧 AK（Secret Key 不可恢复）。
- 管理员密码 / `SECRET_KEY`：改 compose 环境变量后 `docker compose up -d`，所有 AK 需重新验证。

---

## 4. 2 周决策门

| 结论 | 触发条件 | 动作 |
|---|---|---|
| **推广到 6~8 个号** | E3 全部通过，且月付费仍 ≥ ¥300 | 逐号按 §D 接入；每加 2 个号观察 3 天；原 `mp_account` 保留 1 个月做保险 |
| **保持混合** | 核心官方号时效敏感（新源延迟 > 2h），但 T2 媒体号达标 | 官方号继续付费，T2 号走自建；对应选型报告方案 2 |
| **回退** | 任一：2 周内扫码 > 3 次 / 出现账号风险提示 / 覆盖率 < 80% / 无法保证固定出口 IP | 停用新 rss 源，回到原 `mp_account`；按 §6 选替代路径；保留 `data/` 备份 30 天备查 |

**回退操作**：后台把新 `mp-rss-*` 源暂停（不要删除，留着失败原因），确认原 `mp_account` 源启用且 `editorial`，观察一份日报周期。

---

## 5. 已知限制与风险

| 限制 / 风险 | 具体表现 | 影响 | 替代处理 |
|---|---|---|---|
| **依赖公众号后台登录态** | 非公开接口，token/cookie 会过期；微信可随时变更接口 | 全站该通道断更 | 保持飞书告警 + 4 周主动重扫；长期方案是回退商业 API 或改用官网 `web_list` |
| **扫码账号风险** | 用真实公众号管理员身份登录第三方工具 | 理论上存在账号被限制的可能 | 只用专用小号；不用于公司主号；不接受则不要实施本方案 |
| **时效退化** | 59 分钟补采 + RSS 缓存，实测延迟通常 1~3 小时 | 快讯类内容落后于商业 API | 核心号保留 `mp_account`；或把 `CONTENT_AUTO_INTERVAL` 降到 30 分钟试运行（注意风控） |
| **历史回补有限** | `MAX_PAGE=5`，只采最近若干页，不能全量存档 | 不适合做档案库 | 历史检索用 `POST /api/ingest/items` 定向补录，或保留商业 API 的历史查询 |
| **无 SLA** | 社区项目，issue 响应不保证 | 故障时只能自研排查 | 固定镜像版本 + 本地备份 + 保留原 `mp_account` 作为热备 |
| **默认值冲突** | README 与 config 样例的 `GATHER.CONTENT` / `GATHER.MODEL` / `CONTENT_AUTO_CHECK` 不一致 | 升级后行为可能悄悄改变 | 所有关键项显式写进 compose；升级后逐条核对 §B2 |
| **安全暴露面** | 管理页有默认口令 `admin@123`；上游历史 issue #485 涉及配置安全 | 未加固的公网实例可能被入侵 | 端口绑 `127.0.0.1`；改口令与 `SECRET_KEY`；不打开自定义 RSS 模板与 Web Git；AK 只读最小权限 |
| **全文合规** | WeRSS 能输出全文 RSS，`RSS_FULL_CONTEXT=True` 是默认 | 容易误开导致合规口径扩大 | 显式 `False`；hot-news 侧 `site_fulltext` / `syndicate_fulltext` 始终关闭 |
| **单点故障** | 一个 token 管所有订阅 | 授权失效 = 8 个号同时断 | 试点期双跑；主号仍走 `mp_account`；不要把全部 75 个信源压到这一条通道 |
| **平台合规边界** | 抓取公众平台后台接口属于非公开用法 | 政策风险 | 若组织合规策略不允许，改用官网 `web_list` / 官方 RSS 或商业 API；不要以「技术上可行」替合规决策 |

---

## 6. 替代处理建议（按触发条件选择）

| 触发条件 | 替代方案 | 具体做法 | 代价 |
|---|---|---|---|
| **没有可扫码的公众号 / 合规不允许** | 官网公开信源 | 为 6 个 T2 媒体号各配 `web_list` 或 `rss` 源；北极星、储能与电力市场、pv magazine China 等已有站点可抓 | 需维护 CSS 选择器；少量独家内容会漏 |
| **授权频繁失效（>2 次/月）** | 换采集模式 | `GATHER.MODEL=weread_mp`，用微信读书 Cookie（`WEREAD_COOKIE`）——**注意该模式每次只返回最新一篇、无法回补历史**（`docs/weread-mp.md`） | 覆盖率下降，只适合做补盲 |
| **必须保留商业 API 的时效** | 混合分层 | 2 个天合富家 `T1_5` 号留 `mp_account`，6 个 T2 号走自建；月付费降到约 ¥100~126 | 两套链路并存，运维成本略高 |
| **号数扩张到 20+** | 级联模式 / 商业 API | WeRSS 的 `cascade` 支持父子节点分发（`CASCADE_ENABLED=True`）；或按选型报告的触发条件回到按次计费 | 部署复杂度显著上升，需重新评估 |
| **只需要单篇补录** | ingest 接口 | `POST /api/ingest/items`，`INGEST_TOKEN`，≤50 条/次；自动建 `external` 源默认 `isolated`，需人工改 `editorial`。**注意接口无正文字段** | 适合补录，不适合做持续采集 |
| **自建整体失败** | 回退并止损 | 暂停 `mp-rss-*` 源；按选型报告 P0 修 6 个 `wxid → ghid`；确认是否本来就有产出 | 回到 ¥436.80/月基线，但至少是确定性的 |

---

## 7. 一页速查

```bash
# 部署位置
/opt/werss/docker-compose.yaml     # 配置
/opt/werss/data/                   # 库 + wx.lic（凭证）+ cache，权限 700，禁止入 git

# 关键地址
http://127.0.0.1:8001/                          # 管理界面（仅内网）
http://127.0.0.1:8001/feed/<Feed_ID>.xml        # 单号 RSS
http://127.0.0.1:8001/rss/<feed_id>/fresh       # 强制刷新某个源（排查用）
Authorization: AK-SK <ak>:<sk>                  # API 鉴权（read 权限即可）

# 必须显式设置
GATHER.MODEL=app  GATHER.CONTENT=True  GATHER.CONTENT_AUTO_CHECK=True
RSS_FULL_CONTEXT=False  RSS_LOCAL=False  RSS_PAGE_SIZE=30
FEISHU_WEBHOOK=<专用机器人>  SEND_CODE=True
ENABLE_CUSTOM_RSS_TEMPLATE=False  ENABLE_WEB_UPDATER=False

# hot-news 信源字段
kind=rss  config.feedUrl=<上面的单号 RSS>
config.publishedAtUtcOffset="+08:00"  config.summaryIsBody=false
interval_minutes=60  site_fulltext=false  试点期 participation_mode=isolated

# 验收红线
覆盖率 ≥95% | 时间偏差 ≤2h | 扫码 ≤1 次/2 周 | 无 24h 断更 | 无环境异常告警
```

---

*本手册基于 2026-11-17 时点的上游仓库与 hot-news 源码。上游为滚动发布，任何升级后请重新核对 §B1 的默认值冲突表与 §B2 的关键配置。*
