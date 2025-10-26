import { useState } from 'react';

export function usePerplexityLinks() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  async function fetchLinks(query, opts = {}) {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/perplexity/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...opts }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed');
      setItems(data.items || []);
    } catch (e) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return { loading, items, error, fetchLinks };
}

