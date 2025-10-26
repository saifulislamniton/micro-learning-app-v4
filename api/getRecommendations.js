// api/getRecommendations.js
//
// Rewritten to call the unified /api/llm route so you can choose
// Perplexity / Gemini / OpenAI at runtime while preserving the
// original response format expected by the frontend.
//
// Expected request body:
// {
//   subject: string,
//   userInfo: string,
//   experienceLevel: "beginner" | "intermediate" | "advanced" | string,
//   learningFormat: "video" | "text" | "audio" | string,
//   provider?: "perplexity" | "gemini" | "openai",
//   maxResults?: number
// }
//
// Response (unchanged schema):
// { recommendations: [ { topic, description, url }, ... ] }

function buildBaseUrl(req) {
  // In Vercel, VERCEL_URL is like "myapp.vercel.app"
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function coalesceProvider(body) {
  // Default to Perplexity because it’s best at returning real YT/TikTok links
  const p = (body?.provider || '').toLowerCase();
  if (p === 'perplexity' || p === 'gemini' || p === 'openai') return p;
  return 'perplexity';
}

function buildQuery({ subject, userInfo, experienceLevel, learningFormat }) {
  // Bias results toward short/5-min content; prefer video if asked
  const fmt = (learningFormat || '').toLowerCase();
  const timeHint = 'in under 5 minutes';
  const levelHint = experienceLevel ? `${experienceLevel} level` : '';
  const formatHint =
    fmt.includes('video') ? 'short video' :
    fmt.includes('audio') ? 'short audio' :
    fmt.includes('text')  ? 'concise primer' : 'micro-learning resource';

  // Example: "SQL joins short video for beginner level in under 5 minutes"
  return [subject, formatHint, levelHint, timeHint, userInfo]
    .filter(Boolean)
    .join(' ').replace(/\s+/g, ' ').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const {
      subject,
      userInfo,
      experienceLevel,
      learningFormat,
      provider: providerRaw,
      maxResults = 6
    } = req.body || {};

    if (!subject) {
      return res.status(400).json({ error: 'Missing "subject" in request body.' });
    }

    const provider = coalesceProvider(req.body);
    const query = buildQuery({ subject, userInfo, experienceLevel, learningFormat });
    const baseUrl = buildBaseUrl(req);

    // Call the unified LLM router for "links"
    const llmResp = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        task: 'links',
        query,
        maxResults: Math.max(2, Math.min(maxResults, 12))
      })
    });

    const contentType = llmResp.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await llmResp.json()
      : { error: `Non-JSON from /api/llm (status ${llmResp.status})` };

    if (!llmResp.ok) {
      const detail = typeof payload === 'object' ? payload?.error || payload : payload;
      throw new Error(`LLM endpoint failed: ${detail}`);
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) {
      return res.status(200).json({ recommendations: [] });
    }

    // Take top 2 and map to the legacy schema
    const top2 = items.slice(0, 2).map((it) => {
      const title = (it.title || '').toString().trim();
      const reason = (it.reason || '').toString().trim();
      const platform = (it.platform || '').toString().trim();

      // Topic = cleaned title (fallback to subject)
      const topic = title || subject;

      // One-sentence description synthesized from the reason/platform
      const descPieces = [];
      if (reason) descPieces.push(reason.replace(/\s+/g, ' ').trim());
      if (platform) descPieces.push(`(Platform: ${platform})`);
      const description = descPieces.join(' ').trim() || `A concise ${learningFormat || 'micro-learning'} on "${subject}".`;

      return {
        topic,
        description,
        url: it.url
      };
    });

    return res.status(200).json({ recommendations: top2 });
  } catch (error) {
    console.error('getRecommendations error:', error);
    return res.status(500).json({ error: error?.message || 'Internal Server Error' });
  }
}

