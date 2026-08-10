import React, { useState } from 'react';
import { X, Cpu, Server, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { getMCPConfig, setMCPConfig } from '../utils/notebookLMEngine';

export default function MCPConfigModal({ onClose }) {
  const currentConfig = getMCPConfig();
  const [mode, setMode] = useState(currentConfig.mode || 'internal');
  const [serverUrl, setServerUrl] = useState(currentConfig.serverUrl || 'http://localhost:8000/mcp');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setMCPConfig({ mode, serverUrl });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '540px', padding: '28px', background: 'rgba(18, 24, 38, 0.98)', border: '1px solid var(--border-highlight)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu style={{ width: '22px', height: '22px', color: 'var(--accent-indigo)' }} />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
              NotebookLM MCP Provider Settings
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
          Choose how your uploaded PDF data is synthesized into Mind Maps, Audio scripts, Slide decks, and Flashcards.
        </p>

        {/* Mode Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div
            onClick={() => setMode('internal')}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${mode === 'internal' ? 'var(--accent-indigo)' : 'var(--border-color)'}`,
              background: mode === 'internal' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}
          >
            <Cpu style={{ width: '20px', height: '20px', color: mode === 'internal' ? 'var(--accent-indigo)' : 'var(--text-muted)', marginTop: '2px' }} />
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                1. Client-Side Browser Engine (Offline / Instant)
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Runs 100% locally inside your browser using built-in JS parsing, WASM OCR, and Web Speech audio synthesis. Zero API server required.
              </p>
            </div>
          </div>

          <div
            onClick={() => setMode('mcp_server')}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${mode === 'mcp_server' ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
              background: mode === 'mcp_server' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}
          >
            <Server style={{ width: '20px', height: '20px', color: mode === 'mcp_server' ? 'var(--accent-cyan)' : 'var(--text-muted)', marginTop: '2px' }} />
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                2. Live External NotebookLM MCP Server
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Connects to an external Model Context Protocol (MCP) server over HTTP JSON-RPC endpoint to fetch server-synthesized artifacts.
              </p>
            </div>
          </div>
        </div>

        {/* External MCP Server URL Input */}
        {mode === 'mcp_server' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              NotebookLM MCP Server JSON-RPC Endpoint URL:
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://localhost:8000/mcp"
              className="glass-input"
              style={{ width: '100%', fontSize: '0.88rem' }}
            />
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
          {savedSuccess ? (
            <span style={{ color: 'var(--accent-emerald)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check style={{ width: '16px', height: '16px' }} /> Saved Settings!
            </span>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Active Provider: {mode === 'internal' ? 'Browser Engine' : 'External MCP'}</span>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary">Save Provider</button>
          </div>
        </div>
      </div>
    </div>
  );
}
