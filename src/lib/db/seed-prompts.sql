-- Default System Prompts for Mission Control
-- Run this after database initialization to populate prompts

-- Research Agent Prompts
INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-research-001', 
 'Market Research Report',
 'Research the {{topic}} market and create a comprehensive report including:

**Deliverables:**
1. Executive Summary (200-300 words)
2. Market Size & Growth Statistics
3. Key Players & Competitors (top 5-10)
4. Trends & Opportunities
5. Challenges & Risks
6. Data Sources & References

**Format:** Markdown with tables for data comparison
**Output:** Save as {{topic}}-market-research.md in the research folder',
 'Comprehensive market research template with structured analysis sections',
 'research',
 NULL,
 '["research", "market", "analysis", "report"]',
 '["topic"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-research-002',
 'Competitor Analysis',
 'Analyze {{competitor_name}} ({{competitor_url}}) and create a detailed comparison report:

**Research Areas:**
1. Products/Services Overview
2. Pricing Strategy
3. Target Audience
4. Marketing Channels
5. Strengths & Weaknesses
6. Unique Value Propositions
7. Customer Reviews Summary

**Include:**
- Screenshots (optional, describe key pages)
- Feature comparison table
- SWOT analysis

**Output:** {{competitor_name}}-analysis.md',
 'Deep dive competitor analysis with structured comparison framework',
 'research',
 NULL,
 '["research", "competitor", "analysis", "swot"]',
 '["competitor_name", "competitor_url"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-research-003',
 'Product Research on Amazon/eCommerce',
 'Find {{product_type}} on {{marketplace}} and create a comparison report:

**Search Criteria:**
- Price range: {{price_range}}
- Minimum rating: {{min_rating}}
- Key features needed: {{features}}

**For Each Product Found:**
1. Product Name & Brand
2. Price (with any discounts noted)
3. Rating & Review Count
4. Key Specifications
5. Pros from reviews
6. Cons from reviews
7. Product Link

**Deliverables:**
- Top 5-10 products comparison table
- Summary recommendation
- Price comparison chart

**Output:** {{product_type}}-comparison.md',
 'E-commerce product research template for competitive shopping analysis',
 'research',
 NULL,
 '["research", "ecommerce", "products", "comparison"]',
 '["product_type", "marketplace", "price_range", "min_rating", "features"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

-- Web Developer Prompts
INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-web-001',
 'Modern Landing Page',
 'Create a responsive landing page for {{company_name}} with the following specifications:

**Sections Required:**
1. **Hero Section**
   - Compelling headline (H1)
   - Subheadline with value proposition
   - CTA button (primary action)
   - Background: {{hero_style}} (gradient/image/pattern)

2. **Features/Benefits Section** (3-6 cards)
   - Icons from Lucide or FontAwesome
   - Short descriptions (50-100 words each)
   - Grid layout (responsive: 1col mobile, 3col desktop)

3. **About/Social Proof Section**
   - Brief company description
   - Testimonials or stats (if available)

4. **CTA Section**
   - Secondary call-to-action
   - Contact form or button

5. **Footer**
   - Links, social icons, copyright

**Tech Stack:**
- Semantic HTML5
- CSS Grid + Flexbox
- Mobile-first responsive design
- vanilla JS for interactions (smooth scroll, mobile menu)

**Design Requirements:**
- Color scheme: {{color_scheme}}
- Typography: Clean, readable (Google Fonts or system fonts)
- Spacing: Generous whitespace
- Accessibility: WCAG AA compliant (contrast, keyboard nav, alt text)

**Deliverables:**
- index.html
- styles.css
- script.js
- README.md with setup instructions

**Output Directory:** {{output_dir}}',
 'Complete landing page template with modern design best practices',
 'web-development',
 NULL,
 '["landing", "web", "frontend", "responsive"]',
 '["company_name", "hero_style", "color_scheme", "output_dir"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-web-002',
 'Dashboard UI Component',
 'Build a responsive dashboard component for {{dashboard_name}}:

**Components Needed:**
1. **Navigation Sidebar**
   - Collapsible on mobile
   - Icons + labels
   - Active state highlighting

2. **Header/Top Bar**
   - Search bar
   - User profile dropdown
   - Notifications bell

3. **Main Content Area**
   - Stats Cards (4-6 metrics)
   - Data Table with sorting
   - Chart/Graph placeholder (Chart.js compatible)

4. **Responsive Behavior**
   - Mobile: Stack layout, hamburger menu
   - Tablet: 2-column grid
   - Desktop: Full sidebar, multi-column

**Styling:**
- CSS Variables for theming
- Light/Dark mode toggle (optional)
- Smooth transitions
- Loading states

**Tech Stack:**
- HTML5 semantic structure
- CSS Grid & Flexbox
- Optional: Tailwind CSS classes commented

**Output:**
- dashboard.html
- dashboard.css
- dashboard.js
- Place in: {{output_dir}}',
 'Full dashboard UI with navigation, stats, and data table components',
 'web-development',
 NULL,
 '["dashboard", "ui", "components", "responsive"]',
 '["dashboard_name", "output_dir"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-web-003',
 'Form with Validation',
 'Create a complete {{form_type}} form with client-side validation:

**Form Fields:**
{{#if contact_form}}
- Full Name (required, min 2 chars)
- Email (required, valid format)
- Subject (dropdown or text)
- Message (textarea, min 20 chars)
- Submit button
{{/if}}
{{#if signup_form}}
- Username (required, alphanumeric, min 3 chars)
- Email (required, valid format)
- Password (required, min 8 chars, complexity indicator)
- Confirm Password (match validation)
- Terms checkbox (required)
- Submit button
{{/if}}
{{#if custom_fields}}
{{custom_fields}}
{{/if}}

**Validation Features:**
- Real-time validation on blur
- Error messages per field
- Success states
- Prevent submission until valid
- Visual feedback (icons, colors)

**UX Enhancements:**
- Loading state during submit
- Success message after submit
- Accessible labels and ARIA attributes
- Keyboard navigation support

**Styling:**
- Clean, modern design
- Responsive (works on mobile)
- Error: red borders + icon
- Success: green checkmarks

**Files:**
- form.html
- form.css
- form.js (validation logic)

**Output:** {{output_dir}}/{{form_name}}-form/',
 'Complete form template with validation, accessibility, and UX polish',
 'web-development',
 NULL,
 '["form", "validation", "ui", "frontend"]',
 '["form_type", "form_name", "output_dir"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

-- Writer/Content Prompts
INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-write-001',
 'Technical Documentation',
 'Write comprehensive technical documentation for {{topic}}:

**Document Structure:**
1. **Overview**
   - What is {{topic}}?
   - Why it matters
   - Use cases

2. **Getting Started**
   - Prerequisites
   - Installation/setup steps
   - Quick start example

3. **Core Concepts**
   - Key terms explained
   - Architecture overview
   - Workflow diagram (ASCII or description)

4. **Usage Guide**
   - Common use cases
   - Code examples
   - Configuration options

5. **API Reference** (if applicable)
   - Endpoints/methods
   - Parameters
   - Response formats

6. **Troubleshooting**
   - Common issues
   - Solutions
   - FAQ

**Writing Style:**
- Clear, concise language
- Code examples in {{language}}
- Step-by-step instructions
- Screenshots/descriptions where helpful

**Deliverable:** {{topic}}-documentation.md',
 'Full technical documentation template with structured sections',
 'documentation',
 NULL,
 '["docs", "technical", "writing", "guide"]',
 '["topic", "language"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-write-002',
 'Blog Post / Article',
 'Write a {{tone}} blog post about {{topic}}:

**Article Structure:**
1. **Catchy Headline** (SEO-friendly, under 60 chars)
2. **Introduction** (Hook the reader, 100-150 words)
3. **Main Content** (3-5 sections with H2/H3 subheadings)
   - {{point_1}}
   - {{point_2}}
   - {{point_3}}
4. **Examples/Case Studies** (1-2 concrete examples)
5. **Conclusion** (Key takeaways, 100 words)
6. **Call to Action** (What should reader do next?)

**SEO Requirements:**
- Meta description (150-160 chars)
- Focus keyword: {{keyword}}
- Internal linking suggestions
- Image alt text suggestions

**Tone:** {{tone}} (professional/casual/technical/persuasive)
**Length:** {{word_count}} words
**Audience:** {{audience}}

**Output:** {{topic}}-blog-post.md',
 'Blog post template with SEO optimization and structured storytelling',
 'writing',
 NULL,
 '["blog", "content", "writing", "seo"]',
 '["topic", "tone", "point_1", "point_2", "point_3", "keyword", "word_count", "audience"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-write-003',
 'Product Description',
 'Write compelling product descriptions for {{product_name}}:

**Required Variations:**
1. **Short Version** (50 words)
   - Perfect for listings/cards
   - Hook + key benefit

2. **Medium Version** (150 words)
   - For product pages
   - Problem → Solution → Benefit flow

3. **Long Version** (300+ words)
   - Full product page copy
   - Storytelling + features + benefits + social proof

**Key Elements to Include:**
- Primary benefit: {{primary_benefit}}
- Key features: {{features}}
- Target audience: {{target_audience}}
- Differentiator: {{unique_selling_point}}

**Tone:** {{tone}} (professional/friendly/luxury/playful)

**Output:** {{product_name}}-descriptions.md',
 'Product copy template with multiple length variations for different contexts',
 'writing',
 NULL,
 '["product", "copywriting", "marketing", "ecommerce"]',
 '["product_name", "primary_benefit", "features", "target_audience", "unique_selling_point", "tone"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

-- Bug Fix / Developer Prompts
INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-bug-001',
 'Debug and Fix Issue',
 'Investigate and fix the following bug:

**Bug Description:**
{{bug_description}}

**Environment:**
- Browser/OS: {{environment}}
- Reproduction steps: {{steps}}
- Error message: {{error_message}}

**Expected Behavior:**
{{expected_behavior}}

**Actual Behavior:**
{{actual_behavior}}

**Code Context:**
```
{{code_snippet}}
```

**Tasks:**
1. Analyze the root cause
2. Provide the minimal fix
3. Explain why the fix works
4. Test the solution mentally
5. Suggest prevention (how to avoid similar bugs)

**Output Format:**
- Root Cause Analysis
- Solution Code
- Explanation
- Prevention Tips',
 'Structured bug investigation and fix template with root cause analysis',
 'debugging',
 NULL,
 '["bug", "debug", "fix", "troubleshoot"]',
 '["bug_description", "environment", "steps", "error_message", "expected_behavior", "actual_behavior", "code_snippet"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

-- System/General Prompts
INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-system-001',
 'Task Breakdown Planner',
 'Break down the following project into actionable subtasks:

**Project Goal:**
{{project_goal}}

**Context:**
- Timeline: {{timeline}}
- Resources: {{resources}}
- Constraints: {{constraints}}

**Deliver Subtasks:**
1. List each subtask with:
   - Clear title
   - Acceptance criteria (what "done" looks like)
   - Estimated time
   - Dependencies (what needs to happen first)
   - Assigned role (if applicable)

2. Organize by phase:
   - Phase 1: Setup/Foundation
   - Phase 2: Core Implementation
   - Phase 3: Polish/Review
   - Phase 4: Delivery

3. Identify:
   - Critical path (what could delay everything)
   - Risk mitigation strategies
   - Success metrics

**Format:** Markdown checklist suitable for importing into task management system',
 'Project planning template for breaking complex work into manageable subtasks',
 'planning',
 NULL,
 '["planning", "project", "breakdown", "management"]',
 '["project_goal", "timeline", "resources", "constraints"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, usage_count, created_at, updated_at) VALUES
('prompt-system-002',
 'Code Review Checklist',
 'Perform a thorough code review of {{code_type}}:

**Code to Review:**
```
{{code_to_review}}
```

**Checklist:**
- [ ] **Correctness:** Does it solve the stated problem?
- [ ] **Edge Cases:** Handles null/empty/error cases?
- [ ] **Performance:** Any obvious inefficiencies?
- [ ] **Readability:** Clear variable names and structure?
- [ ] **Comments:** Explains *why* not *what*?
- [ ] **Tests:** Adequate test coverage?
- [ ] **Security:** Any injection/risk issues?
- [ ] **Standards:** Follows language conventions?

**For Each Issue Found:**
- Severity: Critical/Major/Minor/Suggestion
- Location: Line numbers
- Description: What''s wrong
- Suggested Fix: Code snippet or approach

**Overall Assessment:**
- Approve / Approve with changes / Request changes
- Summary of main concerns
- Learning opportunities (if any)

**Output:** Structured code review report',
 'Comprehensive code review template with structured checklist and severity ratings',
 'code-review',
 NULL,
 '["review", "code", "quality", "checklist"]',
 '["code_type", "code_to_review"]',
 1,
 0,
 datetime('now'),
 datetime('now')
);

-- Summary
-- Total: 12 default prompts covering Research, Web Dev, Writing, Debugging, Planning
-- Categories: research, web-development, documentation, writing, debugging, planning, code-review
-- All prompts are templates (is_template=1) ready for variable substitution