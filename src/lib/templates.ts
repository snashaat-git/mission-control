/**
 * Task Templates
 * Pre-defined task configurations for quick creation
 */

import type { TaskPriority, TaskStatus } from './types';

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaults: {
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    assigned_agent_id?: string;
    output_dir?: string;
    suggested_due_hours?: number;
  };
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'Create a responsive landing page with modern design',
    icon: '🌐',
    defaults: {
      title: 'Landing Page for [Project Name]',
      description: 'Design and build a modern, responsive landing page with:\n- Hero section with compelling headline\n- Features/benefits section\n- Call-to-action buttons\n- Footer with contact info\n\nTech stack: HTML, CSS, vanilla JS (or specify framework)\nDesign: Clean, professional, mobile-first',
      priority: 'high',
      status: 'inbox',
      output_dir: '~/openclaw/workspace/projects/landing-[name]',
      suggested_due_hours: 24,
    },
  },
  {
    id: 'research',
    name: 'Research Task',
    description: 'Research and compile findings into a report',
    icon: '🔍',
    defaults: {
      title: 'Research: [Topic]',
      description: 'Research the following topic and create a comprehensive report:\n\n**Research Questions:**\n- [Question 1]\n- [Question 2]\n\n**Deliverables:**\n- Markdown report with findings\n- Summary of key insights\n- Sources/links referenced\n\n**Output format:** [Specify: markdown/doc/table]',
      priority: 'normal',
      status: 'inbox',
      output_dir: '~/openclaw/workspace/research/[topic]',
      suggested_due_hours: 12,
    },
  },
  {
    id: 'bug-fix',
    name: 'Bug Fix',
    description: 'Fix a bug or resolve an issue',
    icon: '🐛',
    defaults: {
      title: 'Fix: [Bug Description]',
      description: '**Bug Description:**\n[Describe the bug]\n\n**Steps to Reproduce:**\n1. [Step 1]\n2. [Step 2]\n\n**Expected Behavior:**\n[What should happen]\n\n**Actual Behavior:**\n[What actually happens]\n\n**Additional Context:**\n- Error messages:\n- Related files:\n- Environment:',
      priority: 'urgent',
      status: 'inbox',
      suggested_due_hours: 4,
    },
  },
  {
    id: 'documentation',
    name: 'Documentation',
    description: 'Write or update documentation',
    icon: '📚',
    defaults: {
      title: 'Documentation: [Topic]',
      description: 'Create comprehensive documentation for:\n\n**Scope:**\n- [Feature/component/system]\n\n**Sections to include:**\n- Overview/purpose\n- Setup/installation\n- Usage examples\n- API reference (if applicable)\n- Troubleshooting\n\n**Target Audience:** [Developers/Users/Maintainers]\n**Format:** Markdown',
      priority: 'normal',
      status: 'inbox',
      output_dir: '~/openclaw/workspace/docs/[topic]',
      suggested_due_hours: 16,
    },
  },
  {
    id: 'api-integration',
    name: 'API Integration',
    description: 'Integrate with a third-party API',
    icon: '🔌',
    defaults: {
      title: 'API Integration: [Service Name]',
      description: 'Integrate with the [Service] API to enable:\n\n**Features:**\n- [Feature 1]\n- [Feature 2]\n\n**API Documentation:** [URL or attach docs]\n\n**Authentication:** [API key/OAuth/token]\n\n**Deliverables:**\n- Working integration code\n- Error handling\n- Documentation of endpoints used',
      priority: 'high',
      status: 'inbox',
      suggested_due_hours: 20,
    },
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Analyze data and create visualizations or reports',
    icon: '📊',
    defaults: {
      title: 'Data Analysis: [Dataset/Question]',
      description: 'Analyze the following data to answer: [Question]\n\n**Data Source:**\n- [File path/URL/Database]\n\n**Analysis Goals:**\n- [Goal 1]\n- [Goal 2]\n\n**Deliverables:**\n- Analysis script/notebook\n- Visualizations (charts/graphs)\n- Written insights/findings\n- Cleaned dataset (if applicable)',
      priority: 'normal',
      status: 'inbox',
      output_dir: '~/openclaw/workspace/analysis/[name]',
      suggested_due_hours: 16,
    },
  },
  {
    id: 'trading-morning-routine',
    name: 'Trading Morning Routine',
    description: 'Pre-London session market prep for XAUUSD & FDAX1!',
    icon: '📈',
    defaults: {
      title: 'Trading Routine: London Session Prep [Date]',
      description: '🏆 **TradingView Leap Competition** | **London Session: 10:00 AM Cairo**\n\n**Pairs:** XAUUSD (Gold), FDAX1! (DAX Futures)\n\n---\n\n## Pre-Session Checklist:\n\n### 1️⃣ Overnight Market Scan\n- [ ] XAUUSD: Check overnight range (Asia session high/low)\n- [ ] FDAX1!: Note pre-market levels, overnight gap\n- [ ] DXY (Dollar Index): Direction bias for XAUUSD\n\n### 2️⃣ Economic Calendar (Today)\n- [ ] Check ForexFactory/calendar for high-impact news\n- [ ] Note EUR/USD/GBP news times (affects DAX & Gold)\n- [ ] Mark times to AVOID trading (news spikes)\n\n### 3️⃣ Key Technical Levels\n**XAUUSD:**\n- Daily Pivot: ___\n- Support: ___ / ___ / ___\n- Resistance: ___ / ___ / ___\n- Overnight High/Low: ___ / ___\n\n**FDAX1!:**\n- Pre-market open: ___\n- Key levels: ___ / ___ / ___\n- Range expectation: ___\n\n### 4️⃣ Sentiment & News\n- [ ] Scan XAUUSD news (geopolitical, rates, USD)\n- [ ] Check DAX/Eurozone headlines\n- [ ] Check Twitter/X #XAUUSD #DAX sentiment\n\n---\n\n**Session Notes:**\n- Mood: ___\n- Bias: Bullish / Bearish / Neutral\n- Key setups watching: ___\n',
      priority: 'high',
      status: 'inbox',
      output_dir: '~/openclaw/workspace/trading/routines/[date]',
      suggested_due_hours: 2,
    },
  },
];

export function getTemplateById(id: string): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.id === id);
}

// --- Workflow Templates (multi-step task chains with dependencies) ---

export interface WorkflowStep {
  stepLabel: string;
  defaults: TaskTemplate['defaults'];
  dependsOnSteps: number[]; // indices of prior steps this step depends on
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: WorkflowStep[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'research-write-review',
    name: 'Research → Write → Review',
    description: 'Research a topic, write content, then review and polish',
    icon: '📝',
    steps: [
      {
        stepLabel: 'Research',
        defaults: {
          title: 'Research: [Topic]',
          description: 'Research [Topic] and compile key findings, sources, and data points.\n\n**Deliverables:** Markdown notes with sources.',
          priority: 'normal',
          status: 'inbox',
          suggested_due_hours: 8,
        },
        dependsOnSteps: [],
      },
      {
        stepLabel: 'Write',
        defaults: {
          title: 'Write: [Topic]',
          description: 'Using the research findings, write a comprehensive document on [Topic].\n\n**Deliverables:** Draft document in Markdown.',
          priority: 'normal',
          status: 'inbox',
          suggested_due_hours: 12,
        },
        dependsOnSteps: [0],
      },
      {
        stepLabel: 'Review',
        defaults: {
          title: 'Review: [Topic]',
          description: 'Review and polish the written document on [Topic]. Check for accuracy, clarity, and completeness.\n\n**Deliverables:** Final reviewed document.',
          priority: 'normal',
          status: 'inbox',
          suggested_due_hours: 4,
        },
        dependsOnSteps: [1],
      },
    ],
  },
  {
    id: 'design-develop-test',
    name: 'Design → Develop → Test',
    description: 'Design a feature, build it, then test it',
    icon: '🛠️',
    steps: [
      {
        stepLabel: 'Design',
        defaults: {
          title: 'Design: [Feature]',
          description: 'Create a technical design for [Feature]. Define requirements, architecture, and UI mockups if applicable.\n\n**Deliverables:** Design document / wireframes.',
          priority: 'high',
          status: 'inbox',
          suggested_due_hours: 8,
        },
        dependsOnSteps: [],
      },
      {
        stepLabel: 'Develop',
        defaults: {
          title: 'Develop: [Feature]',
          description: 'Implement [Feature] based on the design document. Write clean, well-structured code.\n\n**Deliverables:** Working implementation with code.',
          priority: 'high',
          status: 'inbox',
          suggested_due_hours: 24,
        },
        dependsOnSteps: [0],
      },
      {
        stepLabel: 'Test',
        defaults: {
          title: 'Test: [Feature]',
          description: 'Test [Feature] thoroughly. Write tests, check edge cases, and verify the implementation matches the design.\n\n**Deliverables:** Test results and bug report.',
          priority: 'high',
          status: 'inbox',
          suggested_due_hours: 8,
        },
        dependsOnSteps: [1],
      },
    ],
  },
  {
    id: 'full-project',
    name: 'Full Project Pipeline',
    description: 'Research + Design (parallel) → Develop → Test → Documentation',
    icon: '🚀',
    steps: [
      {
        stepLabel: 'Research',
        defaults: {
          title: 'Research: [Project]',
          description: 'Research requirements, existing solutions, and best practices for [Project].\n\n**Deliverables:** Research findings document.',
          priority: 'high',
          status: 'inbox',
          suggested_due_hours: 8,
        },
        dependsOnSteps: [],
      },
      {
        stepLabel: 'Design',
        defaults: {
          title: 'Design: [Project]',
          description: 'Create technical design and architecture for [Project].\n\n**Deliverables:** Design document with architecture diagrams.',
          priority: 'high',
          status: 'inbox',
          suggested_due_hours: 8,
        },
        dependsOnSteps: [],
      },
      {
        stepLabel: 'Develop',
        defaults: {
          title: 'Develop: [Project]',
          description: 'Build [Project] based on research and design outputs.\n\n**Deliverables:** Working implementation.',
          priority: 'high',
          status: 'inbox',
          suggested_due_hours: 32,
        },
        dependsOnSteps: [0, 1],
      },
      {
        stepLabel: 'Test',
        defaults: {
          title: 'Test: [Project]',
          description: 'Test [Project] end-to-end. Unit tests, integration tests, and manual QA.\n\n**Deliverables:** Test report.',
          priority: 'high',
          status: 'inbox',
          suggested_due_hours: 12,
        },
        dependsOnSteps: [2],
      },
      {
        stepLabel: 'Documentation',
        defaults: {
          title: 'Documentation: [Project]',
          description: 'Write comprehensive documentation for [Project]. Include setup, usage, API reference, and troubleshooting.\n\n**Deliverables:** Complete documentation.',
          priority: 'normal',
          status: 'inbox',
          suggested_due_hours: 8,
        },
        dependsOnSteps: [3],
      },
    ],
  },
];

export function getWorkflowById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((w) => w.id === id);
}

export function formatTemplateDefaults(
  template: TaskTemplate,
  replacements: Record<string, string> = {}
): TaskTemplate['defaults'] {
  let formatted = { ...template.defaults };

  // Replace placeholders like [Project Name] with actual values
  Object.entries(replacements).forEach(([key, value]) => {
    const placeholder = `[${key}]`;
    formatted.title = formatted.title.replace(placeholder, value);
    formatted.description = formatted.description.replaceAll(placeholder, value);
    if (formatted.output_dir) {
      formatted.output_dir = formatted.output_dir.replace(placeholder, value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }
  });

  // Auto-generate output_dir if not set
  if (!formatted.output_dir) {
    const safeName = formatted.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    formatted.output_dir = `~/openclaw/workspace/projects/${safeName}`;
  }

  return formatted;
}

export function calculateDueDate(hoursFromNow: number): string {
  const date = new Date();
  date.setHours(date.getHours() + hoursFromNow);
  return date.toISOString().slice(0, 16); // Format for datetime-local input
}
