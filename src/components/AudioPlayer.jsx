import { useState, useEffect, useRef, useCallback } from 'react';

export default function AudioPlayer({ script }) {
  const turns = Array.isArray(script) ? script : [];

  const [current,  setCurrent]  = useState(-1);   // which turn is playing (-1 = idle)
  const [playing,  setPlaying]  = useState(false);
  const [paused,   setPaused]   = useState(false);
  const [elapsed,  setElapsed]  = useState(0);
  const [voices,   setVoices]   = useState([]);
  const [hostAVoice, setHostAVoice] = useState(null);
  const [hostBVoice, setHostBVoice] = useState(null);
  const [error,    setError]    = useState('');

  const synthRef   = useRef(window.speechSynthesis);
  const timerRef   = useRef(null);
  const turnIdxRef = useRef(0); // tracks across async callbacks

  // ── Load available voices ────────────────────────────────────
  useEffect(() => {
    function loadVoices() {
      const v = synthRef.current.getVoices();
      if (!v.length) return;
      setVoices(v);

      // Pick best voices: prefer English, natural-sounding
      const enVoices = v.filter(v => v.lang.startsWith('en'));

      // Host A — prefer male / Google US English
      const maleVoice = enVoices.find(v =>
        v.name.toLowerCase().includes('male') ||
        v.name.includes('David') ||
        v.name.includes('James') ||
        v.name.includes('Daniel') ||
        v.name.includes('Google US English')
      ) || enVoices[0];

      // Host B — prefer female / Google UK
      const femaleVoice = enVoices.find(v =>
        v.name.toLowerCase().includes('female') ||
        v.name.includes('Zira') ||
        v.name.includes('Samantha') ||
        v.name.includes('Google UK English Female') ||
        v.name.includes('Victoria')
      ) || enVoices[1] || enVoices[0];

      setHostAVoice(maleVoice);
      setHostBVoice(femaleVoice);
    }

    loadVoices();
    // Chrome loads voices asynchronously
    synthRef.current.addEventListener('voiceschanged', loadVoices);
    return () => synthRef.current.removeEventListener?.('voiceschanged', loadVoices);
  }, []);

  // ── Timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (playing && !paused) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [playing, paused]);

  // ── Stop all speech ──────────────────────────────────────────
  const stopAll = useCallback(() => {
    synthRef.current.cancel();
    setPlaying(false);
    setPaused(false);
    setCurrent(-1);
    turnIdxRef.current = 0;
    clearInterval(timerRef.current);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { synthRef.current.cancel(); clearInterval(timerRef.current); }, []);

  // ── Speak a single turn then advance ─────────────────────────
  const speakTurn = useCallback((idx) => {
    if (idx >= turns.length) {
      // All done
      setPlaying(false);
      setPaused(false);
      setCurrent(-1);
      clearInterval(timerRef.current);
      return;
    }

    const turn = turns[idx];
    const isA  = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');

    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.voice = isA ? hostAVoice : hostBVoice;
    utter.rate  = 0.92;
    utter.pitch = isA ? 0.95 : 1.1;
    utter.volume = 1;

    utter.onstart = () => {
      setCurrent(idx);
      turnIdxRef.current = idx;
    };

    utter.onend = () => {
      // Small pause between turns
      setTimeout(() => {
        if (turnIdxRef.current === idx) {  // only advance if not interrupted
          speakTurn(idx + 1);
        }
      }, 400);
    };

    utter.onerror = (e) => {
      if (e.error !== 'interrupted') {
        setError(`Speech error: ${e.error}`);
        setPlaying(false);
      }
    };

    synthRef.current.speak(utter);
  }, [turns, hostAVoice, hostBVoice]);

  // ── Play / Pause ─────────────────────────────────────────────
  function handlePlayPause() {
    if (!turns.length) return;

    if (!playing) {
      // Start fresh
      synthRef.current.cancel();
      setElapsed(0);
      setPlaying(true);
      setPaused(false);
      setError('');
      turnIdxRef.current = 0;
      speakTurn(0);
    } else if (paused) {
      synthRef.current.resume();
      setPaused(false);
    } else {
      synthRef.current.pause();
      setPaused(true);
    }
  }

  function handleStop() {
    stopAll();
    setElapsed(0);
  }

  function handlePrev() {
    const prev = Math.max(0, (current >= 0 ? current : 0) - 1);
    synthRef.current.cancel();
    turnIdxRef.current = prev;
    setCurrent(prev);
    if (playing) speakTurn(prev);
  }

  function handleNext() {
    const next = Math.min(turns.length - 1, (current >= 0 ? current : 0) + 1);
    synthRef.current.cancel();
    turnIdxRef.current = next;
    setCurrent(next);
    if (playing) speakTurn(next);
  }

  function jumpTo(idx) {
    synthRef.current.cancel();
    turnIdxRef.current = idx;
    setCurrent(idx);
    if (playing) speakTurn(idx);
    else {
      setPlaying(true);
      setPaused(false);
      speakTurn(idx);
    }
  }

  function fmtTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function isHostA(speaker) {
    return speaker?.toLowerCase().includes('host a') || speaker?.toLowerCase().includes('alex');
  }

  const progress = turns.length ? ((current >= 0 ? current : 0) / Math.max(turns.length - 1, 1)) * 100 : 0;

  // Animated wave bars
  const bars = Array.from({ length: 48 }, (_, i) => ({
    h: 14 + Math.abs(Math.sin(i * 0.55 + i * 0.12)) * 28,
    delay: i * 0.035,
  }));

  return (
    <div className="audio-page">

      {/* Wave visualization */}
      <div className="audio-wave">
        {bars.map((b, i) => (
          <div
            key={i}
            className="wave-bar"
            style={{
              height: (playing && !paused) ? `${b.h}px` : '6px',
              animationDelay: `${b.delay}s`,
              animationPlayState: (playing && !paused) ? 'running' : 'paused',
              transition: 'height 0.4s ease',
              opacity: (playing && !paused) ? 1 : 0.35,
            }}
          />
        ))}

        {/* Current speaker badge */}
        {playing && current >= 0 && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-hi)',
            borderRadius: 99, padding: '4px 12px', fontSize: 11, fontWeight: 600,
            color: isHostA(turns[current]?.speaker) ? 'var(--accent-lit)' : '#f9a8d4',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'loadPulse 1s ease-in-out infinite' }} />
            {turns[current]?.speaker?.split('(')[0]?.trim() || 'Speaking...'}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ padding: '8px 16px', background: '#ef444418', borderBottom: '1px solid #ef444430', fontSize: 12, color: 'var(--red)' }}>
          ⚠ {error}
        </div>
      )}

      {/* Voice info */}
      {voices.length > 0 && (
        <div style={{
          display: 'flex', gap: 12, padding: '8px 16px',
          background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span>🎙 Host A: <span style={{ color: 'var(--accent-lit)' }}>{hostAVoice?.name || 'Default'}</span></span>
          <span>🎙 Host B: <span style={{ color: '#f9a8d4' }}>{hostBVoice?.name || 'Default'}</span></span>
        </div>
      )}

      {voices.length === 0 && (
        <div style={{
          padding: '8px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--yellow)',
        }}>
          ⏳ Loading speech voices... (first load may take a moment)
        </div>
      )}

      {/* Controls */}
      <div className="audio-controls">
        <button className="audio-btn" onClick={handlePrev} disabled={current <= 0 && !playing}>⏮</button>

        <button className="audio-btn play-btn" onClick={handlePlayPause}>
          {playing && !paused ? '⏸' : (paused ? '▶' : '▶')}
        </button>

        <button className="audio-btn" onClick={handleStop} style={{ fontSize: 14 }}>⏹</button>
        <button className="audio-btn" onClick={handleNext} disabled={current >= turns.length - 1}>⏭</button>

        <span className="audio-time">{fmtTime(elapsed)}</span>

        <div
          className="audio-progress-track"
          style={{ flex: 1, maxWidth: 260, cursor: 'pointer' }}
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct  = (e.clientX - rect.left) / rect.width;
            const idx  = Math.round(pct * (turns.length - 1));
            jumpTo(Math.max(0, Math.min(turns.length - 1, idx)));
          }}
        >
          <div className="audio-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <span className="audio-time">
          {current >= 0 ? `${current + 1}` : '0'}/{turns.length}
        </span>
      </div>

      {/* Transcript */}
      <div className="audio-transcript">
        {turns.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No transcript available.</div>
        )}

        {turns.map((turn, i) => (
          <div
            key={i}
            id={`turn-${i}`}
            className={`audio-turn${i === current ? ' active' : ''}`}
            onClick={() => jumpTo(i)}
            style={{ cursor: 'pointer' }}
          >
            <div className={`audio-avatar ${isHostA(turn.speaker) ? 'a' : 'b'}`}>
              {isHostA(turn.speaker) ? 'A' : 'B'}
            </div>
            <div style={{ flex: 1 }}>
              <div className="audio-turn-header">
                <span className="audio-turn-speaker">{turn.speaker}</span>
                <span className="audio-turn-ts">{turn.timestamp || `${String(Math.floor(i * 22 / 60)).padStart(2,'0')}:${String((i * 22) % 60).padStart(2,'0')}`}</span>
                {i === current && playing && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent-lit)', fontWeight: 700 }}>
                    ▶ SPEAKING
                  </span>
                )}
              </div>
              <div className="audio-turn-text">{turn.text}</div>
            </div>
          </div>
        ))}

        {/* Auto-scroll active turn into view */}
        <AutoScroll current={current} />
      </div>
    </div>
  );
}

// Helper: auto-scrolls the active turn into view
function AutoScroll({ current }) {
  useEffect(() => {
    if (current < 0) return;
    const el = document.getElementById(`turn-${current}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [current]);
  return null;
}
