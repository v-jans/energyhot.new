-- 生产库执行:停用北极星光伏网 + 补索比光伏网主站源
-- 用法:psql $DATABASE_URL -f deploy-sources-20261125.sql
-- (配置与 industry/sources.json 0773f97 一致;本地库已于 2026-11-25 应用)

-- 1) 北极星光伏网:阿里云 WAF 全站 JS 挑战(HTTP 200 但内容是混淆脚本,无 RSS/sitemap 可替代),停用并保留历史
UPDATE sources SET enabled = false, health = 'paused'
WHERE id = 'bjx-guangfu' AND enabled;

-- 2) 索比光伏网 · 主站:www.solarbe.com SSR 列表,单页 92 条文章链接
--    条目只匹配带日期路径的文章链接;发布时间读文章页 .introduction(+08:00)
INSERT INTO sources (id, name, kind, config, tier, owner_entity_id, participation_mode, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
VALUES ('solarbe-main', '索比光伏网 · 主站', 'web_list', $json${"url": "https://www.solarbe.com/", "itemSelector": "a[href^='https://news.solarbe.com/2']", "linkSelector": "a", "titleSelector": "a", "allowUrlPrefixes": ["https://news.solarbe.com/2"], "detail": {"maxFetches": 12, "titleRegex": "<title>([^<]*?)(?:-索比光伏网)?</title>", "titleAuthoritative": true, "publishedAtSelector": ".introduction", "publishedAtRegex": "(\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{2}:\\d{2}(?::\\d{2})?)?)"}, "_aihot": {"initialBackfillLimit": 10}}$json$, 'T2', NULL, 'editorial', 120, ARRAY['媒体','光伏','市场'], false, false, true, now())
ON CONFLICT (id) DO NOTHING;
