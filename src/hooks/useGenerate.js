/**
 * Generation state for a project: which (doc, tool) pairs are running, how long
 * they have been running (from server heartbeats) and their last error. Results
 * go straight into the artifacts query cache; the server has already saved them.
 * Running generations keep going when the user switches tabs or documents.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { generate } from '../api/endpoints';
import { keys } from './queries';

const PROJECT_LEVEL = '__project__';
const PROJECT_TOOLS = new Set(['synthesis']);

export function slotKey(docId, tool) {
  return `${PROJECT_TOOLS.has(tool) ? PROJECT_LEVEL : docId}:${tool}`;
}

function describeError(err) {
  if (err?.code === 'quota') {
    const wait = err.retryAfter ? ` Try again in about ${Math.ceil(err.retryAfter / 60)} min.` : '';
    return `The AI provider's quota or rate limit is exhausted.${wait}`;
  }
  if (err?.code === 'rate_limited') return err.message;
  if (err?.code === 'not_configured') return `The server's AI provider is not configured: ${err.message}`;
  return err?.message || 'Generation failed.';
}

export function useGenerate(projectId, documents) {
  const qc = useQueryClient();
  const [running, setRunning] = useState({}); // slot -> { elapsed }
  const [errors, setErrors] = useState({}); // slot -> message

  const run = useCallback(async (docId, tool, options = {}, { force = false } = {}) => {
    const slot = slotKey(docId, tool);
    setRunning(prev => ({ ...prev, [slot]: { elapsed: 0 } }));
    setErrors(prev => ({ ...prev, [slot]: null }));
    try {
      const { data } = await generate(
        { projectId, docId: PROJECT_TOOLS.has(tool) ? null : docId, tool, options, force },
        {
          onEvent: event => {
            if (event.type === 'heartbeat') setRunning(prev => (prev[slot] ? { ...prev, [slot]: { elapsed: event.elapsed } } : prev));
          },
        },
      );
      // Project-level results apply to every document's view.
      const targets = PROJECT_TOOLS.has(tool) ? (documents || []).map(d => d.id) : [docId];
      for (const id of targets) {
        qc.setQueryData(keys.artifacts(projectId, id), (prev = {}) => ({ ...prev, [tool]: data }));
      }
    } catch (err) {
      setErrors(prev => ({ ...prev, [slot]: describeError(err) }));
    } finally {
      setRunning(prev => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
    }
  }, [projectId, documents, qc]);

  return { run, running, errors };
}
