import { useState, useRef, useEffect } from 'react';

export default function ChatAssistant({ docTitle, onAskQuestion, initialMessages = [], onSaveMessages }) {
  const [messages, setMessages] = useState(() => {
    if (initialMessages?.length) return initialMessages;
    return [{
      id: 'init',
      sender: 'assistant',
      text: `**Document loaded: ${docTitle}**\n\nAsk me anything about this document. I'll answer based strictly on its content with Gemini AI.`,
      citations: [],
    }];
  });
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');

    const userMsg = { id: Date.now(), sender: 'user', text: q, citations: [] };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const resp = await onAskQuestion(q);
      const aiMsg = {
        id: Date.now() + 1,
        sender: 'assistant',
        text: resp.text,
        citations: resp.citations || [],
      };
      const final = [...updated, aiMsg];
      setMessages(final);
      onSaveMessages?.(final);
    } catch (err) {
      const errMsg = {
        id: Date.now() + 1,
        sender: 'assistant',
        text: `⚠️ Error: ${err.message}. Please ensure the MCP server is running at http://127.0.0.1:8080`,
        citations: [],
      };
      const final = [...updated, errMsg];
      setMessages(final);
      onSaveMessages?.(final);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleDownloadChat() {
    const text = messages.map(m => `**${m.sender === 'user' ? 'User' : 'Gemini AI'}**:\n${m.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docTitle.replace('.pdf', '')}_ChatLog.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderText(text) {
    // Simple markdown: bold, newlines
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  }

  return (
    <div className="chat-layout">
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.sender === 'user' ? 'user' : 'ai'}`}>
            <div className={`chat-avatar ${msg.sender === 'user' ? 'user' : 'ai'}`}>
              {msg.sender === 'user' ? 'U' : '✦'}
            </div>
            <div>
              <div
                className="chat-msg"
                dangerouslySetInnerHTML={{ __html: renderText(msg.text) }}
              />
              {msg.citations?.length > 0 && (
                <div className="chat-citations">
                  {msg.citations.map((c, i) => (
                    <span key={i} className="chat-citation">📎 {c}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble ai">
            <div className="chat-avatar ai">✦</div>
            <div className="chat-msg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="chat-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          <div>
            📄 Chatting about: <span style={{ color: 'var(--text-secondary)' }}>{docTitle}</span>
          </div>
          {messages.length > 1 && (
            <button
              onClick={handleDownloadChat}
              style={{ background: 'none', border: 'none', color: 'var(--accent-lit)', cursor: 'pointer', padding: 0, fontSize: 11, fontFamily: 'inherit', fontWeight: 600 }}
              onMouseEnter={e => e.target.style.textDecoration = 'underline'}
              onMouseLeave={e => e.target.style.textDecoration = 'none'}
            >
              ⬇ Download Chat Log
            </button>
          )}
        </div>
        <div className="chat-input-row">
          <textarea
            className="chat-input"
            rows={1}
            placeholder="Ask anything about this document..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="chat-send"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            {loading ? '⏳' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
