// api/perplexity/links.js
const API_URL = 'https://api.perplexity.ai/chat/completions';

function safeJsonParse(text) {
  try {
    const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, '');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { query, maxResults = 6, allowLongerThan5Min = false } = req.body || {};
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Missing query' });

  const apiKey = process.env.PERPLEXITY_API_KEY;
  const model = process.env.PERPLEXITY_MODEL || 'sonar-pro';
  if (!apiKey) return res.status(500).json({ error: 'PERPLEXITY_API_KEY not set' });

  const system = [
    'You are a link-finding assistant.',
    'Return only JSON.',
    'Find the most relevant short videos (prefer YouTube & TikTok).',
    `Prefer videos ≤ 5 minutes${allowLongerThan5Min ? ' (but allow longer if necessary)' : ''}.`,
    'Avoid channel or playlist pages unless no direct video exists.',
    'For each item, include: platform, title, url, est_duration_s (if known), reason.',
    `Return at most ${Math.max(1, Math.min(maxResults, 12))} items.`,
  ].join(' ');

  const user = `Topic / intent: "${query}". Prioritize accurate, official sources. Output JSON array only.`;

  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: 'Perplexity error', detail: text });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const json = safeJsonParse(content);

    if (!json || !Array.isArray(json)) {
      const urls = [...content.matchAll(/https?:\/\/\S+/g)].map(m => m[0]);
      return res.status(200).json({
        items: urls.slice(0, maxResults).map((u) => ({
          platform: u.includes('tiktok.com') ? 'tiktok' : (u.includes('youtube.com') || u.includes('youtu.be')) ? 'youtube' : 'web',
          title: null,
          url: u,
          est_duration_s: null,
          reason: 'extracted from model text (fallback)'
        })),
        raw: content
      });
    }

    const norm = json.map((it) => ({
      platform: (it.platform || '').toString().toLowerCase(),
      title: it.title || '',
      url: it.url || '',
      est_duration_s: typeof it.est_duration_s === 'number' ? it.est_duration_s : null,
      reason: it.reason || ''
    })).filter((it) => /^https?:\/\//.test(it.url));

    norm.sort((a, b) => {
      const aScore = a.platform === 'youtube' ? 2 : a.platform === 'tiktok' ? 1.5 : 1;
      const bScore = b.platform === 'youtube' ? 2 : b.platform === 'tiktok' ? 1.5 : 1;
      return bScore - aScore;
    });

    return res.status(200).json({ items: norm.slice(0, maxResults) });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err?.message || String(err) });
  }
}

