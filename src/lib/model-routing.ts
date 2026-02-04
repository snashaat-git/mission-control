// Mission Control model routing (applied dynamically via OpenClaw sessions.patch)

interface AgentModelConfig {
  sessionKey: string;
  agentModel?: string | null;  // Agent's preferred model from DB
}

export function desiredModelForSession(sessionKey: string): string | null {
  // Charlie (orchestrator)
  if (sessionKey === 'agent:main:main') return 'ollama/kimi-k2.5:cloud';

  // Specialists
  if (sessionKey === 'agent:developer:main') return 'openrouter/stepfun/step-3.5-flash';
  if (sessionKey === 'agent:researcher:main') return 'openai-codex/gpt-5.2';
  if (sessionKey === 'agent:writer:main') return 'openai-codex/gpt-5.2';

  return null;
}

/**
 * Resolve effective model for an agent session.
 * Priority: 1) Agent's configured model, 2) Session-based fallback, 3) None (use system default)
 */
export function resolveAgentModel(config: AgentModelConfig): string | null {
  // Priority 1: Agent's explicit model preference from Mission Control DB
  if (config.agentModel && config.agentModel.trim() !== '') {
    return config.agentModel;
  }

  // Priority 2: Legacy session-key based routing
  return desiredModelForSession(config.sessionKey);
}
