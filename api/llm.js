// api/llm.js
// A single endpoint that routes to Perplexity, Gemini, or OpenAI
// Supports two tasks out of the box: "links" (YouTube/TikTok-first) and "summary" (plain text)
// Response shape:
//  - links: { items: [{platform,title,url,est_duration_s,reason}], provider }
//  - summary: { text, provider }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { provider = 'perplexity', task = 'links', query, maxResults = 6 } = req.body || {};
    if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Missing query' });

    if (task === 'links') {
      const items = await handleLinks(provider, query, maxResults);
      return res.status(200).json({ items, provider });
    }

    if (task === 'summary') {
      const text = await handleSummary(provider, query);
      return res.status(200).json({ text, provider });
    }

    return res.status(400).json({ error: `Unsupported task "${task}"` });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e?.message || e) });
  }
}

/** -------- Helpers -------- */

async function handleLinks(provider, query, maxResults) {
  switch ((provider || '').toLowerCase()) {
    case 'perplexity':
      return await perplexityLinks(query, maxResults);
    case 'openai':
      // Note: OpenAI does not browse the web natively. This asks the model to output link candidates it knows.
      return await openaiLinks(query, maxResults);
    case 'gemini':
      // Same caveat as OpenAI; quality of direct YouTube/TikTok links may vary.
      return await geminiLinks(query, maxResults);
    default:
      throw new Error(`Unknown provider "${provider}"`);
  }
}

async function handleSummary(provider, prompt) {
  switch ((provider || '').toLowerCase()) {
    case 'perplexity':
      return await perplexitySummary(prompt);
    case 'openai':
      return await openaiSummary(prompt);
    case 'gemini':
      return await geminiSummary(prompt);
    default:
      throw new Error(`Unknown provider "${provider}"`);
  }
}

/** -------- Perplexity (best for live links) -------- */
async function perplexityLinks(query, maxResults) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  const model = process.env.PERPLEXITY_MODEL || 'sonar-pro';
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY missing');

  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: [
            'You are a link-finding assistant. Return ONLY JSON array.',
            'Prefer YouTube & TikTok. Prefer videos ≤ 5 min.',
            'Each item: {platform,title,url,est_duration_s,reason}. Avoid channel/playlist pages.'
          ].join(' ')
        },
        { role: 'user', content: `Find short videos for: ${query}. JSON array only.` }
      ]
    })
  });

  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content || '[]';
  const items = tryParseJson(content) || extractUrlsFallback(content, maxResults);

  // prioritize YT/TikTok
  items.sort((a, b) => score(b) - score(a));
  return items.slice(0, maxResults);

  function score(it) {
    const p = (it.platform || '').toLowerCase();
    return p === 'youtube' ? 2 : p === 'tiktok' ? 1.5 : 1;
  }
}

async function perplexitySummary(prompt) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  const model = process.env.PERPLEXITY_MODEL || 'sonar-pro';
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY missing');

  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [{ role: 'user', content: `In 5 bullet points, ${prompt}` }]
    })
  });
  const data = await r.json();
  return data?.choices?.[0]?.message?.content || '';
}

/** -------- OpenAI -------- */
async function openaiLinks(query, maxResults) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Return ONLY a JSON array of link objects with {platform,title,url,est_duration_s,reason}.' },
        { role: 'user', content: `Suggest the most relevant short videos (≤5 min preferred) for: ${query}. Prioritize YouTube & TikTok.` }
      ]
    })
  });
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content || '[]';
  return tryParseJson(content) || extractUrlsFallback(content, maxResults);
}

async function openaiSummary(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [{ role: 'user', content: `Summarize in ≤120 words: ${prompt}` }]
    })
  });
  const data = await r.json();
  return data?.choices?.[0]?.message?.content || '';
}

/** -------- Gemini -------- */
async function geminiLinks(query, maxResults) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  // Use REST against Gemini’s chat endpoint via @google/generative-ai? (not required; minimalist REST call)
  // For simplicity, call the text endpoint compatible with JSON instructions.
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: [
          'Return ONLY a JSON array of link objects with {platform,title,url,est_duration_s,reason}.',
          'Prefer YouTube & TikTok. Prefer videos ≤ 5 min.',
          `Topic: ${query}`
        ].join('\n') }]
      }]
    })
  });
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  return tryParseJson(text) || extractUrlsFallback(text, maxResults);
}

async function geminiSummary(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Summarize in ≤120 words: ${prompt}` }] }]
    })
  });
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/** -------- Utilities -------- */
function tryParseJson(s) {
  try {
    const cleaned = s.trim().replace(/^```json\s*|\s*```$/g, '');
    const j = JSON.parse(cleaned);
    if (Array.isArray(j)) {
      return j.filter(it => it && typeof it.url === 'string').map(it => ({
        platform: (it.platform || '').toString().toLowerCase(),
        title: it.title || null,
        url: it.url,
        est_duration_s: typeof it.est_duration_s === 'number' ? it.est_duration_s : null,
        reason: it.reason || null,
      }));
    }
    return null;
  } catch { return null; }
}

function extractUrlsFallback(s, max) {
  const urls = [...(s || '').matchAll(/https?:\/\/\S+/g)].map(m => m[0]).slice(0, max);
  return urls.map(u => ({
    platform: u.includes('tiktok.com') ? 'tiktok' : (u.includes('youtube.com') || u.includes('youtu.be')) ? 'youtube' : 'web',
    title: null, url: u, est_duration_s: null, reason: 'fallback'
  }));
}

