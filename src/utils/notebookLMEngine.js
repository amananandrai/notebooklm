/**
 * Single JSON-RPC client for the NotebookLM MCP server.
 * The endpoint comes from the saved MCP config, or defaults to the local
 * dev server on localhost / same-origin `/mcp` when deployed.
 */

const IS_LOCAL = typeof window !== 'undefined' &&
  (window.location.origin.includes('5173') || window.location.origin.includes('localhost'));
const DEFAULT_URL = IS_LOCAL ? 'http://127.0.0.1:8080/mcp' : '/mcp';

let mcpConfig = { mode: 'mcp_server', serverUrl: DEFAULT_URL };

export function setMCPConfig(newConfig) {
  mcpConfig = { ...mcpConfig, ...newConfig };
  localStorage.setItem('notebooklm_mcp_config', JSON.stringify(mcpConfig));
}

export function getMCPConfig() {
  try {
    const saved = localStorage.getItem('notebooklm_mcp_config');
    if (saved) mcpConfig = { ...mcpConfig, ...JSON.parse(saved) };
  } catch { /* ignore corrupt config */ }
  return mcpConfig;
}

export function getMCPEndpoint() {
  return getMCPConfig().serverUrl || DEFAULT_URL;
}

export async function callMCP(toolName, args) {
  const res = await fetch(getMCPEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`MCP HTTP error ${res.status}: ${res.statusText}`);

  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'MCP Error');

  const textContent = json.result?.content?.[0]?.text;
  if (!textContent) throw new Error('Empty response from MCP server');
  return JSON.parse(textContent);
}
