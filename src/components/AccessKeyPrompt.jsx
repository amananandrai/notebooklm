import { useState } from 'react';
import { setAccessKey } from '../api/client';

export default function AccessKeyPrompt({ rejected }) {
  const [value, setValue] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setAccessKey(value);
    window.location.reload(); // refetch everything with the new key
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="access-key-title"
      style={{ position: 'fixed', inset: 0, zIndex: 30000, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', padding: 20 }}>
      <form onSubmit={submit} className="glass-panel"
        style={{ width: '100%', maxWidth: 420, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 id="access-key-title" style={{ margin: 0, fontFamily: 'var(--font-heading)' }}>Access key required</h3>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {rejected
            ? 'That access key was not accepted. Check it and try again.'
            : 'Enter the access key you were given to use this workspace.'}
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Access key"
          aria-label="Access key"
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hi, var(--border))', background: 'var(--bg-active, transparent)', color: 'inherit' }}
        />
        <button type="submit" className="btn-generate" disabled={!value.trim()}>Continue</button>
      </form>
    </div>
  );
}
