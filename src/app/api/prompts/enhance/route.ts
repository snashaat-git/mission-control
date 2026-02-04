// API endpoint for AI-powered prompt enhancement
// Analyzes prompts and suggests improvements

import { NextRequest, NextResponse } from 'next/server';

interface PromptAnalysis {
  clarity_score: number; // 0-100
  structure_score: number;
  completeness_score: number;
  variable_usage: {
    variables: string[];
    undefined_vars: string[];
    suggestions: string[];
  };
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  enhanced_version?: string;
}

// Analyze prompt without AI (fast, local)
function analyzePromptLocally(title: string, content: string): PromptAnalysis {
  const analysis: PromptAnalysis = {
    clarity_score: 70,
    structure_score: 70,
    completeness_score: 70,
    variable_usage: {
      variables: [],
      undefined_vars: [],
      suggestions: [],
    },
    strengths: [],
    weaknesses: [],
    suggestions: [],
  };

  // Extract variables
  const varRegex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;
  while ((match = varRegex.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  analysis.variable_usage.variables = variables;

  // Check for common issues
  
  // Strengths
  if (content.includes('**') || content.includes('##')) {
    analysis.strengths.push('Uses markdown formatting for structure');
    analysis.structure_score += 10;
  }
  if (variables.length > 0) {
    analysis.strengths.push(`Uses ${variables.length} dynamic variable(s) for flexibility`);
    analysis.clarity_score += 5;
  }
  if (content.toLowerCase().includes('output') || content.toLowerCase().includes('deliverable')) {
    analysis.strengths.push('Specifies expected output/deliverables');
    analysis.completeness_score += 10;
  }
  if (content.length > 500) {
    analysis.strengths.push('Detailed and comprehensive');
    analysis.completeness_score += 5;
  }
  if (content.toLowerCase().includes('example') || content.includes('```')) {
    analysis.strengths.push('Includes examples or code snippets');
    analysis.clarity_score += 10;
  }

  // Weaknesses
  if (!content.includes('**') && !content.includes('- ') && !content.includes('##')) {
    analysis.weaknesses.push('Lacks structural formatting (consider using markdown headers, bullet points)');
    analysis.structure_score -= 15;
  }
  if (content.length < 200) {
    analysis.weaknesses.push('Very brief - may lack sufficient detail');
    analysis.completeness_score -= 20;
  }
  if (!content.toLowerCase().includes('output') && !content.toLowerCase().includes('deliverable') && !content.toLowerCase().includes('result')) {
    analysis.weaknesses.push('Does not specify expected output or deliverables');
    analysis.completeness_score -= 15;
  }
  if (variables.length === 0 && content.length > 100) {
    analysis.weaknesses.push('Could use variables ({{variable}}) for reusable templates');
    analysis.variable_usage.suggestions.push('Add variables like {{project_name}}, {{topic}}, {{output_dir}}');
  }
  if (!content.toLowerCase().includes('step') && !content.match(/\d\./)) {
    analysis.weaknesses.push('No numbered steps - consider breaking into actionable items');
  }

  // Suggestions
  if (analysis.structure_score < 80) {
    analysis.suggestions.push('Add markdown headers (## Section) to organize content');
  }
  if (analysis.completeness_score < 80) {
    analysis.suggestions.push('Include specific deliverables and success criteria');
  }
  if (analysis.clarity_score < 80) {
    analysis.suggestions.push('Add concrete examples to clarify expectations');
  }
  if (variables.length > 0) {
    analysis.suggestions.push('Document all variables in a "Variables" section');
  }

  // Cap scores
  analysis.clarity_score = Math.min(100, Math.max(0, analysis.clarity_score));
  analysis.structure_score = Math.min(100, Math.max(0, analysis.structure_score));
  analysis.completeness_score = Math.min(100, Math.max(0, analysis.completeness_score));

  return analysis;
}

// Generate enhanced version of prompt
function generateEnhancedPrompt(title: string, content: string, analysis: PromptAnalysis): string {
  let enhanced = content;
  
  // Add structure if missing
  if (analysis.structure_score < 70 && !content.includes('##')) {
    enhanced = `## Overview\n${enhanced}\n\n## Deliverables\n- [ ] Main deliverable here\n- [ ] Additional outputs as needed\n\n## Notes\nAdd any additional context or constraints here.`;
  }

  // Add output section if missing
  if (analysis.completeness_score < 70 && !content.toLowerCase().includes('output')) {
    enhanced += '\n\n**Expected Output:** Specify what files, format, or results are expected.';
  }

  // Add variable documentation if variables exist
  if (analysis.variable_usage.variables.length > 0 && !content.toLowerCase().includes('variables')) {
    const varList = analysis.variable_usage.variables.map(v => `- {{${v}}}: description here`).join('\n');
    enhanced += `\n\n## Variables\n${varList}`;
  }

  return enhanced;
}

// POST /api/prompts/enhance - Analyze and enhance a prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, mode = 'analyze' } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      );
    }

    // Analyze the prompt
    const analysis = analyzePromptLocally(title, content);

    // Generate enhanced version if requested
    if (mode === 'enhance') {
      analysis.enhanced_version = generateEnhancedPrompt(title, content, analysis);
    }

    return NextResponse.json({
      title,
      original_content: content,
      analysis,
      mode,
    });

  } catch (error) {
    console.error('Error enhancing prompt:', error);
    return NextResponse.json(
      { error: 'Failed to analyze prompt', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/prompts/enhance/templates - Get common improvement patterns
export async function GET() {
  const templates = {
    structure_patterns: [
      {
        name: 'Standard Task Template',
        pattern: '## Goal\n{{goal}}\n\n## Requirements\n- Requirement 1\n- Requirement 2\n\n## Deliverables\n- [ ] Deliverable 1\n\n## Output\nSave to: {{output_dir}}',
      },
      {
        name: 'Research Template',
        pattern: 'Research {{topic}} and provide:\n\n1. **Summary** (200 words)\n2. **Key Findings** (bullet points)\n3. **Sources** (links/refs)\n4. **Recommendations**\n\nOutput: {{output_file}}',
      },
      {
        name: 'Code/Task Template',
        pattern: 'Create {{deliverable}} with the following:\n\n**Features:**\n- Feature 1\n- Feature 2\n\n**Tech Stack:**\n- {{tech_1}}\n- {{tech_2}}\n\n**Acceptance Criteria:**\n- [ ] Criterion 1\n\nOutput: {{output_path}}',
      },
    ],
    variable_naming: {
      good_examples: ['{{project_name}}', '{{output_dir}}', '{{company_name}}', '{{topic}}'],
      bad_examples: ['{{x}}', '{{var1}}', '{{thing}}', '{{stuff}}'],
      tips: [
        'Use descriptive names: {{company_name}} not {{name}}',
        'Use snake_case consistently',
        'Include units in names: {{word_count}} not {{count}}',
        'Group related vars: {{primary_color}}, {{secondary_color}}',
      ],
    },
    best_practices: [
      'Start with the goal or objective',
      'Use markdown headers (##) for sections',
      'Include specific deliverables with checkboxes',
      'Specify output location with {{output_dir}}',
      'Provide examples in code blocks',
      'List all variables used at the bottom',
      'Keep prompts under 1000 words for clarity',
      'Use action verbs: "Create", "Build", "Research", not "Do"',
    ],
  };

  return NextResponse.json(templates);
}
