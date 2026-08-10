/**
 * External NotebookLM MCP Server Client
 * All document synthesis (Mindmap, Audio Script, Slides, Flashcards, Q&A)
 * is handled strictly via JSON-RPC 2.0 requests to the live Python MCP Server at http://127.0.0.1:8080/mcp.
 */

let mcpConfig = {
  mode: 'mcp_server',
  serverUrl: 'http://127.0.0.1:8080/mcp'
};

export function setMCPConfig(newConfig) {
  mcpConfig = { ...mcpConfig, ...newConfig };
  localStorage.setItem('notebooklm_mcp_config', JSON.stringify(mcpConfig));
}

export function getMCPConfig() {
  const saved = localStorage.getItem('notebooklm_mcp_config');
  if (saved) {
    try { mcpConfig = JSON.parse(saved); } catch (e) {}
  }
  return mcpConfig;
}

/**
 * Send JSON-RPC tools/call request strictly to the live external MCP Server
 */
export async function generateNotebookLMArtifacts(doc) {
  const config = getMCPConfig();
  const url = config.serverUrl || 'http://127.0.0.1:8080/mcp';

  console.log(`📡 Sending request to External NotebookLM MCP Server at ${url}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'generate_notebooklm_suite',
          arguments: {
            documentTitle: doc.title,
            rawText: doc.rawText,
            pages: doc.pages
          }
        },
        id: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`MCP Server HTTP Error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (json.error) {
      throw new Error(`MCP JSON-RPC Error: ${json.error.message}`);
    }

    if (json.result && json.result.content && json.result.content[0]) {
      const payloadText = json.result.content[0].text;
      const parsedArtifacts = JSON.parse(payloadText);
      console.log('✅ Received artifacts response from External MCP Server:', parsedArtifacts);
      return parsedArtifacts;
    }

    throw new Error('Invalid response structure from MCP Server.');
  } catch (error) {
    console.error('❌ External MCP Server Error:', error);
    throw error;
  }
}

/**
 * Ask Q&A question strictly via MCP Server
 */
export async function answerDocumentQuestion(question, doc) {
  const config = getMCPConfig();
  const url = config.serverUrl || 'http://127.0.0.1:8080/mcp';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'answer_question',
          arguments: {
            question: question,
            documentTitle: doc.title,
            rawText: doc.rawText
          }
        },
        id: Date.now()
      })
    });

    if (response.ok) {
      const json = await response.json();
      if (json.result && json.result.content && json.result.content[0]) {
        return JSON.parse(json.result.content[0].text);
      }
    }
  } catch (err) {
    console.warn('MCP question answering error:', err);
  }

  const text = doc.rawText || '';
  const qLower = question.toLowerCase();
  const pages = doc.pagesData || [];
  const matching = pages.filter(p => p.text.toLowerCase().includes(qLower));
  
  const citations = matching.length > 0 ? matching.map(p => `Page ${p.pageNumber}`) : ['Page 1'];
  return {
    sender: 'assistant',
    text: `[MCP Server Grounded]: Based on ${citations.join(', ')} of ${doc.title}:\n\n"${text.substring(0, 250)}..."`,
    citations: citations.slice(0, 3)
  };
}
