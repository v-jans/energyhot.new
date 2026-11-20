// Topic pages: which articles a topic takes, and their counts.
// Written before the code, from the ways it can go wrong:
// - a company topic takes an article about another company that only mentions it (several subjects,
//   its name nowhere in the title), or drops one about it whose title names it in English, in another
//   case, next to Chinese text, or only by a product (it is the article's only subject);
// - a Latin name matches inside another word ("Envisioning" is not Envision); a headline naming a company
//   that is not a subject of the article gets in;
// - a technical-direction topic stops taking its tags;
// - withdrawn or not yet released articles appear in a list or a count;
// - an article or story page names a topic its reports do not belong to;
// - an article page cannot tell which of its tags are a topic's own, so they link to filtered lists;
// - a topic without content has no page, or an unknown slug or a page past the end has one.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { TOPICS, loadTopicPage, listTopicSummaries, topicsOfStory } from "@aihot/backend/publication/topics";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const OFFICIAL = `test-topics-official-${T}`;
const MEDIA = `test-topics-media-${T}`;
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES
    (${OFFICIAL}, 'Official', 'rss', 'T1', 'editorial', '2100-01-01'),
    (${MEDIA}, 'Media', 'rss', 'T2', 'editorial', '2100-01-01')`;
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

let n = 0;
const CATEGORY_TAG: Record<string, string> = {
  policy: "政策/标准", project: "项目/交易", market: "市场/数据", industry: "公司/资本",
  research: "研究/报告", practice: "设计/实践", opinion: "观点/判断", product: "产品/方案",
};
interface Report {
  source?: string;
  at: Date;
  title: string;
  originalTitle?: string;
  subjects?: string[];
  tags?: string[];
  score?: number;
  selected?: boolean;
  fact?: number;
  category?: string;
}

/** A published report; `fact` links it to a fact before publishing, as grouping would. */
async function report(r: Report): Promise<string> {
  n += 1;
  const { articleId } = await upsertMaterial({
    sourceId: r.source ?? MEDIA, url: `https://example.com/topics-${T}-${n}`, title: r.originalTitle ?? r.title, bodyText: "body", bodyHtml: "<p>body</p>", bodyStatus: "ok", via: "fetch", publishedAt: r.at,
  });
  await sql`UPDATE articles SET discovered_at = ${r.at}, timeline_at = ${r.at}, grouped_at = now() WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, subjects, tags)
            VALUES (${articleId}, 1, 'rule', 'pass', ${r.category ?? "product"}, ${r.title}, ${`摘要 ${n}`}, ${r.score ?? 80}, ${r.selected ?? true}, ${r.subjects ?? []}, ${[CATEGORY_TAG[r.category ?? "product"]!, ...(r.tags ?? [])]})`;
  if (r.fact) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${r.fact}, ${articleId}, 'report')`;
  await publishArticle(articleId, { releasedAt: new Date(r.at.getTime() + 60_000) });
  return articleId;
}

async function story(title: string): Promise<{ id: number; publicId: string }> {
  const publicId = randomUUID();
  const [s] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES (${publicId}, ${title}, now(), now()) RETURNING id`;
  return { id: s!.id, publicId };
}

async function fact(storyId: number | null, title: string): Promise<number> {
  const [f] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${`f-${T}-${randomUUID()}`}, ${storyId}, ${title}) RETURNING id`;
  return f!.id;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);
const page = async (slug: string, p = 1) => {
  const data = await loadTopicPage(slug, p, new Date());
  assert.ok(data, `${slug} page ${p}`);
  return data;
};
/** Every article of a topic, over all its pages. */
async function members(slug: string): Promise<string[]> {
  const first = await page(slug);
  const out = ids(first.items);
  for (let p = 2; p <= first.pageCount; p++) out.push(...ids((await page(slug, p)).items));
  return out;
}

test("a company topic takes the articles about it, not the ones that only mention it", async () => {
  const about = await report({ at: hoursAgo(30), title: `天合富家发布原装户用方案 ${T}`, subjects: ["tianhe-fujia"] });
  const alias = await report({ at: hoursAgo(31), title: `天合蓝天新品上线 ${T}`, subjects: ["tianhe-fujia"] });
  const english = await report({ at: hoursAgo(32), title: `新组件发布 ${T}`, originalTitle: `Trina Solar launches a new module ${T}`, subjects: ["trina-solar", "sungrow"] });
  const inquiry = await report({ at: hoursAgo(33), title: `监管问询天合富家与阳光电源 ${T}`, subjects: ["tianhe-fujia", "sungrow", "chint-anneng"] });
  const lowerCase = await report({ at: hoursAgo(34), title: `sungrow 公布新的并网标准 ${T}`, subjects: ["sungrow", "tianhe-fujia"] });
  const pact = await report({ at: hoursAgo(35), title: `二十余家能源企业签署安全协议 ${T}`, subjects: ["tianhe-fujia", "sungrow", "catl"] });
  const envisioning = await report({ at: hoursAgo(36), title: `Envisioning 零碳未来的报告 ${T}`, subjects: ["envision", "catl"] });
  const adjacent = await report({ at: hoursAgo(37), title: `发布远景零碳园区方案 ${T}`, subjects: ["envision", "catl"] });
  const headline = await report({ at: hoursAgo(38), title: `阳光电源被一篇盘点提到 ${T}`, subjects: ["catl"] });
  const vpp = await report({ at: hoursAgo(39), title: `虚拟电厂聚合平台上线 ${T}`, tags: ["虚拟电厂"] });

  const tianhe = await members("tianhe-fujia");
  for (const id of [about, alias, inquiry]) assert.ok(tianhe.includes(id), "about 天合富家");
  for (const id of [english, lowerCase, pact, headline]) assert.ok(!tianhe.includes(id), "only mentions 天合富家");
  const sungrow = await members("sungrow");
  for (const id of [inquiry, lowerCase]) assert.ok(sungrow.includes(id), "about 阳光电源");
  for (const id of [about, pact, headline]) assert.ok(!sungrow.includes(id), "only mentions 阳光电源");
  const envision = await members("envision");
  assert.ok(envision.includes(adjacent), "远景 next to Chinese text");
  assert.ok(!envision.includes(envisioning), "Envisioning is not Envision");
  assert.ok((await members("vpp")).includes(vpp), "a technical direction takes its tag");

  // The article page names the topics it belongs to.
  const topicsOf = async (id: string) => {
    const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
    return (JSON.parse(res.body) as { topics: Array<{ slug: string }> }).topics.map((t) => t.slug);
  };
  assert.deepEqual(await topicsOf(about), ["tianhe-fujia", "product-solutions"]);
  assert.deepEqual(await topicsOf(inquiry), ["tianhe-fujia", "sungrow", "product-solutions"]);
  assert.deepEqual(await topicsOf(pact), ["product-solutions"]);
  assert.deepEqual(await topicsOf(vpp), ["vpp", "product-solutions"]);
});

test("an article page says which of its tags are a topic's own", async () => {
  // A direction's or a form's tags, and the tag cards show for a company (its subject tag is never shown).
  const id = await report({ at: hoursAgo(3), title: `天合富家发布虚拟电厂聚合平台 ${T}`, subjects: ["tianhe-fujia", "sungrow"], tags: ["虚拟电厂", "储能", "天合富家", "阳光电源", "聚合"] });
  const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
  const body = JSON.parse(res.body) as { tags: string[]; tagTopics: Record<string, string>; topics: Array<{ slug: string }> };
  assert.deepEqual(body.tags, ["产品/方案", "虚拟电厂", "储能", "天合富家", "阳光电源", "聚合"]);
  assert.deepEqual(body.tagTopics, { "产品/方案": "product-solutions", 虚拟电厂: "vpp", 储能: "storage", 天合富家: "tianhe-fujia", 阳光电源: "sungrow" });
  // The company its title does not name is a topic of the tag, not of the article.
  assert.deepEqual(body.topics.map((t) => t.slug), ["tianhe-fujia", "storage", "vpp", "product-solutions"]);
});

test("renaming a company topic keeps its old full name usable for search", async () => {
  const id = await report({at: hoursAgo(2), title: `天合富家发布新的户用方案 ${T}`, subjects: ['tianhe-fujia'], selected: false});
  for (const query of ['天合富家能源股份有限公司', '天合智慧分布式']) {
    const res = await app.inject({method: 'GET', url: `/api/site/pool?q=${encodeURIComponent(query)}`});
    assert.equal(res.statusCode, 200);
    assert.ok(ids(JSON.parse(res.body).items).includes(id), 'full company names must still find subject-tagged reports');
  }
});

test("a story page names the topics of its reports", async () => {
  const launch = await story(`虚拟电厂聚合平台上线 ${T}`);
  await report({ source: OFFICIAL, at: hoursAgo(26), title: `虚拟电厂聚合平台上线 ${T}`, tags: ["虚拟电厂"], fact: await fact(launch.id, "平台上线") });
  assert.deepEqual(await topicsOfStory(launch.id), [{ slug: "vpp", name: "虚拟电厂" }, { slug: "product-solutions", name: "产品与方案" }]);
});

test("withdrawn articles stay out of lists and counts", async () => {
  const kept = await report({ at: hoursAgo(5), title: `正泰安能发布新方案 ${T}`, subjects: ["chint-anneng"] });
  const withdrawn = await report({ at: hoursAgo(4), title: `正泰安能撤回的消息 ${T}`, subjects: ["chint-anneng"] });
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${withdrawn}`;

  const data = await page("chint-anneng");
  assert.deepEqual(ids(data.items), [kept]);
  assert.equal(data.topic.total, 1);
  const summary = (await listTopicSummaries()).topics.find((t) => t.slug === "chint-anneng")!;
  assert.equal(summary.latest?.title, `正泰安能发布新方案 ${T}`, "the index shows the newest public article");
});

test("every topic has a page; unknown topics and pages past the end have none", async () => {
  const empty = await page("powerchina");
  assert.equal(empty.topic.indexable, false, "a topic without content is not indexed");
  assert.deepEqual(empty.items, []);
  assert.equal(await loadTopicPage("not-a-topic", 1, new Date()), null);
  assert.equal(await loadTopicPage("powerchina", 2, new Date()), null);
  const index = await app.inject({ method: "GET", url: "/api/site/topics" });
  const body = JSON.parse(index.body) as { groups: Array<{ key: string }>; topics: Array<{ slug: string }> };
  assert.deepEqual(body.groups.map((g) => g.key), ["company", "field", "genre"]);
  assert.deepEqual(body.topics.map((t) => t.slug).sort(), TOPICS.map((t) => t.slug).sort(), "the index lists every topic");
});
