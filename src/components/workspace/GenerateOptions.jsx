/** Per-tool generation options (slide count/theme, podcast length/tone). */
import { DECK_THEMES, IMAGE_SLIDE_THEMES, SLIDE_COUNTS, AUDIO_LENGTHS, AUDIO_TONES } from '../../utils/themes';

export default function GenerateOptions({ tab, options, set }) {
  return (
    <>
    {/* Dynamic Options for Text Slides */}
    {tab === 'slides' && (
      <div className="ws-gen-options-panel">
        {/* Slide Count Selector */}
        <div className="ws-gen-opt-group">
          <div className="ws-gen-opt-label">📊 Number of Slides:</div>
          <div className="ws-gen-pill-row">
            {SLIDE_COUNTS.map(sc => (
              <button
                key={sc.id}
                type="button"
                className={`ws-gen-pill${options.deckSlideCount === sc.id ? ' active' : ''}`}
                onClick={() => set('deckSlideCount', sc.id)}
              >
                <span className="ws-gen-pill-title">{sc.label}</span>
                <span className="ws-gen-pill-badge">{sc.badge}</span>
              </button>
            ))}
            <div className="ws-gen-custom-count">
              <span>Custom:</span>
              <input
                type="number"
                min={3}
                max={16}
                value={options.deckSlideCount}
                onChange={e => set('deckSlideCount', Math.max(3, Math.min(16, Number(e.target.value) || 7)))}
                className="ws-gen-num-input"
              />
            </div>
          </div>
        </div>

        {/* Deck Layout & Typography Style */}
        <div className="ws-gen-opt-group">
          <div className="ws-gen-opt-label">🎨 Deck Card Style:</div>
          <div className="ws-gen-pill-row">
            {Object.values(DECK_THEMES).map(t => (
              <button
                key={t.id}
                type="button"
                className={`ws-gen-theme-pill${options.deckTheme === t.id ? ' active' : ''}`}
                onClick={() => set('deckTheme', t.id)}
                style={{
                  '--theme-accent': t.accent,
                  '--theme-bg': t.bg,
                }}
              >
                <span className="ws-gen-theme-icon">{t.icon}</span>
                <span className="ws-gen-theme-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* Dynamic Options for Visual Slides + AI Images */}
    {tab === 'slides_img' && (
      <div className="ws-gen-options-panel">
        {/* Slide Count Selector */}
        <div className="ws-gen-opt-group">
          <div className="ws-gen-opt-label">🖼️ Number of Visual Slides:</div>
          <div className="ws-gen-pill-row">
            {SLIDE_COUNTS.map(sc => (
              <button
                key={sc.id}
                type="button"
                className={`ws-gen-pill${options.imageSlideCount === sc.id ? ' active' : ''}`}
                onClick={() => set('imageSlideCount', sc.id)}
              >
                <span className="ws-gen-pill-title">{sc.label}</span>
                <span className="ws-gen-pill-badge">{sc.badge}</span>
              </button>
            ))}
            <div className="ws-gen-custom-count">
              <span>Custom:</span>
              <input
                type="number"
                min={3}
                max={16}
                value={options.imageSlideCount}
                onChange={e => set('imageSlideCount', Math.max(3, Math.min(16, Number(e.target.value) || 7)))}
                className="ws-gen-num-input"
              />
            </div>
          </div>
        </div>

        {/* Visual AI Scene Theme */}
        <div className="ws-gen-opt-group">
          <div className="ws-gen-opt-label">🎨 AI Image & 16:9 Canvas Theme:</div>
          <div className="ws-gen-pill-row">
            {Object.values(IMAGE_SLIDE_THEMES).map(t => (
              <button
                key={t.id}
                type="button"
                className={`ws-gen-theme-pill${options.imageSlideTheme === t.id ? ' active' : ''}`}
                onClick={() => set('imageSlideTheme', t.id)}
                style={{
                  '--theme-accent': t.accent,
                  '--theme-bg': t.bg,
                }}
              >
                <span className="ws-gen-theme-icon">{t.icon}</span>
                <span className="ws-gen-theme-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* Dynamic Audio Podcast Options */}
    {tab === 'audio' && (
      <div className="ws-gen-options-panel">
        {/* Audio Length */}
        <div className="ws-gen-opt-group">
          <div className="ws-gen-opt-label">⏱️ Conversation Length:</div>
          <div className="ws-gen-pill-row">
            {AUDIO_LENGTHS.map(al => (
              <button
                key={al.id}
                type="button"
                className={`ws-gen-pill${options.audioLength === al.id ? ' active' : ''}`}
                onClick={() => set('audioLength', al.id)}
              >
                <span className="ws-gen-pill-title">{al.label}</span>
                <span className="ws-gen-pill-badge">{al.duration}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Audio Tone */}
        <div className="ws-gen-opt-group">
          <div className="ws-gen-opt-label">🎙️ Host Tone & Discussion Style:</div>
          <div className="ws-gen-pill-row">
            {AUDIO_TONES.map(at => (
              <button
                key={at.id}
                type="button"
                className={`ws-gen-pill${options.audioTone === at.id ? ' active' : ''}`}
                onClick={() => set('audioTone', at.id)}
              >
                <span className="ws-gen-pill-title">{at.icon} {at.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
