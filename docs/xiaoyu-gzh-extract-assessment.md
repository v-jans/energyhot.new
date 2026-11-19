# xiaoyu-gzh-extract 适配性评估（hot-news 公众号信源）

> 评估对象：[yuyuyu10021/xiaoyu-gzh-extract](https://github.com/yuyuyu10021/xiaoyu-gzh-extract) v1.1
> 评估日期：2026-11-17
> 结论：**不适合作为 hot-news 的生产信源后端**。它是一个面向个人知识管理的 Agent Skill，采集完全依赖第三方付费 API；项目本身无服务形态、无调度、无合规授权。唯一有参考价值的是它验证的 TikHub 数据源——但那是「供应商」层面的事，与是否采用本项目无关。

---

## 一、项目解剖（事实核实）

| 项 | 实际情况 |
|---|---|
| 定位 | 「采集 → 五段式精析 → 离线 HTML 情报工作台」的 **Claude Agent Skill**（`SKILL.md` 驱动），面向个人知识库，不是服务/应用 |
| 血缘 | fork 自 [Jackychen-12/wechat-digest-skill](https://github.com/Jackychen-12/wechat-digest-skill)（★82、MIT、最后提交 2026-08-04），本件只改了 sha256 散列、tempfile 原子写、品牌皮肤三处 |
| 仓库状态 | 2026-11-09 建库，**★0 / fork 0 / issue 0，仅 1 个首发 commit**，无社区验证；语言标注 HTML，实际是 10 个文件的 Python 脚本包（308 KB） |
| 采集方式 | `wechat_collect_client.py` 六个子命令，全部打第三方付费 API：`search`（微信搜一搜）、`articles`（同号列表，需 `gh_`）、`detail`（单篇全文，需 `sn`）、`stats`（互动，需 `chksm`，仅评论数可用）、`redfox-list`/`redfox-detail`（需 ¥100 单独开通，作者未充） |
| 数据依赖 | TikHub `api.tikhub.io`（主力）+ RedFox `redfox.hk`（预接未开通）。**原版 Cookie+Token 后台采集路径未并入**——作者明确因「200013 绑账号封禁风险」放弃 |
| 输出 | stdout JSON，调用方自行落盘；`kb.py`（752 行）做知识库去重合并/五段式写回，`render_html.py`（104 行）出单文件 HTML 工作台，`kb.py serve` 起本机 127.0.0.1:8765 静态服务（只为收藏夹存盘） |
| 服务形态 | **无 daemon、无 HTTP API、无调度器、无数据库、无幂等/游标/重试/可观测/回执/预算熔断** |
| License | MIT（LICENSE 文件为双版权声明，商用授权无问题） |
| 安全 | key 只从环境变量或 `credentials.json` 读、源码零密钥；文章 URL 白名单仅 `mp.weixin.qq.com` + 拒绝内网地址（SSRF 防护到位）——这是本项目做得好的一点 |

---

## 二、为什么不适合：逐项对照

| 维度 | hot-news 硬要求 | xiaoyu-gzh-extract | 判定 |
|---|---|---|---|
| 服务形态 | worker 内定时、可观测、可重试 | 本地 CLI，靠 Agent/人肉触发，无调度 | ✗ |
| 按号持续收录 | 每号按 interval 查新、cursor 增量 | 有 `articles gh_xxx` 能列同号，但要人肉翻页；无增量、无去重持久化 | ✗ 核心缺口 |
| 数据入库 | 走判重/精选/归组/回执/预算熔断 | 出 stdout JSON 后自己接；网关规则全无 | ✗ |
| 正文 | bodyHtml/bodyText + sanitize | `detail` 能拿全文，但 hot-news 合规不允许公众号全文展示 | △ 价值被抵消 |
| 发布时间 | 可信带时区的 `publishedAt` | 接口返回，但可靠性未验证；列表用的是 `create_time/update_time` | △ |
| 成本 | 可控、可预期 | TikHub **$0.01/次按次付费**，且 detail/stats 传错链接「无效仍计费」 | ✗ 只是换供应商 |
| 稳定性 | 按号稳定、可追责 | 上游抖动时 search 偶发 400；RedFox 未开通；依赖单一第三方 | △ |
| 合规 | 公开站点、默认只摘要+原文链接 | **免责声明原文：「采集内容仅限个人学习与研究，不得用于商业转载或对外公开传播他人内容」** | ✗ **硬阻断** |
| 维护 | 长期可维护 | 0 star 单 commit 个人项目；作者自承「引擎升级不再自动继承，需手动 diff 重放」 | ✗ |
| License | 无传染 | MIT | ✓ |

---

## 三、成本账：便宜一半，但仍是按次付费

TikHub 公众号接口经官方 Apifox 与第三方定价分析双向核实：**`fetch_account_articles` / `fetch_article_detail_h5` 均 $0.01/次（≈¥0.072）**；公众号系接口全部 $0.01，且**不参加阶梯折扣、无免费额度**。

按 hot-news 现有 8 个号（104 次/天列表调用）测算：

| 方案 | 列表调用 | 月成本 |
|---|---|---|
| 现状 Dajiala（¥0.14/次） | 104 次/天 | ¥436.80/月 |
| 换 TikHub 纯列表 | 104 次/天 | ¥224.64/月（省 ¥212.16） |
| TikHub 列表 + 每号每天 2 篇详情 | 120 次/天 | ¥259.20/月 |
| TikHub 列表 + 每号每天 4 篇详情 | 136 次/天 | ¥293.76/月 |

**判断**：TikHub 确实比 Dajiala 便宜约一半，但要拿到正文必须 `list + detail` 两段式（Dajiala 的 ¥0.14 已含列表+轻量正文），实际节省会缩水。更重要的是——**这是「换一个按次付费供应商」，不是「降本增效的架构改变」**，且要自己补调度、幂等、入库、合规全套工程，维护成本远高于省下的两百块。

⚠️ 注意：8 个号里有 6 个是 `wxid`（疑似无效 ID），若属实则 71% 的调用是空转（见 `docs/wechat-source-options.md`）。**在修这个配置问题之前，换任何供应商都无法真正降本。**

---

## 四、合规红线（最关键的否决项）

项目免责声明第 4 条原文：

> 请遵守目标平台的服务条款与 robots 协议；采集内容**仅限个人学习与研究，不得用于商业转载或对外公开传播他人内容**——文章版权归各公众号作者所有。

hot-news 是对外公开的行业站点。即使代码 MIT 允许商用，**数据使用条款把公开站点排除在外**。这与 `docs/sources.md:224`「公众号不会因为技术上抓得到就获得全文展示」的既定口径一致——本项目最有价值的「全文 + 五段精析 + 离线工作台」能力，在 hot-news 里恰好是不能用、也不该用的部分。

---

## 五、可借鉴的点（不采用项目，但可吸收思路）

1. **TikHub 作为备选供应商纳入观察名单**：单价确实低，若未来某号 Dajiala 覆盖不佳，可作为单点补盲，但须先解决合规授权口径。
2. **链接完整性的工程纪律**：`detail/stats` 必须从 `search/articles` 返回值程序化取 `sn`/`chksm`，禁止拼接——这个「避免无效计费」的踩坑记录对任何按次 API 都适用。
3. **SSRF 防护写法**：URL 白名单 host + 拒绝内网/环回，值得在自建采集器里复用。
4. **凭证零入码**：key 只走环境变量/本地文件、仓库只留 example——与 hot-news 不提交 `.env` 的规矩一致。

---

## 六、最终建议

| 场景 | 是否采用 |
|---|---|
| hot-news 生产信源（按号持续收录） | **否** |
| 降本替代 Dajiala | **否**（换供应商不解决空转配置问题，且合规不许公开） |
| 个人研究 / 离线情报库 / Agent 归档 | 可以，这正是它的设计目标 |

**保持上一轮选型结论不变**：`docs/wechat-source-options.md` 的推荐路径（P0 修 `wxid→ghid`、P1 官网免费源替换 T2、P1 WeRSS 双跑试点、P2 条件性全量自建）不受本项目影响。本项目不进入 hot-news 技术栈。

若确需验证 TikHub 数据质量，正确做法是：单独注册 TikHub 账号，用 `articles gh_xxx` 对 1~2 个目标号做一次 sampling，比对 `publishedAt` 与正文完整度——**不要引入这个 Skill 仓库**，它的知识库与渲染部分对 hot-news 完全无用。

---

## 事实来源

- 本地克隆：`/tmp/xgz`（10 个文件，逐文件通读：`wechat_collect_client.py` / `SKILL.md` / `kb.py` / `render_html.py` / `README.md` / `LICENSE` / 免责声明 / `credentials.example.json`）
- GitHub API：`repos/yuyuyu10021/xiaoyu-gzh-extract`（元数据、提交）、`repos/Jackychen-12/wechat-digest-skill`（上游原版）
- 定价：TikHub 官方 Apifox 接口文档（`fetch_account_articles` $0.01/次、`fetch_article_detail_h5` $0.01/次、`fetch_article_comments` $0.01/次）；everyinfra《TikHub pricing 详解》（公众号系接口均 $0.01，无折扣无免费额度）
