// Voice command parser for Mission Control
// Parses natural language commands into actions

export type VoiceCommandType = 
  | 'create_task'
  | 'show_tasks'
  | 'show_inbox'
  | 'mark_done'
  | 'assign_task'
  | 'set_priority'
  | 'search_tasks'
  | 'show_analytics'
  | 'help'
  | 'unknown';

export interface ParsedVoiceCommand {
  type: VoiceCommandType;
  confidence: number;
  params: Record<string, any>;
  originalText: string;
}

// Command patterns for matching
const commandPatterns: { type: VoiceCommandType; patterns: RegExp[]; examples: string[] }[] = [
  {
    type: 'create_task',
    patterns: [
      /create\s+(?:a\s+)?(?:new\s+)?task/i,
      /add\s+(?:a\s+)?task/i,
      /make\s+(?:a\s+)?task/i,
      /new\s+task/i,
    ],
    examples: ['Create a new task', 'Add task', 'Make a task called Landing Page'],
  },
  {
    type: 'show_tasks',
    patterns: [
      /show\s+(?:my\s+)?tasks/i,
      /display\s+tasks/i,
      /view\s+tasks/i,
      /what\s+(?:are\s+)?(?:my\s+)?tasks/i,
      /list\s+tasks/i,
    ],
    examples: ['Show my tasks', 'What are my tasks', 'Display tasks'],
  },
  {
    type: 'show_inbox',
    patterns: [
      /show\s+(?:my\s+)?inbox/i,
      /what'?s?\s+in\s+(?:my\s+)?inbox/i,
      /check\s+(?:my\s+)?inbox/i,
      /inbox/i,
    ],
    examples: ['Show inbox', "What's in my inbox", 'Check inbox'],
  },
  {
    type: 'mark_done',
    patterns: [
      /mark\s+(?:task\s+)?(.+?)\s+(?:as\s+)?done/i,
      /complete\s+(?:task\s+)?(.+?)/i,
      /finish\s+(?:task\s+)?(.+?)/i,
      /done\s+with\s+(.+?)/i,
    ],
    examples: ['Mark task as done', 'Complete landing page', 'Finish the review'],
  },
  {
    type: 'assign_task',
    patterns: [
      /assign\s+(?:task\s+)?(.+?)\s+to\s+(.+)/i,
      /give\s+(.+?)\s+to\s+(.+)/i,
      /delegate\s+(.+?)\s+to\s+(.+)/i,
    ],
    examples: ['Assign task to Web Developer', 'Give landing page to Gravity Bridge'],
  },
  {
    type: 'set_priority',
    patterns: [
      /set\s+(?:priority\s+(?:of|for)\s+)?(.+?)\s+(?:to\s+)?(urgent|high|normal|low)/i,
      /make\s+(.+?)\s+(urgent|high priority)/i,
      /prioritize\s+(.+)/i,
    ],
    examples: ['Set task to urgent', 'Make landing page high priority', 'Prioritize this'],
  },
  {
    type: 'search_tasks',
    patterns: [
      /search\s+(?:for\s+)?(.+)/i,
      /find\s+(?:task\s+)?(.+)/i,
      /look\s+for\s+(.+)/i,
      /where\s+is\s+(.+)/i,
    ],
    examples: ['Search for landing page', 'Find the review task', 'Where is my task'],
  },
  {
    type: 'show_analytics',
    patterns: [
      /show\s+(?:me\s+)?analytics/i,
      /show\s+stats/i,
      /view\s+dashboard/i,
      /analytics/i,
      /metrics/i,
      /progress/i,
    ],
    examples: ['Show analytics', 'Show stats', 'View dashboard', 'Progress'],
  },
  {
    type: 'help',
    patterns: [
      /help/i,
      /what\s+can\s+you\s+do/i,
      /commands/i,
      /how\s+do\s+i/i,
    ],
    examples: ['Help', 'What can you do', 'Commands'],
  },
];

/**
 * Parse voice command text into structured command
 */
export function parseVoiceCommand(text: string): ParsedVoiceCommand {
  const normalizedText = text.toLowerCase().trim();
  
  // Try to match against patterns
  for (const { type, patterns } of commandPatterns) {
    for (const pattern of patterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        return {
          type,
          confidence: 0.9,
          params: extractParams(type, match, normalizedText),
          originalText: text,
        };
      }
    }
  }
  
  // Fuzzy matching for partial matches
  for (const { type, examples } of commandPatterns) {
    for (const example of examples) {
      const similarity = calculateSimilarity(normalizedText, example.toLowerCase());
      if (similarity > 0.7) {
        return {
          type,
          confidence: similarity,
          params: { fuzzy: true },
          originalText: text,
        };
      }
    }
  }
  
  // No match found
  return {
    type: 'unknown',
    confidence: 0,
    params: {},
    originalText: text,
  };
}

/**
 * Extract parameters from command match
 */
function extractParams(
  type: VoiceCommandType,
  match: RegExpMatchArray,
  fullText: string
): Record<string, any> {
  const params: Record<string, any> = {
    rawMatch: match[0],
    groups: match.slice(1),
  };
  
  switch (type) {
    case 'create_task':
      // Extract task title after "called", "named", or the rest of text
      const titleMatch = fullText.match(/(?:called|named)\s+(.+)|(?:task\s+(?:for|to)\s+)(.+)/i);
      if (titleMatch) {
        params.title = (titleMatch[1] || titleMatch[2]).trim();
      } else {
        // Use everything after the command as title
        const afterCommand = fullText.replace(/create\s+(?:a\s+)?(?:new\s+)?task|add\s+(?:a\s+)?task|make\s+(?:a\s+)?task|new\s+task/i, '').trim();
        if (afterCommand && afterCommand !== fullText) {
          params.title = afterCommand.replace(/^\s*(called|named|for|to)\s+/, '').trim();
        }
      }
      break;
      
    case 'mark_done':
      params.taskName = match[1]?.trim();
      break;
      
    case 'assign_task':
      params.taskName = match[1]?.trim();
      params.agentName = match[2]?.trim();
      break;
      
    case 'set_priority':
      params.taskName = match[1]?.trim();
      params.priority = match[2]?.toLowerCase();
      break;
      
    case 'search_tasks':
      params.query = match[1]?.trim();
      break;
  }
  
  return params;
}

/**
 * Calculate string similarity (simple Levenshtein-based)
 */
function calculateSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(s1: string, s2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      const cost = s2[i - 1] === s1[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[s2.length][s1.length];
}

/**
 * Execute parsed command and return action result
 */
export async function executeVoiceCommand(
  command: ParsedVoiceCommand,
  context: { userId?: string; currentTaskId?: string }
): Promise<{ success: boolean; message: string; action?: string; data?: any }> {
  const { type, params } = command;
  
  switch (type) {
    case 'create_task':
      return {
        success: true,
        message: `Creating task: ${params.title || 'New Task'}`,
        action: 'CREATE_TASK',
        data: { title: params.title || 'New Task' },
      };
      
    case 'show_tasks':
      return {
        success: true,
        message: 'Showing all tasks',
        action: 'SHOW_TASKS',
      };
      
    case 'show_inbox':
      return {
        success: true,
        message: 'Showing inbox',
        action: 'SHOW_INBOX',
      };
      
    case 'mark_done':
      return {
        success: true,
        message: `Marking "${params.taskName || 'task'}" as done`,
        action: 'MARK_DONE',
        data: { taskName: params.taskName },
      };
      
    case 'assign_task':
      return {
        success: true,
        message: `Assigning "${params.taskName || 'task'}" to ${params.agentName || 'agent'}`,
        action: 'ASSIGN_TASK',
        data: { taskName: params.taskName, agentName: params.agentName },
      };
      
    case 'set_priority':
      return {
        success: true,
        message: `Setting priority to ${params.priority}`,
        action: 'SET_PRIORITY',
        data: { priority: params.priority },
      };
      
    case 'search_tasks':
      return {
        success: true,
        message: `Searching for "${params.query}"`,
        action: 'SEARCH',
        data: { query: params.query },
      };
      
    case 'show_analytics':
      return {
        success: true,
        message: 'Opening analytics dashboard',
        action: 'SHOW_ANALYTICS',
      };
      
    case 'help':
      return {
        success: true,
        message: 'Available commands: Create task, Show tasks, Show inbox, Mark done, Assign task, Set priority, Search, Analytics, Help',
        action: 'SHOW_HELP',
      };
      
    case 'unknown':
    default:
      return {
        success: false,
        message: "I didn't understand that. Try: 'Create task', 'Show inbox', or 'Mark done'.",
        action: 'UNKNOWN',
      };
  }
}

/**
 * Get available voice commands with examples
 */
export function getVoiceCommandsHelp(): { command: string; description: string; examples: string[] }[] {
  return commandPatterns.map(({ type, examples }) => ({
    command: type.replace(/_/g, ' '),
    description: getCommandDescription(type),
    examples,
  }));
}

function getCommandDescription(type: VoiceCommandType): string {
  const descriptions: Record<VoiceCommandType, string> = {
    create_task: 'Create a new task',
    show_tasks: 'Display all tasks',
    show_inbox: 'Show tasks in inbox',
    mark_done: 'Mark a task as complete',
    assign_task: 'Assign a task to an agent',
    set_priority: 'Change task priority',
    search_tasks: 'Search for tasks',
    show_analytics: 'View analytics dashboard',
    help: 'Show available commands',
    unknown: 'Unknown command',
  };
  return descriptions[type] || 'Unknown command';
}
