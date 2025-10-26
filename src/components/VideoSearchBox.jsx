import React, { useState } from 'react';
import { usePerplexityLinks } from '../hooks/usePerplexityLinks';

export default function VideoSearchBox() {
  const [q, setQ] = useState('');
  const { loading, items, error, fetchLinks } = usePerplexityLinks();

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); fetchLinks(q, { maxResults: 6 }); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you want to learn in 5 minutes?" />
        <button type="submit" disabled={loading}>Find videos</button>
      </form>

      {error && <div style={{ color: 'red' }}>{error}</div>}

      <ul>
        {items.map((it) => (
          <li key={it.url}>
            <strong>{(it.platform || '').toUpperCase()}</strong>{' '}
            <a href={it.url} target="_blank" rel="noreferrer">{it.title || it.url}</a>
            {it.est_duration_s ? ` • ~${Math.round(it.est_duration_s/60)} min` : null}
            {it.reason ? <div style={{ fontSize: 12, opacity: 0.8 }}>{it.reason}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

