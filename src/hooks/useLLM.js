import { useState } from 'react';

export function useLLM() {
  const [loading, setLoading] = useState(false);
  const [data, setData]     = useState(null);
  const [error, setError]   = useState(null);

  async function callLLM({ provider, task, query, maxResults }) {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, task, query, maxResults })
      });
      const ct = r.headers.get('content-type') || '';
      const payload = ct.includes('application/json') ? await r.json() : { error: `Non-JSON (${r.status})` };
      if (!r.ok) throw new Error(payload?.error || `HTTP ${r.status}`);
      setData(payload);
    } catch (e) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return { loading, data, error, callLLM };
}

