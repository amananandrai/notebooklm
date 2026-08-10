import { useState } from 'react';

export default function StudyGuideViewer({ data }) {
  const [subTab, setSubTab]     = useState('flashcards');
  const [flipped, setFlipped]   = useState({});
  const [mastered, setMastered] = useState({});
  const [answered, setAnswered] = useState({});  // { [qId]: selectedIndex }

  const flashcards = data?.flashcards || [];
  const quiz       = data?.quiz || [];

  function toggleFlip(id) {
    setFlipped(f => ({ ...f, [id]: !f[id] }));
  }

  function toggleMaster(id) {
    setMastered(m => ({ ...m, [id]: !m[id] }));
  }

  function handleAnswer(qId, idx) {
    if (answered[qId] !== undefined) return;
    setAnswered(a => ({ ...a, [qId]: idx }));
  }

  const masteredCount = Object.values(mastered).filter(Boolean).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tabs */}
      <div className="study-tabs">
        <button
          className={`study-tab-btn${subTab === 'flashcards' ? ' active' : ''}`}
          onClick={() => setSubTab('flashcards')}
        >
          🎴 Flashcards ({flashcards.length})
        </button>
        <button
          className={`study-tab-btn${subTab === 'quiz' ? ' active' : ''}`}
          onClick={() => setSubTab('quiz')}
        >
          🧩 Quiz ({quiz.length})
        </button>
        {subTab === 'flashcards' && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {masteredCount}/{flashcards.length} mastered
          </span>
        )}
      </div>

      <div className="study-body" style={{ flex: 1 }}>
        {subTab === 'flashcards' && (
          <div className="anim-fade-in">
            {flashcards.length === 0 && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No flashcards available.</div>
            )}
            {flashcards.map(card => (
              <div
                key={card.id}
                className={`fc-card${mastered[card.id] ? ' mastered' : ''}${flipped[card.id] ? ' flipped' : ''}`}
                onClick={() => toggleFlip(card.id)}
              >
                {/* Front */}
                <div className="fc-front">
                  <div className="fc-cat">{card.category}</div>
                  <div className="fc-question">{card.question}</div>
                  <div className="fc-hint">Click to reveal answer</div>
                  {mastered[card.id] && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)' }}>✓ Mastered</div>
                  )}
                </div>

                {/* Back */}
                <div className="fc-back" onClick={e => e.stopPropagation()}>
                  <div className="fc-back-label">Answer</div>
                  <div className="fc-answer">{card.answer}</div>
                  <div className="fc-actions">
                    <button
                      className={`fc-btn ${mastered[card.id] ? 'unmaster' : 'master'}`}
                      onClick={() => toggleMaster(card.id)}
                    >
                      {mastered[card.id] ? '✕ Unmark' : '✓ Got it!'}
                    </button>
                    <button
                      className="fc-btn unmaster"
                      onClick={() => setFlipped(f => ({ ...f, [card.id]: false }))}
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {subTab === 'quiz' && (
          <div className="anim-fade-in">
            {quiz.length === 0 && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No quiz questions available.</div>
            )}
            {quiz.map((q, qi) => {
              const chosen = answered[q.id];
              const isAnswered = chosen !== undefined;
              return (
                <div key={q.id} className="quiz-question">
                  <div className="quiz-q-num">Question {qi + 1}</div>
                  <div className="quiz-q-text">{q.question}</div>
                  <div className="quiz-options">
                    {(q.options || []).map((opt, oi) => {
                      let cls = 'quiz-opt';
                      if (isAnswered) {
                        cls += ' answered';
                        if (oi === q.correctIndex) cls += ' correct';
                        else if (oi === chosen) cls += ' wrong';
                      } else if (oi === chosen) {
                        cls += ' selected';
                      }
                      return (
                        <div key={oi} className={cls} onClick={() => handleAnswer(q.id, oi)}>
                          <div className="quiz-letter">{String.fromCharCode(65 + oi)}</div>
                          {opt}
                        </div>
                      );
                    })}
                  </div>
                  {isAnswered && q.explanation && (
                    <div className="quiz-explanation">
                      {chosen === q.correctIndex ? '✓ Correct! ' : '✕ Incorrect. '}{q.explanation}
                    </div>
                  )}
                </div>
              );
            })}

            {Object.keys(answered).length === quiz.length && quiz.length > 0 && (
              <div style={{
                textAlign: 'center', padding: 24,
                background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-med)', marginTop: 16,
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>
                  {Object.entries(answered).filter(([id, ci]) => {
                    const q = quiz.find(q => q.id === id);
                    return q && ci === q.correctIndex;
                  }).length === quiz.length ? '🎉' : '📚'}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {Object.entries(answered).filter(([id, ci]) => {
                    const q = quiz.find(q => q.id === id);
                    return q && ci === q.correctIndex;
                  }).length}/{quiz.length} Correct
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Quiz complete!
                </div>
                <button
                  className="btn-secondary"
                  style={{ marginTop: 16 }}
                  onClick={() => setAnswered({})}
                >
                  Retry Quiz
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
