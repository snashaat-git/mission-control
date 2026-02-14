// Core types for Mission Control

export type AgentStatus = 'standby' | 'working' | 'offline';

export type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'testing' | 'review' | 'done' | 'failed';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type MessageType = 'text' | 'system' | 'task_update' | 'file';

export type ConversationType = 'direct' | 'group' | 'task';

export type EventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_completed'
  | 'task_failed'
  | 'task_retried'
  | 'message_sent'
  | 'agent_status_changed'
  | 'agent_joined'
  | 'system';

export interface Agent {
  id: string;
  name: string;
  role: string;
  description?: string;
  avatar_emoji: string;
  status: AgentStatus;
  is_master: boolean;
  session_key?: string;
  model?: string;  // OpenClaw model override for this agent
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_agent_id?: string;
  created_by_agent_id?: string;
  business_id: string;
  due_date?: string;
  output_dir?: string;
  retry_count?: number;
  max_retries?: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  assigned_agent?: Agent;
  created_by_agent?: Agent;
  // Dependency metadata (populated by API)
  dependency_count?: number;
  blocking_count?: number;
  is_blocked?: boolean;
}

export interface TaskDependency {
  task_id: string;
  dependency_id: string;
  created_at: string;
  // Joined fields
  dependency_title?: string;
  dependency_status?: TaskStatus;
  dependent_title?: string;
  dependent_status?: TaskStatus;
}

export interface Conversation {
  id: string;
  title?: string;
  type: ConversationType;
  task_id?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  participants?: Agent[];
  last_message?: Message;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_agent_id?: string;
  content: string;
  message_type: MessageType;
  metadata?: string;
  created_at: string;
  // Joined fields
  sender?: Agent;
}

export interface Event {
  id: string;
  type: EventType;
  agent_id?: string;
  task_id?: string;
  message: string;
  metadata?: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
  task?: Task;
}

export interface Business {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface OpenClawSession {
  id: string;
  agent_id: string;
  openclaw_session_id: string;
  channel?: string;
  status: string;
  session_type: 'persistent' | 'subagent';
  task_id?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

export type ActivityType = 'spawned' | 'updated' | 'completed' | 'file_created' | 'status_changed' | 'failed' | 'retried' | 'timeout';

export interface TaskActivity {
  id: string;
  task_id: string;
  agent_id?: string;
  activity_type: ActivityType;
  message: string;
  metadata?: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
}

export type DeliverableType = 'file' | 'url' | 'artifact';

export interface TaskDeliverable {
  id: string;
  task_id: string;
  deliverable_type: DeliverableType;
  title: string;
  path?: string;
  description?: string;
  created_at: string;
}

// API request/response types
export interface CreateAgentRequest {
  name: string;
  role: string;
  description?: string;
  avatar_emoji?: string;
  is_master?: boolean;
  session_key?: string;
  model?: string;
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
}

export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  status?: AgentStatus;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigned_agent_id?: string;
  created_by_agent_id?: string;
  business_id?: string;
  due_date?: string;
  output_dir?: string;
}

export interface UpdateTaskRequest extends Partial<CreateTaskRequest> {
  status?: TaskStatus;
}

export interface SendMessageRequest {
  conversation_id: string;
  sender_agent_id: string;
  content: string;
  message_type?: MessageType;
  metadata?: string;
}

// OpenClaw WebSocket message types
export interface OpenClawMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface OpenClawSessionInfo {
  id: string;
  channel: string;
  peer?: string;
  model?: string;
  status: string;
}

// OpenClaw history message format (from Gateway)
export interface OpenClawHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// Agent with OpenClaw session info (extended for UI use)
export interface AgentWithOpenClaw extends Agent {
  openclawSession?: OpenClawSession | null;
}

// Real-time SSE event types
export type SSEEventType =
  | 'task_updated'
  | 'task_created'
  | 'task_deleted'
  | 'task_failed'
  | 'activity_logged'
  | 'deliverable_added'
  | 'agent_spawned'
  | 'agent_completed'
  | 'dependency_changed'
  | 'call_started'
  | 'call_ended'
  | 'call_failed';

export interface SSEEvent {
  type: SSEEventType;
  payload: Task | TaskActivity | TaskDeliverable | {
    taskId: string;
    sessionId: string;
    agentName?: string;
    summary?: string;
    deleted?: boolean;
  } | {
    id: string;  // For task_deleted events
  } | {
    taskId?: string;
    dependencyId?: string;
    workflowId?: string;
    unblocked?: boolean;
  };
}

// Prompt Library types
export interface Prompt {
  id: string;
  title: string;
  content: string;
  description?: string;
  category: string;
  agent_id?: string;
  tags?: string[];
  variables?: string[];
  is_template: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  agent_name?: string;
  agent_emoji?: string;
}

// Voice call types
export type CallStatus = 'initiating' | 'active' | 'ended' | 'failed';
export type CallDirection = 'inbound' | 'outbound';

export interface VoiceCall {
  id: string;
  agent_id?: string;
  session_key: string;
  call_id: string;
  phone_number: string;
  direction: CallDirection;
  status: CallStatus;
  duration_seconds: number;
  transcript?: string;
  summary?: string;
  created_at: string;
  ended_at?: string;
  // Joined fields
  agent_name?: string;
  agent_emoji?: string;
}

export interface InitiateCallRequest {
  agentId?: string;
  phoneNumber: string;
  message: string;
}

export interface ContinueCallRequest {
  message: string;
}

// Note: Antigravity Bridge integration removed
// Was planned but not feasible due to desktop app limitations
