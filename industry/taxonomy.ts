// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * tagColor 是飞书推送卡片里跟在标题后面的这一类小标签的颜色（飞书 text_tag 的颜色名）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "policy", tagColor: "orange", label: "政策", feedLabel: "政策与标准", section: "政策与标准", guide: "国家部委和地方政府的政策原文、征求意见稿、标准立项与发布、电价与电力市场规则、备案与补贴安排。行业倡议、会议讲话和没有文件落地的表态不算政策。" },
  { key: "project", tagColor: "turquoise", label: "项目", feedLabel: "项目与交易", section: "项目与交易", guide: "具体项目的招标、中标、并网、投运、EPC 价格、装机与设备订单，以及绿电、绿证和碳市场的具体成交。公司层面的合作协议没有具体项目时归行业，产品交付案例归产品。" },
  { key: "product", tagColor: "violet", label: "产品", feedLabel: "产品与方案", section: "产品与方案", guide: "组件、逆变器、储能系统、充电桩、EMS 与能源管理平台、BIPV、智能设计与仿真工具等新产品、新版本、新方案和认证发布。单一项目的交付案例归项目，除非它给出了可复用的产品能力。" },
  { key: "market", tagColor: "green", label: "市场", feedLabel: "市场与数据", section: "市场与数据", guide: "价格、装机、出货量、利用率、碳价、绿证价格等统计与行情数据，以及年度报告里的关键数字。单个项目的报价归项目，公司自己的经营数字归行业。" },
  { key: "industry", tagColor: "indigo", label: "行业", feedLabel: "公司与行业", section: "公司与行业", guide: "已发生的公司经营、财报、融资并购、人事、合作、诉讼、产能与战略调整，以及行业层面的竞争格局变化。由当事人发帖、带有态度，也不因此变成观点。" },
  { key: "research", tagColor: "purple", label: "研究", feedLabel: "研究与报告", section: "研究与报告", guide: "研究机构、协会、智库和咨询公司发布的研究报告、白皮书、方法论与标准研究。只发布一组行情数据归市场；公司新品的技术白皮书归产品。" },
  { key: "practice", tagColor: "yellow", label: "实践", section: "设计与实践", guide: "系统设计、选型、测算、仿真、施工运维、渠道与代理商做法、商业模式复盘等可复用的方法。只介绍自家产品归产品，只有判断没有做法归观点。" },
  { key: "opinion", tagColor: "carmine", label: "观点", section: "设计与实践", guide: "重点是作者的解释、判断、主张、预测、评论或访谈观点。讨论市场不自动归行业，作者是名人不自动归观点。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（数字能源行业是新产品与方案）：日报报头的“N 个新产品”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "product", tag: "产品/方案", unit: "个新产品" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["vpp", "ems", "bipv", "epc", "ccer", "pv", "lcoe", "irr", "kw", "kwh", "mw", "mwh", "gw", "gwh", "pcs", "soc"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["policy_release", "project_deal", "company_event", "product_launch", "market_data", "research_report", "practice_guide", "opinion_analysis"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "政策/标准", "项目/交易", "公司/资本", "产品/方案", "市场/数据", "研究/报告", "设计/实践", "观点/判断", "安全/事故", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "分布式光伏", "户用光伏", "工商业光伏", "储能", "充电", "车网互动", "虚拟电厂", "微电网", "源网荷储", "能源管理",
  "综合能源服务", "碳资产", "绿证/绿电", "零碳园区", "电力市场", "智能设计", "系统仿真", "地方能源平台", "国际",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = [
  "天合富家", "天合光能", "华为数字能源", "阳光电源", "宁德时代", "特来电", "远景", "正泰安能",
  "国家电网", "南方电网", "中国能建", "中国电建", "隆基", "晶科", "晶澳", "固德威",
] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  政策: "政策/标准", 监管: "政策/标准", 法规: "政策/标准", 标准: "政策/标准", 电价政策: "政策/标准",
  中标: "项目/交易", 招标: "项目/交易", 并网: "项目/交易", 投运: "项目/交易", 订单: "项目/交易", 采购: "项目/交易",
  融资: "公司/资本", 收购: "公司/资本", 并购: "公司/资本", 财报: "公司/资本", 人事: "公司/资本", 合作: "公司/资本",
  新品: "产品/方案", 产品发布: "产品/方案", 新版本: "产品/方案", 解决方案: "产品/方案", 认证: "产品/方案",
  数据: "市场/数据", 价格: "市场/数据", 行情: "市场/数据", 出货量: "市场/数据", 碳价: "市场/数据",
  白皮书: "研究/报告", 报告: "研究/报告", 研究: "研究/报告", 智库: "研究/报告",
  教程: "设计/实践", 设计: "设计/实践", 选型: "设计/实践", 运维: "设计/实践", 测算: "设计/实践",
  观点: "观点/判断", 评论: "观点/判断", 访谈: "观点/判断", 预测: "观点/判断", 趋势: "观点/判断",
  事故: "安全/事故", 火灾: "安全/事故", 召回: "安全/事故",
  VPP: "虚拟电厂", "虚拟电厂VPP": "虚拟电厂", "虚拟电厂（VPP）": "虚拟电厂",
  新型储能: "储能", 电化学储能: "储能", 储能系统: "储能", 工商业储能: "储能",
  充电桩: "充电", 充电站: "充电", "V2G": "车网互动", 车网互动V2G: "车网互动",
  微电网: "微电网", 智能微电网: "微电网", 源网荷储一体化: "源网荷储", 源网荷储项目: "源网荷储",
  绿电: "绿证/绿电", 绿证: "绿证/绿电", 绿电交易: "绿证/绿电", 绿证交易: "绿证/绿电",
  CCER: "碳资产", 碳交易: "碳资产", 碳市场: "碳资产", 碳管理: "碳资产",
  零碳产业园: "零碳园区", 零碳工厂: "零碳园区", 零碳园区试点: "零碳园区",
  现货市场: "电力市场", 辅助服务: "电力市场", 售电: "电力市场", 电力交易: "电力市场",
  EMS: "能源管理", 能源管理系统: "能源管理", 综合能源: "综合能源服务",
  地方平台: "地方能源平台", 地方能源集团: "地方能源平台", 城投能源: "地方能源平台",
  分布式光伏发电: "分布式光伏", 工商业分布式: "工商业光伏", 户用光伏系统: "户用光伏",
  PVsyst: "系统仿真", 仿真软件: "系统仿真",
  海外市场: "国际", 出海: "国际", 国际市场: "国际",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；orgNames 是这家公司发消息时开头用的组织名（公司、实验室、团队），
 * 在它自己的主题页上读者知道说的是谁，可以省去；otherNames 是公司的其他称呼（官方账号名、子品牌）。
 * 所有这些名字都用来认出说的是哪家公司，比如把事实的主体对到发布方。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  "tianhe-fujia": {
    name: "天合富家",
    displayTag: "天合富家",
    aliases: ["天合富家", "天合富家能源", "天合智慧分布式", "天合蓝天", "富家瓦", "天能瓦", "天工智云", "天盈"],
    orgNames: ["天合富家", "天合富家能源股份有限公司", "天合智慧分布式能源"],
    otherNames: ["天合富家原装家用光伏", "天合蓝天", "富家"],
  },
  "trina-solar": { name: "天合光能", displayTag: "天合光能", aliases: ["天合光能", "Trina Solar", "天合跟踪", "天合储能", "至尊组件"], orgNames: ["天合光能", "Trina Solar"], otherNames: ["天合光能股份有限公司"] },
  "huawei-digital-power": { name: "华为数字能源", displayTag: "华为数字能源", aliases: ["华为数字能源", "Huawei Digital Power", "华为智能光伏", "华为智能充电网络"], orgNames: ["华为数字能源", "华为数字能源技术有限公司"], otherNames: ["华为智能光伏", "华为智能充电网络"] },
  sungrow: { name: "阳光电源", displayTag: "阳光电源", aliases: ["阳光电源", "Sungrow", "阳光储能", "阳光家庭光伏"], orgNames: ["阳光电源", "阳光电源股份有限公司"] },
  catl: { name: "宁德时代", displayTag: "宁德时代", aliases: ["宁德时代", "CATL", "骐骥换电", "时代电服"], orgNames: ["宁德时代", "宁德时代新能源科技股份有限公司"] },
  teld: { name: "特来电", displayTag: "特来电", aliases: ["特来电", "TELD", "特来电新能源"], orgNames: ["特来电", "特来电新能源股份有限公司"] },
  envision: { name: "远景", displayTag: "远景", aliases: ["远景科技集团", "远景能源", "远景智能", "Envision", "鄂尔多斯零碳产业园"], orgNames: ["远景科技集团", "远景能源", "远景智能"] },
  "chint-anneng": { name: "正泰安能", displayTag: "正泰安能", aliases: ["正泰安能", "正泰新能源", "Chint Anneng"], orgNames: ["正泰安能", "正泰安能数字能源（浙江）股份有限公司"] },
  "state-grid": { name: "国家电网", displayTag: "国家电网", aliases: ["国家电网", "国网", "State Grid", "国网综合能源"], orgNames: ["国家电网", "国家电网有限公司", "国网综合能源服务集团"] },
  csg: { name: "南方电网", displayTag: "南方电网", aliases: ["南方电网", "南网", "China Southern Power Grid"], orgNames: ["南方电网", "中国南方电网有限责任公司"] },
  "energy-china": { name: "中国能建", displayTag: "中国能建", aliases: ["中国能建", "中国能源建设", "Energy China"], orgNames: ["中国能建", "中国能源建设股份有限公司"] },
  powerchina: { name: "中国电建", displayTag: "中国电建", aliases: ["中国电建", "中国电力建设", "PowerChina"], orgNames: ["中国电建", "中国电力建设股份有限公司"] },
  longi: { name: "隆基", displayTag: "隆基", aliases: ["隆基绿能", "隆基", "LONGi"], orgNames: ["隆基绿能", "隆基"] },
  jinko: { name: "晶科", displayTag: "晶科", aliases: ["晶科能源", "晶科", "JinkoSolar"], orgNames: ["晶科能源", "晶科"] },
  "ja-solar": { name: "晶澳", displayTag: "晶澳", aliases: ["晶澳科技", "晶澳", "JA Solar"], orgNames: ["晶澳科技", "晶澳"] },
  goodwe: { name: "固德威", displayTag: "固德威", aliases: ["固德威", "GoodWe"], orgNames: ["固德威", "固德威技术股份有限公司"] },
  ginlong: { name: "锦浪", displayTag: null, aliases: ["锦浪科技", "锦浪", "Ginlong", "Solis"], orgNames: ["锦浪科技", "锦浪"] },
  gcl: { name: "协鑫", displayTag: null, aliases: ["协鑫", "协鑫能科", "协鑫集成", "GCL"], orgNames: ["协鑫集团", "协鑫能科", "协鑫集成"] },
  spic: { name: "国家电投", displayTag: null, aliases: ["国家电投", "国家电力投资集团", "SPIC"], orgNames: ["国家电投", "国家电力投资集团有限公司"] },
  huaneng: { name: "华能", displayTag: null, aliases: ["中国华能", "华能集团", "Huaneng"], orgNames: ["中国华能", "华能集团"] },
  datang: { name: "大唐", displayTag: null, aliases: ["中国大唐", "大唐集团", "China Datang"], orgNames: ["中国大唐", "大唐集团"] },
  huadian: { name: "华电", displayTag: null, aliases: ["中国华电", "华电集团", "Huadian"], orgNames: ["中国华电", "华电集团"] },
  "china-energy": { name: "国家能源集团", displayTag: null, aliases: ["国家能源集团", "国家能源投资集团", "China Energy"], orgNames: ["国家能源集团", "国家能源投资集团"] },
  cnesa: { name: "中关村储能产业技术联盟", displayTag: null, aliases: ["CNESA", "中关村储能产业技术联盟", "储能联盟"], orgNames: ["中关村储能产业技术联盟"] },
  cpia: { name: "中国光伏行业协会", displayTag: null, aliases: ["CPIA", "中国光伏行业协会"], orgNames: ["中国光伏行业协会"] },
  evcipa: { name: "中国充电联盟", displayTag: null, aliases: ["EVCIPA", "中国电动汽车充电基础设施促进联盟", "中国充电联盟"], orgNames: ["中国电动汽车充电基础设施促进联盟", "中国充电联盟"] },
  infolink: { name: "InfoLink Consulting", displayTag: null, aliases: ["InfoLink", "InfoLink Consulting", "集邦咨询"], orgNames: ["InfoLink Consulting"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "tianhe-fujia", name: "天合富家", patterns: [/天合富家|天合智慧分布式|富家瓦|天能瓦|天工智云/i] },
  { id: "trina-solar", name: "天合光能", patterns: [/天合光能|trina\s?solar|天合跟踪|至尊组件/i] },
  { id: "huawei-digital-power", name: "华为数字能源", patterns: [/华为数字能源|huawei\s?digital\s?power|华为智能光伏|华为智能充电/i] },
  { id: "sungrow", name: "阳光电源", patterns: [/阳光电源|sungrow/i] },
  { id: "catl", name: "宁德时代", patterns: [/宁德时代|\bcatl\b|骐骥换电/i] },
  { id: "teld", name: "特来电", patterns: [/特来电|\bteld\b/i] },
  { id: "envision", name: "远景", patterns: [/远景(?:科技|能源|智能|零碳)|envision/i] },
  { id: "chint-anneng", name: "正泰安能", patterns: [/正泰安能|正泰新能源|\bchint\s?anneng\b/i] },
  { id: "state-grid", name: "国家电网", patterns: [/国家电网|国网|\bstate\s?grid\b/i] },
  { id: "csg", name: "南方电网", patterns: [/南方电网|南网|\bcsg\b/i] },
  { id: "energy-china", name: "中国能建", patterns: [/中国能建|中国能源建设|energy\s?china/i] },
  { id: "powerchina", name: "中国电建", patterns: [/中国电建|中国电力建设|powerchina/i] },
  { id: "longi", name: "隆基", patterns: [/隆基|\blongi\b/i] },
  { id: "jinko", name: "晶科", patterns: [/晶科|\bjinko/i] },
  { id: "ja-solar", name: "晶澳", patterns: [/晶澳|\bja\s?solar/i] },
  { id: "goodwe", name: "固德威", patterns: [/固德威|\bgoodwe\b/i] },
  { id: "ginlong", name: "锦浪", patterns: [/锦浪|\bginlong\b|\bsolis\b/i] },
  { id: "gcl", name: "协鑫", patterns: [/协鑫|\bgcl\b/i] },
  { id: "spic", name: "国家电投", patterns: [/国家电投|国家电力投资|\bspic\b/i] },
  { id: "huaneng", name: "华能", patterns: [/华能|huaneng/i] },
  { id: "datang", name: "大唐", patterns: [/大唐集团|中国大唐|china\s?datang/i] },
  { id: "huadian", name: "华电", patterns: [/华电集团|中国华电|huadian/i] },
  { id: "china-energy", name: "国家能源集团", patterns: [/国家能源集团|国家能源投资|china\s?energy/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如微信公众号、北极星不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "tianhe-fujia", domains: ["trinapower.com"] },
  { entityId: "trina-solar", domains: ["trinasolar.com"] },
  { entityId: "huawei-digital-power", domains: ["digitalpower.huawei.com"] },
  { entityId: "sungrow", domains: ["sungrowpower.com"] },
  { entityId: "catl", domains: ["catl.com"] },
  { entityId: "teld", domains: ["teld.cn"] },
  { entityId: "envision", domains: ["envision-group.com"] },
  { entityId: "chint-anneng", domains: ["chintanneng.com"] },
  { entityId: "state-grid", domains: ["sgcc.com.cn"] },
  { entityId: "csg", domains: ["csg.cn"] },
  { entityId: "energy-china", domains: ["ceec.net.cn"] },
  { entityId: "powerchina", domains: ["powerchina.cn"] },
  { entityId: "longi", domains: ["longi.com"] },
  { entityId: "jinko", domains: ["jinkosolar.com"] },
  { entityId: "ja-solar", domains: ["jasolar.com"] },
  { entityId: "goodwe", domains: ["goodwe.com"] },
  { entityId: "ginlong", domains: ["ginlong.com"] },
  { entityId: "spic", domains: ["spic.com.cn"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "tianhe-fujia", pattern: /天合富家(?:能源|原装)/i },
  { entityId: "state-grid", pattern: /国网(?:综合能源|能源互联网)/i },
];
