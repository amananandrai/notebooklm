import { API_ORIGIN, apiFetch } from './api';

/**
 * JSON-RPC client for the NotebookLM MCP endpoint on this app's own API server.
 */

const MCP_ENDPOINT = `${API_ORIGIN}/mcp`;

export async function callMCP(toolName, args) {
  const res = await apiFetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  if (res.status === 413) throw new Error('This document is too large to process.');
  if (!res.ok) throw new Error(`MCP HTTP error ${res.status}: ${res.statusText}`);

  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'MCP Error');

  const textContent = json.result?.content?.[0]?.text;
  if (!textContent) throw new Error('Empty response from MCP server');
  return JSON.parse(textContent);
}
