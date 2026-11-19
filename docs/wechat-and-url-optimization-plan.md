# FuJiaNews（hot-news）公众号信息与网址优化：系统诊断与可执行方案

> 日期：2026-11-17
> 范围：公众号信源（获取、字段、合规、成本）+ 网址（获取、筛选、清洗、去重、校验、更新）
> 证据标记：【码】代码实证（文件:行号）｜【库】本地运行库只读查询实证｜【官】官方/文档口径｜【判】司法认定｜【推】基于证据的推断｜【假】尚待验证的假设

---

## 〇、执行摘要（先看这页）

### 1. 必须先修正的一个旧结论

前几轮报告判断「6 个 `wxid` 号疑似空转、占 71% 预算（¥310.80/月）」。**本地数据库实测不支持这个因果判断**：

- `trinapower-mp` 用 `wxid: tianheguangfu`，仍成功产出 4 篇文章；
- `mp-zhihuiguangfu` 用 `wxid: PV-perspective`，也在一次运行里产出 3 篇；
- 8 个公众号源的**全部 578 次**采集运行中，404 次报错 `dajiala ... code 20001: 金额不足`，165 次是本地预算熔断 `Budget for dajiala exhausted (minute)`；411 张 dajiala 失败回执里 404 张是「金额不足」。

**修正后的结论**：当前公众号链路的真实根因是**供应商余额耗尽 + 每分钟 5 次的本地预算上限**，不是 `wxid` 格式。因此「改成 ghid 即可止损 ¥310.80/月」不成立；理论月费 ¥436.80 从未发生——近 24 小时实际付费只有 **¥0.89（15 次成功请求）**。`wxid/ghid` 文档与代码不一致仍需修，但它的定位从「P0 止损」降为「P1 配置规范」。

### 2. 五个决定性发现

| # | 发现 | 证据等级 | 含义 |
|---|---|---|---|
| 1 | 8 个 `mp_account` 源健康状态**全部 `failing`**，最后成功运行停在 2026-11-16 10:46 | 【库】 | 公众号链路目前**事实性中断**，不是"效果不佳" |
| 2 | 根因是 code 20001「金额不足」与 per-minute=5 的预算熔断 | 【库】+【码】`providers/receipts.ts` | 补余额前任何采集优化都不会产生数据 |
| 3 | 项目**没有** `original_url / discovery_url / canonical_url / items` 结构；只有一个写入后从不更新的 `articles.url` + 唯一 `identity_key` | 【码】`migrations/0001_core.sql:60-88`、`content/materials.ts:365-373` | 「网址优化」要新增访问层，而不是改判重逻辑 |
| 4 | 882 篇文章中 214 条（24.3%）`body_status=unconfirmed`，其中 `json_list` 63/116（54.3%）；17 条无发布时间 | 【库】 | 内容质量缺口比 URL 形态问题更大 |
| 5 | 38 个 T1 源中 **0 个**配置 `publisherUrlPrefixes` | 【码】`industry/sources.json` | 一手归属靠路径启发式，跨源转载时易误判 |

### 3. 优化目标（本方案的验收锚点）

| 目标 | 现状基线 | 目标值 | 周期 |
|---|---|---|---|
| 公众号源可用率 | 0/8 | ≥6/8（若决定继续用该供应商）；否则 0/8 且明确下线 | 2 周 |
| 付费失败回执 | 411 张（近 24h） | 0 张/周 | 1 周 |
| 正文未确认率 | 24.3%（json_list 54.3%） | ≤15%（json_list ≤30%） | 6 周 |
| 无发布时间的新增条目 | 17 条存量 | 新增 0 条 | 持续 |
| 失效原文链接 | 无检测能力 | 公开条目 100% 进入抽样探活，疑似死链 <2% | 6 周 |
| 每月公众号支出 | 理论 ¥436.80 / 实际 ¥0.89 | 决策后 ≤预算上限且每笔可追责 | 持续 |

### 4. 推荐路径（一句话）

**先做"止损与定性"而非"优化"**：暂停空转的付费采集 → 取得供应商书面授权与余额结论 → 决定继续/替换/下线；同时低成本补 URL 卫生与内容质量，**不要动 `identity_key` 与现有判重语义**。

---

## 一、现状与目标梳理

### 1.1 业务目标（来自项目自身表述）

- 站点是 **FuJiaNews**，数字能源行业热点站："从一批数字能源信源里挑出值得看的动态，把同一件事的多篇报道归到一起，08:00 出一份日报"。【码】`site/site.ts:40`
- 主流程六步：**采集 → 判重 → 预筛 → 独立两次评分 → 中文写作 → 聚簇热度 → 成刊**；提示词与门槛都在 `industry/prompts/` 与 `industry/selection.ts`。【码】`README.md:37-65`
- 六种信源：RSS、网页列表、JSON 接口、X 账号、微信公众号、外部推送。当前 **75 个源**（web_list 46 / json_list 12 / rss 9 / mp_account 8），全部 `editorial`、全部 `site_fulltext=false`。【库】+【码】`industry/sources.json`
- 不可协商的规则（架构文档原文）：一个公开读取层、**花钱的请求有回执**、预算熔断、安全阀、旧文不刷屏、**来源可追溯**、"公众号不会因为技术上抓得到就获得全文展示"。【码】`docs/architecture.md:24-38`、`docs/sources.md:224`

### 1.2 公众号链路现状

- 实现：`mp.ts` 每号按 interval 调 `mpHistory`（¥0.14/次，10 分钟窗口合并去重），再对每篇新文调 `mpArticle`（¥0.03/次，mode 1 轻量正文），带付费回执、预算熔断、游标、重试、健康度。【码】`sources/mp.ts:45-99`、`providers/dajiala.ts:49-105`
- 实测运行态（本地库，只读）：
  - 8 源全部 `health=failing`、`enabled=true`，`fail_count` 49~52；
  - 只有 `mp-trina-huyong`（ghid）与 `trinapower-mp`（wxid）各有 1 次 `status=ok` 的完整运行；
  - 近 24h dajiala 回执 426 张：`received` 15 张（¥0.89）、`failed` 411 张，其中 404 张是金额不足、7 张是「结果未知超 30 分钟自动放行，未核对是否计费」；
  - 11 篇公众号文章 `body_status` 全为 `ok`，说明**正文接口本身可用，断在列表调用**。
- 合规现状：已核实 (2021)浙8601民初309号认定"极致了"原运营方绕开微信限制、用 75 个账号拟人爬取并对外提供，构成不正当竞争；判令停止抓取、删除数据、赔偿 60 万。官网现称"腾讯官方实时数据"但无公开授权证据，运营主体疑似变更。【判】+【官】详见 `docs/dajiala-research-and-plan.md`

### 1.3 网址链路现状（代码实证）

| 环节 | 当前机制 | 证据 |
|---|---|---|
| 字段 | `articles.url`（普通索引）+ `identity_key`（唯一）+ `content_hash`；`article_discoveries` 记录多源入口；`publications.url` 冗余一份 | 【码】`0001_core.sql:60-110,229`、`0030_collection_url_index.sql:4` |
| 获取 | RSS 用 `new URL(href, res.url)` 补绝对；web_list 用 `absolute(href, base)` 且同站 http→https；**json_list 不补绝对**；mp 直接采用 provider 返回的 `p.url` | 【码】`rss.ts:183-190`、`web-list.ts:61-73`、`docs/sources.md:125`、`mp.ts:57-99` |
| 筛选 | `allowUrlPrefixes / denyUrlPrefixes` 是 **http→https 后 startsWith 前缀匹配**，非 host 解析；`itemUrlPrefixRewrite` 字面替换且不记审计 | 【码】`web-list.ts:26-35`、`filters.ts:11-13,29-33` |
| 清洗 | `normalizeUrl()`：去 hash、host 小写去 www、强制 https、去默认端口、去 20 类 tracking 参数、参数排序、去尾斜杠；**只用于 identity，不改写入库 URL** | 【码】`lib/url.ts:5-36`、`ingest/items.ts:52-58` |
| 去重 | `identityKeyForUrl()`：X→`x:<id>`；微信→`wechatPostUrl()` 只留 `__biz/mid/idx`（**丢 sn**）；其余→`url:<规范化 URL>`；`materialIdentityForUrl()` 四路归并；入库 `ON CONFLICT DO NOTHING` | 【码】`lib/url.ts:53-77`、`content/materials.ts:204-227,269-327` |
| 校验 | **无探活、无失效标记、无死链告警**；`itemAvailability()` 只读 `visibility`；404 仅被归为 `refused`；正文失败有 3 次重试与 `unconfirmed` 状态机 | 【码】`publication/availability.ts:8-21`、`collect.ts:242-244`、`jobs/content.ts:21-22` |
| 更新 | **入库后 `articles.url` 永不更新**；`reviseMaterial()` 的 SET 不含 url；后台无 URL 编辑/补链接口 | 【码】`materials.ts:365-373`、`admin/content.ts:288-300` |

### 1.4 实测 URL 形态（882 条）

- 882 条 URL **全部互不相同**，且 882 个 `identity_key` 全部唯一——目前没有重复入库；
- 含 `#` 片段 30 条；`sn=` 11 条、`chksm=` 11 条（均为公众号长链）；
- `www.` 前缀 543 条（61.6%）；`http://` 116 条（13.2%）；`utm_` / `spm` **0 条**（当前尚未触发追踪参数污染）；
- 17 条无 `published_at`。

---

## 二、关键问题与根因

### 2.1 公众号侧

| 问题 | 现象 | 根因（分级） | 与旧结论的关系 |
|---|---|---|---|
| **P0-1 链路事实性中断** | 8/8 `failing`；最后成功 11-16 10:46 | 【库】403~404 次 code 20001「金额不足」+ 165 次本地 per-minute=5 熔断（预算表 `dajiala 5/60/500`）。**根因是余额与节流，不是 ID 格式** | 修正旧的"wxid=空转"推断 |
| **P0-2 合规悬而未决** | 供应商曾因同类服务被生效判决责令停止；现网无公开授权证据 | 【判】【官】授权链条未建立；项目已把"全文展示"关掉，但**采集行为本身**的授权仍未确认 | 与旧结论一致，仍是上线阻塞项 |
| **P1-1 配置规范漂移** | 6 源写 `wxid`，文档要求 `gh_` | 【码】`docs/sources.md:208,213` vs `mp.ts:45` 的 `ghid ?? wxid`；但【库】证明 `wxid` 有时可用，故是**规范与可维护性问题**，不是当前故障原因 | 从 P0 降级 |
| **P1-2 成本不可预测** | 理论 ¥436.80/月，实际 ¥0.89 | 【库】自适应调频最快 15 分钟时理论上界 ¥3,225.60/月；【码】code 101/104 账号失效**仍扣费**；7 张回执"结果未知自动放行，未核对是否计费" | 新增风险点 |
| **P2-1 字段单薄** | 入库只保留 title/url/author/publishedAt/摘要，`raw.dajiala` 才有 sn/original | 【码】`ingest/items.ts:20-26` 无正文字段；`mp.ts:95` 把 sn/original 塞进 raw | 与新方案字段设计直接相关 |

### 2.2 网址侧（按影响排序）

| # | 问题 | 根因 | 影响 |
|---|---|---|---|
| 1 | `normalizeUrl()` 保留 `sn`、`wechatPostUrl()` 丢弃 `sn`，两套规则并存 | 【码】`url.ts:21-28` vs `53-64`，为兼容不同形态逐步叠加 | 需要 3 个表达式索引 + 四路 UNION 查询兜底【码】`0121/0122/0123`、`materials.ts:204-227`；是微信去重复杂度的根源 |
| 2 | `articles.url` 永不更新，无 `access_url` 层 | 【码】`reviseMaterial()` SET 无 url | 临时链换永久链、域名迁移、404 后文章永远指向旧地址 |
| 3 | 无探活、无失效标记、无死链告警 | 【码】`availability.ts:8-21`、`health.ts:70-78` 五类问题无"死链" | 公开页/日报/RSS 长期带失效原文链接；来源可追溯规则名存实亡 |
| 4 | 正文未确认率 24.3%（json_list 54.3%） | 【库】+【码】`rss.ts:127` 正文 <280 字标 pending 后回抓原文；`extract.ts:71-77` 注释记录登录页跳转曾造成 26 次修订 | 内容质量与成本双重损失（回抓触发付费兜底） |
| 5 | json_list 不补绝对 URL | 【码】`docs/sources.md:125`、`json-list.ts:180` | 上游改相对路径即静默丢条目 |
| 6 | 只改 `feedUrl` 不清 RSS validator cursor | 【码】`admin/sources.ts:188-191` 仅 `kindChanged` 时删 `cursor.rss`；`rss.ts:149-165` 的 `responseUrl` 未清 | 换源地址后可能长期 304，停滞更新 |
| 7 | 38 个 T1 源 0 个配置 `publisherUrlPrefixes` | 【码】`industry/sources.json` | 一手归属靠 web_list 路径启发式【码】`content/provenance.ts:24-56`，转载场景易误判 |
| 8 | ingest 无正文字段；external 源只在新建时设 isolated | 【码】`ingest/items.ts:20-39` | 第三方推送全靠回抓；被误改成 editorial 的源不会被纠正 |
| 9 | `TRACKING_PARAMS` 把 `from/source/scene` 一律删除 | 【码】`url.ts:5` | 【推】某些站点这些是内容路由参数，会造成误判为同一篇；当前 882 条未命中，属预防性风险 |
| 10 | `itemUrlPrefixRewrite` 无审计轨迹 | 【码】`filters.ts:29-33` | 改写后无法还原上游原始 URL，排障困难 |
| 11 | 后台无 URL 编辑/补链/失效标记 | 【码】`admin.ts:37-134`、`FieldsSchema` 仅 8 个字段 | 运营遇到错链只能改数据库 |
| 12 | URL 测试只覆盖 SSRF 与身份归一 | 【码】`tests/url*.standalone.test.ts` | 无 amp / 搜狗跳转 / 301 后身份复检 / 中文域名用例 |

### 2.3 根因归纳

1. **把"身份稳定"做成了"URL 不可变"**：项目用唯一 `identity_key` 保证聚合稳定，但缺少与之分离的"可变访问地址"层，所有 URL 更新需求都被压到判重层解决。
2. **健康度只看抓取是否成功，不看链接是否可用**：`fetch_runs` 无 url 列，错误塞在 `detail` 里；死链不会让源变红。
3. **付费链路的运营闭环缺失**：有回执和预算，但**没有余额告警、没有 101/104 无效扣费计数、没有"余额不足自动暂停"**，导致 411 次失败请求持续 22 小时。
4. **配置规范靠文档约束、没有校验**：文档要求 `ghid`，代码接受 `wxid`；38 个 T1 源未填 `publisherUrlPrefixes`。

---

## 三、影响范围与优先级

| 优先级 | 问题 | 影响面 | 可逆性 | 触发条件 |
|---|---|---|---|---|
| **P0** | 余额耗尽导致 8 源全断 | 全部公众号内容、日报中相关条目、付费账号信誉 | 高（暂停/充值即可） | 已发生 |
| **P0** | 授权未确认 | 全站合规、对外公开链路 | 低（需法务决策） | 已存在 |
| **P1** | 正文未确认率 24.3% | 882 条中 214 条质量受损；json_list 尤其严重 | 高 | 已发生 |
| **P1** | 无 URL 探活与访问地址层 | 所有公开条目（长期累积） | 中 | 已存在但缓慢 |
| **P1** | json_list 相对 URL / feedUrl 变更 | 12 个 json_list 源、9 个 rss 源 | 高 | 条件触发 |
| **P2** | T1 归属配置缺失 | 38 个 T1 源的一手判定 | 高 | 跨源转载时 |
| **P2** | ingest 字段与治理 | 所有外部推送源 | 高 | 使用外部推送时 |
| **P3** | 测试与审计缺口 | 回归安全 | 高 | 迭代时 |

---

## 四、公众号信息来源与字段完善方向

### 4.1 来源分层与角色（沿用并修正前几轮结论）

| 来源 | 定位 | 当前状态 | 条件/边界 |
|---|---|---|---|
| 现有 `mp_account`（大甲拉） | 主链路候选 | 【库】8/8 failing，余额耗尽 | 仅在取得书面授权、补足余额、确认合规口径后恢复；否则暂停 |
| 官网 `web_list` / 官方 `rss` | **首选替代** | 67 个免费公开源已在跑 | 优先替换 6 个 T2 行业媒体号；零风控、时间字段更可信 |
| `rachelos/we-mp-rss` 自建 | 限定试点 | 未部署 | 需自有公众号管理员微信扫码；`RSS_FULL_CONTEXT=False`、`RSS_LOCAL=False`；双跑 2 周决策门见 `docs/we-mp-rss-launch.md` |
| TikHub 按次 API | 单点补盲观察 | 未使用 | $0.01/次；只做单号采样比对，不引入其 Skill；链接参数须程序化取 `sn/chksm` |
| Wechat2RSS / WechatSogou / wewe-rss / xiaoyu-gzh-extract / wechat-article-spider | **排除** | 已评估 | 分别因禁止商用分发、停更、归档、个人 Skill 无服务形态、无按号完整收录 |

### 4.2 字段完善方向（最小增量，不破坏判重）

**来源层（sources.config 增补，均为可选）**

| 字段 | 用途 | 默认值 |
|---|---|---|
| `accountId` | 规范账号 ID（优先 `gh_...`，其次 `__biz`） | 无 |
| `wxidAlias` | 保留现有 wxid，便于对照 | 无 |
| `authorizationBasis` | `self_owned` / `published_content_only` / `pending` | `pending` |
| `dataUsePolicy` | `summary_and_link` / `fulltext_allowed` | `summary_and_link` |

**条目层（raw 结构化，避免散落）**

- 在 `raw.provider` 下固定写入：`provider=dajiala`、`receiptId`、`accountId`、`providerUrl`（供应商原始 URL）、`sn`、`original`、`bodySource`（`paid_detail` / `feed` / `page`）、`publishedAtBasis`（`post_time` / `ct` / `feed`）。
- `ingest/items.ts` 的 `ItemIn` 增加**可选** `bodyText` / `bodyHtml` / `bodySource`，带长度上限与 sanitize；不改变"默认不全文展示"。
- 新增 `access_url` / `url_status` / `url_checked_at` / `url_canonical` 四个字段（详见 §5.2），**不改 `identity_key`、不改 `articles.url` 语义**。

**合规字段闸门**

- `authorizationBasis != published_content_only` 时，新源强制 `participation_mode='isolated'`、`site_fulltext=false`、`syndicate_fulltext=false`；改为 `editorial` 必须人工确认并留痕。
- 只允许"发现 + 摘要 + 原文链接"，不做全文检索/排行/镜像——直接回应判决中"实质性替代"的核心指控。

---

## 五、网址六机制：现状 → 目标 → 可执行动作

### 5.1 获取与筛选

| 机制 | 动作 | 证据/理由 | 验收 |
|---|---|---|---|
| 获取 | json_list 增加 `absoluteUrl(rendered, base)`：仅在结果是相对路径时按源站 base 补齐；失败记 warning 不静默跳过 | 【码】`docs/sources.md:125`、`json-list.ts:180` | 构造相对 URL 的 fixture 能入库 |
| 获取 | 对 `mp.weixin.qq.com/s/...` 短链，只在**同一身份归并失败**时才尝试展开；不逐条付费展开 | 【码】`0122` 索引已覆盖 | 无新增付费调用 |
| 筛选 | 前缀匹配升级为"先 host 精确匹配、再 path 前缀"，保留现有配置向后兼容 | 【码】`web-list.ts:26-35` | 现有 46 个 web_list 源零回归 |
| 筛选 | `publisherUrlPrefixes` 补齐：先做 10 个最常被转载的 T1 源，后台可批量编辑 | 【库】0/38 | 抽查 20 条跨源报道归属正确 |
| 筛选 | `itemUrlPrefixRewrite` 记录 `raw._aihot.originalCandidateUrl` | 【码】`filters.ts:29-33` | 改写样例可还原上游 URL |

### 5.2 清洗（关键：区分"身份 URL"与"访问 URL"）

**保留不动**：`identity_key` 的计算逻辑与 0121/0122/0123 索引——现有 882 条数据零重复、归并查询经过测试，改动收益低风险高。

**新增访问层**：

1. 数据库迁移增加 `articles.access_url text`、`articles.url_canonical text`、`articles.url_status text NOT NULL DEFAULT 'unknown'`、`articles.url_checked_at timestamptz`，并建 `url_status` 部分索引；`articles.url` 保持"首次发现时的原始地址"不变。
2. 入库时生成 `url_canonical`：
   - 通用站：去 `utm_* / spm / fbclid / gclid / from / scene / sessionid` 等追踪参数后保存（与 `normalizeUrl` 一致，但保留原 scheme/host 大小写以便展示）；
   - 微信：保留 `__biz / mid / idx / sn`，去掉 `chksm / scene / sessionid / clicktime / enterid / #rd`；【假】需抽样验证去掉 `chksm` 后仍可打开，若打不开则该号保留 `chksm`。
3. `access_url` 初始等于清洗后的 URL；探活或新候选发现更优地址时才更新，并写 `article_discoveries`/审计记录。
4. `TRACKING_PARAMS` 增加**白名单逃生口**：per-source `keepQueryParams: ["from"]`，仅对 json_list/web_list 生效；默认不变。【推】当前数据未触发，属预防性设计。

### 5.3 去重

- 维持四路归并 + `ON CONFLICT DO NOTHING`，**不改成"按 URL 严格判重"**——那会破坏跨形态微信文章聚合。
- 增加两类回归测试（当前只有 SSRF 与身份归一测试）：① 301 到不同 URL 后身份是否仍归并；② `sn` 变化 / `chksm` 变化 / `/s/短链` 三形态同时出现时只产出 1 条。
- 后台"合并"操作已有，补一条约束：合并时保留较早的 `access_url`，除非人工指定。

### 5.4 校验（探活）

- 新增低频 `urlProbe` 任务：每天抽样 ≤50 条公开条目（优先 30 天内新增、且 `url_status='unknown'`），先 HEAD、失败再 GET；遵守 SSRF 现有防护（`lib/url.ts:79-232`），不触碰付费接口。
- 状态机：`unknown → ok`（2xx/可访问）/ `suspect`（429/403/超时）/ `dead`（**连续 2 次** 404/410）；`dead` 仅从公开列表与推送中降权，**不删除文章、不改 identity**，保留追溯。
- 与源健康度解耦：死链不计入 `fetch_runs` 失败；在后台"信源"页新增"链接可用性"一栏。【码】`health.ts:70-78` 现状无该类
- 【假】微信长链的签名可能过期导致 403，但这不代表文章下架；探活遇 `mp.weixin.qq.com` 一律标记 `suspect`、不自动判 `dead`。

### 5.5 更新

- 新增"同源同身份、不同 URL"的候选处理：若新 URL 与已有 `identity_key` 相同且探活为 `ok`，更新 `access_url` 与 `url_checked_at`，**不动 `articles.url`**；记录一次 revision 原因 `url_refresh`。
- `admin/sources.ts`：当 `feedUrl` / `listUrl` 等地址字段变化时，除重复源检查外，同步清理 `cursor.rss.responseUrl` 与 validator，避免 304 停滞。【码】`admin/sources.ts:188-191`、`rss.ts:149-165`
- 后台新增两个只读/受控操作：① URL 诊断（展示原始 URL、规范化 URL、access_url、探活历史、关联回执）；② 人工覆盖 `access_url`（写入审计，`identity_key` 不可编辑）。

### 5.6 内容质量联动（网址优化的真正收益点）

- `rss.ts:127` 的 280 字阈值与回抓原文是 `unconfirmed` 的主要来源之一；建议对**明确为摘要型**的源改走 `summaryIsBody=true`（`trinapower-news` 已这么做），而不是缩短阈值。
- 登录页跳转检测（`extract.ts:56-86`）已存在但只在失败后记录；建议在列表阶段就过滤 `#/login`、`/auth/` 等路径，避免 26 次修订那类事故重演。
- 正文抓取失败 3 次后标 `unconfirmed` 的现状保留；增加按源的 `unconfirmed` 率看板，>40% 的源进入周报。

---

## 六、质量与合规风险

| 风险 | 等级 | 现状证据 | 控制措施 |
|---|---|---|---|
| 供应商数据采集合法性 | **高** | 【判】同类服务被判不正当竞争；【官】官网"腾讯官方实时数据"无授权证据 | 书面授权未到前 `mp.data.useEnabled=false` 或源 `enabled=false`；只保留摘要+链接；不全文/不镜像/不排行 |
| 付费请求无效仍计费 | 高 | 【官】code 101/104 账号失效仍扣费；【库】7 张"结果未知自动放行，未核对是否计费" | 回执增加 `invalidAccountCount` 告警；日累计上限；未知回执人工核对后才放行 |
| 余额耗尽持续空转 | 高 | 【库】404 次 20001、165 次预算阻断 | 余额 <¥20 告警并自动暂停 mp 源；恢复需人工确认 |
| 探活引发对方封禁 | 中 | 【假】高频 HEAD/GET 可能被视为爬取 | 每天 ≤50 条、随机分散、遵守 robots、命中 429 立即退避、不探 mp 长链 |
| URL 清洗误判 | 中 | 【推】`from/source/scene` 可能是路由参数 | 白名单逃生口；先在不入库的 shadow 模式跑 1 周对比 |
| 人工覆盖 URL 被滥用 | 中 | 新增能力本身的风险 | 仅管理员、必填原因、审计留痕、可回滚 |
| 死链降权影响历史归档 | 低 | 公开层规则要求来源可追溯 | 只降权不删除；日报中已出刊内容保持当期写作 |

---

## 七、性能与维护成本

- **采集性能**：当前公众号 165 次运行被 per-minute=5 的预算熔断，属于无效调度占用。暂停后 worker 每轮少 8 个失败任务；恢复时建议把 8 源按 interval 错峰，避免同分钟争抢 5 次配额。
- **探活成本**：每天 50 次 HEAD/GET，按现有 `guardedFetch` 超时 30s 上限，最坏 25 分钟串行；建议并发 4、超时 8s，实际约 2 分钟内完成，不占模型与付费额度。
- **存储成本**：4 个新字段 × 882 条（以及后续增量）可忽略；`url_status` 部分索引很小。
- **维护成本**：
  - 最低：补余额/暂停、配置规范、来源替换（0 开发量）；
  - 中：URL 清洗与探活任务、后台诊断页（约 1~2 人周，按现有模块边界实现）；
  - 高：自建 WeRSS（扫码凭据维护、IP 固定、升级），仅在 ≥20 号 / 月付 >¥1,000 / 可用性 <99% 时启动。
- **不要做的事**：为"网址优化"重写判重、改 `identity_key` 语义、或引入新的采集应用——收益远低于回归风险。

---

## 八、阶段性实施计划

### 阶段 0：止损与定性（0~3 天，零开发）

1. 后台暂停 8 个 `mp_account` 源（或把 `COLLECT_ENABLED` 保持开启、仅停 mp 源），停止 404 次/日的无效失败运行。
2. 向供应商索取三项材料：书面授权说明、现运营主体与判决被告关系、用户协议是否允许对外公开站点使用。
3. 决策分支：
   - **授权明确 + 决定继续** → 充值、把 6 个 `wxid` 换成 `gh_`、错峰间隔、恢复 2 号试点；
   - **授权不明** → 保持全停，用官网 `web_list/rss` 替换 6 个行业媒体号；
   - **如需补盲** → 启动 WeRSS 双跑 2 号 2 周（前置：自有公众号管理员微信）。
4. 在 `docs/` 留一页决策记录，写明依据与复核日期。

**出口条件**：连续 24h 公众号相关失败回执 = 0；授权结论有书面记录。

### 阶段 1：URL 卫生与内容质量快修（第 1~2 周）

1. json_list 相对 URL 补齐 + 跳过时写 warning。
2. 入库 URL 去除追踪参数但对 `identity_key` 无影响（shadow 对比 1 周后启用）；加 `keepQueryParams` 逃生口。
3. `feedUrl` 变更时清 RSS validator cursor。
4. `itemUrlPrefixRewrite` 保存原始候选 URL。
5. 为 10 个高频被转载的 T1 源补 `publisherUrlPrefixes`。
6. ingest：新增可选正文字段与 `bodySource`；external 源每次推送都强制 `isolated` 校验。
7. 对 `unconfirmed` 率 >40% 的源逐个判断是否改 `summaryIsBody=true`。

**出口条件**：新增条目追踪参数 0；相对 URL 跳过 0；`unconfirmed` 率从 24.3% 降到 ≤20%。

### 阶段 2：访问地址层与探活（第 3~6 周）

1. 迁移加 4 字段 + 部分索引；回填 `url_canonical = 现有 url 清洗结果`、`access_url = url`（回填可分批，不锁表）。
2. 实现 `urlProbe` 任务与三态状态机；后台"信源"页加链接可用性；内容页加 URL 诊断入口。
3. 实现同源同身份的 `access_url` 更新与审计。
4. 补 4 类 URL 回归测试。

**出口条件**：公开条目探活覆盖率 100%（30 天滚动）；`dead` 率 <2%；零次误改 `identity_key`。

### 阶段 3：来源替换/自建（条件触发）

- 触发 A：6 个行业媒体号用官网源替换成功 → 关闭对应 mp 源，年省理论 ¥3,781.40（实际支出本就为 0，收益是"恢复能力且零风控"）。
- 触发 B：WeRSS 双跑 2 周满足覆盖率 ≥95%、时间偏差 ≤2h、扫码 ≤1 次、无 24h 断更 → 提交是否扩量的决策。
- 触发 C：号数 ≥20 / 月付 >¥1,000 / 可用性 <99% → 才评估全量自建。

---

## 九、验收指标（含当前基线）

| 指标 | 基线（2026-11-17 实测） | 目标 | 检查方式 |
|---|---|---|---|
| mp 源 `health=ok` 数量 | 0/8 | ≥6/8 或明确全停 | `SELECT id,health FROM sources WHERE kind='mp_account'` |
| 24h 内 dajiala 失败回执 | 411 | 0 | `receipts WHERE service='dajiala' AND status='failed'` |
| 余额不足报错次数 | 404（fetch_runs） | 0 | `fetch_runs.error LIKE '%20001%'` |
| 预算熔断次数 | 165 | 0（错峰后） | `fetch_runs.error LIKE '%Budget for dajiala exhausted%'` |
| 实际月支出 | ¥0.89/24h（¥0.56 history + ¥0.33 article） | ≤预算上限，单笔可追责 | `sum(cost) FROM receipts WHERE service='dajiala'` |
| 正文未确认率 | 214/882 = 24.3%；json_list 63/116 = 54.3% | ≤15% / ≤30% | `articles.body_status` 分组 |
| 无发布时间条目 | 17 | 新增 0 | `published_at IS NULL` |
| 追踪参数 URL | 0 | 保持 0 | `url LIKE '%utm_%' OR url LIKE '%spm=%'` |
| 同一身份多 URL | 0 冲突 | 保持 0 | identity_key 唯一约束 + 四路归并测试 |
| 公开链接死链率 | 未检测 | <2% | `url_status='dead'` / 已探活数 |
| T1 `publisherUrlPrefixes` 覆盖 | 0/38 | ≥10/38（优先站点） | `industry/sources.json` |
| URL 相关回归测试 | 仅 SSRF + 身份 | 增加 4 类 | `tests/` |

---

## 十、待确认事项（需你或法务拍板）

1. **授权**：能否拿到供应商书面授权/数据来源说明？是否确认"公开站点使用"被允许？（阻塞阶段 0 的恢复分支）
2. **余额**：是否充值、充值额度、谁负责监控余额？（决定 8 源是恢复还是永久下线）
3. **合规口径**：是否接受"只做摘要 + 原文链接、不做全文/检索/排行"作为公众号内容的永久边界？
4. **扫码资源**：是否有自有的微信公众平台管理员微信，可做 WeRSS 试点？（没有则该方案不可行）
5. **URL 访问层**：是否接受"新增 `access_url` 而不改 `articles.url`"的折中？若要求对外链接始终最新，需要额外做全量迁移。
6. **探活边界**：是否允许对自有站点与第三方站点做每日 50 次 HEAD/GET？（涉及对方 robots 与商务关系）
7. **字段口径**：`from/source/scene` 是否需要在特定源保留为路由参数？（影响误判防范）
8. **验收人**：谁在 2 周后判定 WeRSS 是否推广、以及 T1 归属是否修正？

---

## 附录 A：证据清单（可复核）

| 结论 | 复核方式 |
|---|---|
| 8 源全 failing / 余额不足 / 预算熔断 | 本地库只读查询 `sources`、`fetch_runs`；`receipts` |
| 实际付费 ¥0.89 | `SELECT status,count(*),sum(cost) FROM receipts WHERE service='dajiala' GROUP BY status` |
| 882 条 / 214 unconfirmed / 17 无日期 / 543 www / 116 http | `SELECT ... FROM articles` 分组统计 |
| 38 个 T1 无 publisherUrlPrefixes | 解析 `industry/sources.json` |
| URL 永不更新 | `content/materials.ts:365-373` 的 revise SET 清单；全仓无 `UPDATE articles SET url` |
| 四路归并 | `content/materials.ts:204-227`；索引 `0121/0122/0123` |
| 合规判决 | `docs/dajiala-research-and-plan.md`（含案号、来源链接） |

## 附录 B：与前几轮报告的关系

- `docs/wechat-source-options.md` 的候选筛选、六维对比、混合路径结论仍成立；其中"6 个 wxid 空转 ¥310.80/月"被本报告的实测数据**修正为推断失败**。
- `docs/we-mp-rss-launch.md` 的前置条件、配置项与 2 周决策门保持不变，仅在阶段 3 条件触发时启用。
- `docs/xiaoyu-gzh-extract-assessment.md` 的排除结论不变。
- `docs/dajiala-research-and-plan.md` 的合规闸门与"技术保持、合规先决"结论不变；本方案补充了运行态证据。
