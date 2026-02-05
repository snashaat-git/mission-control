// Agent configuration for auto-start and dispatch behavior

export interface AgentConfig {
  id: string;
  name: string;
  auto_start: boolean;  // Auto-start when assigned
  requires_confirmation: boolean;  // Require manual review before starting
  type: 'subagent' | 'webhook' | 'manual';
  dispatch_endpoint?: string;
}

// Agent dispatch configuration
export const AGENT_DISPATCH_CONFIG: Record<string, AgentConfig> = {
  // Researcher - Auto-start enabled for research tasks
  '48cc14f6-ad76-42ea-a330-35f0966d5efd': {
    id: '48cc14f6-ad76-42ea-a330-35f0966d5efd',
    name: 'Researcher',
    auto_start: true,
    requires_confirmation: false,
    type: 'subagent',
  },
  // Web Developer - Auto-start enabled
  // Note: Replace 'web-developer-id' with actual agent ID from database
  'web-developer-id': {
    id: 'web-developer-id',
    name: 'Web Developer',
    auto_start: true,
    requires_confirmation: false,
    type: 'subagent',
  },
};

// Default config for unknown agents
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  id: 'unknown',
  name: 'Unknown',
  auto_start: false,  // Safe default - don't auto-start unknown agents
  requires_confirmation: true,
  type: 'manual',
};

export function getAgentConfig(agentId: string): AgentConfig {
  return AGENT_DISPATCH_CONFIG[agentId] || DEFAULT_AGENT_CONFIG;
}

export function shouldAutoStart(agentId: string): boolean {
  const config = getAgentConfig(agentId);
  return config.auto_start && !config.requires_confirmation;
}

// List of agents that support auto-start
export const AUTO_START_AGENTS = Object.values(AGENT_DISPATCH_CONFIG)
  .filter(c => c.auto_start)
  .map(c => ({ id: c.id, name: c.name }));
