import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

// ============================================================================
// INTERFACES & TYPES - Strict typing throughout
// ============================================================================

/** Model configuration for WebLLM */
export interface ModelConfig {
  readonly id: string;
  readonly name: string;
  readonly downloadSize: string;
  readonly ramRequired: string;
  readonly description: string;
}

/** Available model sizes */
export type ModelSize = "1.5B" | "3B";

export type NodeClass =
  | 'goal'
  | 'section'
  | 'subgoal'
  | 'task'
  | 'resource'
  | 'constraint'
  | 'metric'
  | 'idea';

/** Valid node types for React Flow rendering */
export type NodeType = 'expandable' | 'question' | 'checklist' | 'metric' | 'image' | 'decision' | 'tradeoff';

/** Parsed topic from AI response */
export interface ParsedTopic {
  name: string;
  description: string;
  preferredParent?: string;
  nodeClass: NodeClass;
  nodeType: NodeType;
}

/** Node structure for mind map */
export interface MindMapNode {
  id: string;
  label: string;
  description: string;
  nodeClass: NodeClass;
  nodeType?: NodeType; // Optional - defaults to 'expandable'
  items?: { id: string; text: string; completed: boolean }[];
  decisionOptions?: string[];
  chosenOption?: string;
  decisionConfidence?: number;
  tradeoffItems?: { id: string; label: string; impact: number; effort: number; risk: number; time: number }[];
}

/** Edge structure for mind map */
export interface MindMapEdge {
  source: string;
  target: string;
}

/** Parsed AI response structure */
export interface ParsedAIResponse {
  assistantResponse: string;
  updatedMindMap: {
    nodes: MindMapNode[];
    edges: MindMapEdge[];
  };
  suggestions: string[];
  redirectTo?: string;
  redirectReason?: string;
}

/** Chat message structure */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Planning context classification */
export type PlanningContext =
  | 'new_project'      // Fresh start - empathy questions
  | 'problem_solving'  // Problem stated - root cause analysis
  | 'decision_making'  // Choosing options - multi-perspective
  | 'brainstorming'    // Needs ideas - divergent thinking
  | 'refinement'       // Improving existing - SCAMPER
  | 'execution'        // Ready to act - journey/task breakdown
  | 'validation'       // Checking assumptions - iteration loops
  | 'general';         // Default

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

export const MODEL_OPTIONS: Record<ModelSize, ModelConfig> = {
  "1.5B": {
    id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    name: "Fast (1.5B)",
    downloadSize: "~900MB",
    ramRequired: "~2GB",
    description: "Faster loading, works on most devices"
  },
  "3B": {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    name: "Quality (3B)",
    downloadSize: "~1.8GB",
    ramRequired: "~4GB",
    description: "Better reasoning, requires more resources"
  }
};

let selectedModelId: string = MODEL_OPTIONS["1.5B"].id;

// ============================================================================
// NODE CLASS HIERARCHY - For intelligent parent selection
// ============================================================================

/** Defines valid parent classes for each node class (in priority order) */
const CLASS_HIERARCHY: Record<NodeClass, NodeClass[]> = {
  goal: [],
  section: ['goal'],
  subgoal: ['goal', 'section'],
  task: ['subgoal', 'section', 'goal'],
  resource: ['task', 'subgoal', 'section'],
  constraint: ['subgoal', 'task', 'goal', 'section'],
  metric: ['goal', 'subgoal', 'section'],
  idea: ['goal', 'subgoal', 'task', 'section'], // Ideas can attach flexibly
};

/**
 * Checks if a parent class is valid for a given child class.
 */
function isValidParentClass(childClass: NodeClass, parentClass: NodeClass): boolean {
  const validParents = CLASS_HIERARCHY[childClass];
  if (validParents.length === 0) return true; // Root-level classes
  return validParents.includes(parentClass);
}

/**
 * Calculates compatibility score between child and parent classes.
 * Higher score = better match.
 */
function getClassCompatibilityScore(childClass: NodeClass, parentClass: NodeClass): number {
  const validParents = CLASS_HIERARCHY[childClass];
  if (validParents.length === 0) return 0.5;

  const index = validParents.indexOf(parentClass);
  if (index === -1) return 0;

  // First in list = best match (1.0), decreasing priority
  return 1.0 - (index * 0.2);
}

// ============================================================================
// CLASS INFERENCE - Keyword-based classification
// ============================================================================

/** Keywords that suggest specific node classes */
const CLASS_INFERENCE_RULES: Record<NodeClass, RegExp> = {
  constraint: /\b(deadline|limit|must|rule|requirement|policy|restriction|budget|cannot|won't|limitation)\b/i,
  metric: /\b(measure|kpi|percentage|rate|score|count|target|benchmark|track|monitor|success criteria)\b/i,
  resource: /\b(tool|person|team|budget|money|software|platform|service|api|developer|hire|partner)\b/i,
  task: /\b(setup|create|build|implement|design|write|develop|deploy|test|configure|install|integrate)\b/i,
  subgoal: /\b(phase|milestone|stage|objective|component|module|part|area)\b/i,
  section: /\b(section|quadrant|domain|bucket|category|group|division|department)\b/i,
  goal: /\b(launch|achieve|complete|finish|deliver|ship|release|accomplish|succeed)\b/i,
  idea: /\b(maybe|could|might|consider|explore|investigate|research|experiment)\b/i,
};

/**
 * Infers node class from label text using keyword patterns.
 */
function inferClassFromLabel(label: string): NodeClass {
  // Use explicit priority order (Fix #26)
  const priorityOrder: NodeClass[] = [
    'constraint',
    'metric',
    'resource',
    'task',
    'subgoal',
    'section',
    'goal',
    'idea'
  ];

  for (const nodeClass of priorityOrder) {
    const pattern = CLASS_INFERENCE_RULES[nodeClass];
    if (pattern.test(label)) {
      return nodeClass;
    }
  }
  return 'idea'; // Default fallback
}

// ============================================================================
// SITUATION DETECTION - Classify user intent
// ============================================================================

/** Patterns for detecting planning context from user message */
const CONTEXT_PATTERNS: Record<PlanningContext, RegExp> = {
  problem_solving: /\b(problem|issue|struggle|stuck|failing|not working|low|poor|bad|broken|wrong|error|bug)\b/i,
  decision_making: /\b(should i|which|choose|decide|option|vs\.?|versus|or|between|compare|better|prefer)\b/i,
  brainstorming: /\b(ideas?|suggestions?|ways to|how can|possibilities|alternatives|options|what could)\b/i,
  refinement: /\b(improve|better|enhance|optimize|refine|iterate|change|modify|update|evolve)\b/i,
  execution: /\b(steps|how to|implement|build|create|start|begin|execute|do|action|next|plan)\b/i,
  validation: /\b(validate|verify|check|test|confirm|ensure|assumption|hypothesis|prove|evidence)\b/i,
  new_project: /^$/,  // Empty - handled separately for first turn
  general: /^$/,      // Fallback - handled in function
};

/**
 * Detects the planning context from user message to apply appropriate framework.
 */
function detectPlanningContext(message: string, isFirstTurn: boolean): PlanningContext {
  if (isFirstTurn) return 'new_project';

  const trimmedMessage = message.trim().toLowerCase();

  // Check patterns in priority order (most specific first)
  const priorityOrder: PlanningContext[] = [
    'validation',
    'problem_solving',
    'decision_making',
    'refinement',
    'brainstorming',
    'execution',
  ];

  for (const context of priorityOrder) {
    if (CONTEXT_PATTERNS[context].test(trimmedMessage)) {
      return context;
    }
  }

  return 'general';
}

// ============================================================================
// DESIGN THINKING FRAMEWORK LIBRARY
// Each framework provides context-specific guidance for the AI
// ============================================================================

interface FrameworkGuidance {
  name: string;
  description: string;
  guidance: string;
}

const FRAMEWORK_LIBRARY: Record<PlanningContext, FrameworkGuidance> = {
  new_project: {
    name: "Empathy & Discovery",
    description: "Understand who benefits and what problems they face",
    guidance: `
APPLY EMPATHY FRAMEWORK:
- First ask WHO this is for. Don't accept vague answers.
- Probe for: their context, daily frustrations, current workarounds
- Understand: What do they see, hear, think, and feel about this problem?
- Only after understanding the user, explore solutions.
- Create initial structure: Target User → Problem → Solution Approach`
  },

  problem_solving: {
    name: "Root Cause Analysis",
    description: "Dig deeper to find the real problem before solving",
    guidance: `
APPLY ROOT CAUSE (5 WHYS) FRAMEWORK:
- The user stated a problem. Don't jump to solutions.
- Ask "why" repeatedly to dig to the root cause.
- Challenge: Is this the real problem or just a symptom?
- Validate: What evidence suggests this is the core issue?
- Only after finding root cause, propose targeted solutions.`
  },

  decision_making: {
    name: "Multi-Perspective Analysis",
    description: "Consider all angles before recommending",
    guidance: `
APPLY SIX PERSPECTIVES FRAMEWORK:
1. FACTS: What objective information do we have?
2. FEELINGS: What's your intuition? What excites or worries you?
3. RISKS: What could go wrong with each option?
4. BENEFITS: What are the advantages of each?
5. ALTERNATIVES: Are there options not yet considered?
6. SYNTHESIS: Based on all perspectives, recommend a path.`
  },

  brainstorming: {
    name: "Divergent Thinking",
    description: "Generate multiple options before filtering",
    guidance: `
APPLY DIVERGENT THINKING FRAMEWORK:
- Generate 4-6 distinct approaches or ideas
- Include at least one unconventional option
- Challenge constraints: "What if [limitation] wasn't a factor?"
- Don't judge ideas yet - quantity over quality first
- Let the user react before converging on a direction.`
  },

  refinement: {
    name: "SCAMPER Innovation",
    description: "Systematically improve existing ideas",
    guidance: `
APPLY SCAMPER FRAMEWORK:
Consider these innovation prompts:
- SUBSTITUTE: What can be replaced with something else?
- COMBINE: What can be merged or bundled together?
- ADAPT: What can be borrowed from other domains?
- MODIFY: What can be made bigger, smaller, faster, different?
- PUT TO OTHER USE: How else could this be used?
- ELIMINATE: What can be removed or simplified?
- REVERSE: What if we did the opposite?

Suggest 2-3 SCAMPER-inspired improvements.`
  },

  execution: {
    name: "Journey & Task Breakdown",
    description: "Structure work into actionable stages",
    guidance: `
APPLY JOURNEY THINKING FRAMEWORK:
- Break down into sequential stages
- For each stage: What happens? Who does it? How long?
- Consider dependencies: What must come first?
- Include validation points: How will we know it's working?
- Add milestones and metrics where appropriate.`
  },

  validation: {
    name: "Assumption Testing",
    description: "Identify and validate key assumptions",
    guidance: `
APPLY VALIDATION (OIOR) FRAMEWORK:
- OBSERVE: What assumptions are we making?
- IDEATE: How could we test each assumption cheaply?
- OBSERVE: What evidence would prove/disprove it?
- REFLECT: What did we learn? What should change?

Help identify the riskiest assumptions and suggest validation approaches.`
  },

  general: {
    name: "Adaptive Guidance",
    description: "Apply the most relevant framework based on context",
    guidance: `
APPLY GENERAL DESIGN THINKING:
- Look for gaps in the current plan
- Ask clarifying questions if intent is unclear
- Challenge assumptions gently
- Suggest structure where it's missing
- Consider: What's the next most important question to answer?`
  }
};

// ============================================================================
// SYSTEM PROMPT - Core AI behavior
// ============================================================================

const SYSTEM_MESSAGE = `You are an action-oriented planning assistant. You help break goals into a structured, visual project plan.

RULES:
1. Always address the user as "you" — never say "the user".
2. Your response MUST consist of two parts: a brief conversational message (max 2 sentences), and a code block containing the mind map data.
3. The mind map data must strictly be inside a \`\`\`mindmap code block.
4. Define nodes using the exact format: NodeID[Type|Class|Label|Description]
   - NodeID: Unique alphanumeric string (e.g., G1, SEC1, T1)
   - Type: MUST be exactly one of: expandable, question, checklist, metric, decision, tradeoff, image. Default to 'expandable'. ONLY use 'checklist' if the user explicitly asks for steps/procedures. ONLY use 'metric' for measurable numbers.
   - Class: MUST be exactly one of: goal, section, subgoal, task, resource, constraint, metric, idea. Use 'section' for broad areas of work.
   - Label: The text label for the node. Keep it concise (max 5 words).
   - Description: A 1-2 sentence detailed explanation of the node's purpose. MUST NOT BE EMPTY.
5. For checklist nodes, ALWAYS add an ITEMS line on the very next line: ITEMS: item1 | item2 | item3
   Pre-fill 3-6 actionable checklist items relevant to the node's purpose.
   Checklist items must be concise verb phrases and must NOT repeat the full node label text.
6. For decision nodes, add: OPTIONS: option1 | option2 | option3 and optionally CHOSEN: option.
7. For tradeoff nodes, add: ROWS: candidate1 | candidate2 | candidate3
8. Define connections between nodes: SourceID --> TargetID
9. You MUST output at least 4 new nodes per response, unless you emit SWITCH_SECTION.
10. NEVER output placeholder text or bracket templates.
11. NEVER mention internal frameworks, node types, or map syntax in your conversational message. Keep the chat natural and human.
12. If the request clearly belongs in a different existing section, output:
    SWITCH_SECTION: <Exact Section Label> | <short reason>
    In this case, do not add new nodes in the mindmap block.

EXAMPLE OUTPUT:
Great! Let's structure your fitness app project. Here is the initial breakdown:
\`\`\`mindmap
G1[expandable|goal|Launch MVP Fitness App|Create a minimum viable product for a fitness application to test market fit.]
SEC1[expandable|section|Design & UX|Focus on user experience and visual interface design.]
SEC2[expandable|section|Development|Core engineering and backend infrastructure.]
T1[checklist|task|Create wireframes|Draft the initial low-fidelity wireframes for the main user flow.]
ITEMS: Sketch homepage layout | Design onboarding flow | Map user journey | Create component library
G1 --> SEC1
G1 --> SEC2
SEC1 --> T1
\`\`\``;

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

/**
 * Builds the first turn prompt focused on empathy and discovery.
 */
function buildFirstTurnPrompt(goal: string): string {
  return `GOAL: "${goal}"

Please begin by creating a structured initial visual project plan divided into broad, distinct sections.
Follow the core rules: 
1. Create 1 ROOT node (Class: goal) that represents the core objective.
2. Create 6-8 SECTION nodes (Class: section) connected directly to the root.
3. Sections must be non-overlapping and strategic (no generic catch-all like "Misc" or "General").
4. For EACH section node, create 3-5 focused child nodes (Class: task, resource, metric, or constraint).
5. Include at least 2 metrics and at least 2 constraints overall.
6. Prioritize high-leverage planning nodes: stakeholders, scope, milestones, risks, dependencies, budget/resources, success criteria.
7. Avoid niche trivia, low-impact implementation details, or tool-name-only nodes.
8. Include at least one question node and one decision or tradeoff node where suitable.
9. Keep the first map rich but still navigable: target 34-48 nodes total with meaningful hierarchy.`;
}

function extractSectionContext(userMessage: string): { sectionLabel: string | null; cleanedMessage: string } {
  const match = userMessage.match(/^\[Section:\s*([^\]]+)\]\s*/i);
  if (!match) {
    return { sectionLabel: null, cleanedMessage: userMessage };
  }
  return {
    sectionLabel: match[1].trim(),
    cleanedMessage: userMessage.replace(match[0], '').trim(),
  };
}

function extractKnownSections(existingNodeLabels: string): string[] {
  if (!existingNodeLabels) return [];
  const matches = [...existingNodeLabels.matchAll(/^[^\n]*\[[^\]|]*\|section\]\s+(.+)$/gim)];
  return matches
    .map((m) => m[1].trim())
    .filter((label) => label.length > 0);
}

/**
 * Builds subsequent turn prompts with context-aware framework guidance.
 */
function buildContextualPrompt(
  goal: string,
  userMessage: string,
  existingNodeLabels: string,
  context: PlanningContext
): string {
  // Inject the framework guidance so the AI actually uses it (Fix #27)
  const framework = FRAMEWORK_LIBRARY[context];
  const { sectionLabel, cleanedMessage } = extractSectionContext(userMessage);
  const knownSections = extractKnownSections(existingNodeLabels);
  const knownSectionInstruction = knownSections.length > 0
    ? `KNOWN SECTIONS: ${knownSections.join(' | ')}`
    : '';
  const sectionInstruction = sectionLabel
    ? `SECTION FOCUS: "${sectionLabel}"
- You are currently expanding this section.
- Find the existing section node ID whose label matches "${sectionLabel}" in CURRENT MAP CONTEXT.
- Attach new nodes under that section node unless the user explicitly asks otherwise.
- If the user asks for work that clearly belongs in another KNOWN SECTION, emit:
  SWITCH_SECTION: <Exact Section Label> | <short reason>
- If you emit SWITCH_SECTION, do not add any nodes.
`
    : '';

  return `GOAL: "${goal}"

CURRENT MAP CONTEXT:
${existingNodeLabels || "(none)"}

${knownSectionInstruction}
${framework.guidance}
${sectionInstruction}

USER APPLIES TO YOU: "${cleanedMessage}"

Rules for the mindmap code block:
- Create 4-8 new nodes that expand the map based on the user's message.
- You MUST connect each new node from an EXISTING source node ID in CURRENT MAP CONTEXT.
- Never invent source IDs that are not present in CURRENT MAP CONTEXT.
- Do NOT recreate existing nodes.
- Only output the NEW nodes and the NEW edges.
- Prefer section-scoped additions: if sections exist, avoid attaching non-section nodes directly to goal.
- Keep labels concrete and specific. Avoid vague labels like "Improve Plan", "General Ideas", or "Misc".
- Include at least one concrete execution node (task/resource/metric/constraint) unless the user explicitly asks for pure ideation.
- When relevant, include at least one advanced thinking node type: question, decision, or tradeoff.
- Descriptions must state why this node matters for the active section or goal.
- Remember the exact format: NodeID[Type|Class|Label|Description]`;
}

// ============================================================================
// RESPONSE PARSER - Robust extraction with validation
// ============================================================================

/**
 * Validates and normalizes a node type string.
 */
function validateNodeType(typeStr: string): NodeType {
  const normalized = typeStr.toLowerCase().trim();
  const validTypes: NodeType[] = ['expandable', 'question', 'checklist', 'metric', 'image', 'decision', 'tradeoff'];

  if (validTypes.includes(normalized as NodeType)) {
    return normalized as NodeType;
  }
  return 'expandable'; // Default fallback
}

/**
 * Validates and normalizes a node class string.
 */
function validateNodeClass(classStr: string): NodeClass {
  const normalized = classStr.toLowerCase().trim();
  const validClasses: NodeClass[] = ['goal', 'section', 'subgoal', 'task', 'resource', 'constraint', 'metric', 'idea'];

  if (validClasses.includes(normalized as NodeClass)) {
    return normalized as NodeClass;
  }
  return 'idea'; // Default fallback
}

function inferNodeType(
  explicitType: string,
  nodeClass: NodeClass,
  label: string,
  description: string,
  hasItems: boolean
): NodeType {
  const explicit = validateNodeType(explicitType);
  if (explicitType && ['expandable', 'question', 'checklist', 'metric', 'image', 'decision', 'tradeoff'].includes(explicitType.toLowerCase().trim())) {
    return explicit;
  }

  const normalizedLabel = label.toLowerCase().trim();
  const normalizedDescription = description.toLowerCase().trim();

  if (/\b(decide|decision|choose|pick|option|go\/no-go)\b/i.test(`${normalizedLabel} ${normalizedDescription}`)) {
    return 'decision';
  }
  if (/\b(trade[- ]?off|impact\s*vs\.?\s*effort|impact-effort|prioriti[sz]e matrix|cost[- ]benefit)\b/i.test(`${normalizedLabel} ${normalizedDescription}`)) {
    return 'tradeoff';
  }
  if (nodeClass === 'metric') return 'metric';
  if (
    normalizedLabel.endsWith('?') ||
    /^(how|what|why|which|who|where|when)\b/i.test(normalizedLabel) ||
    /question|unknown|clarify/.test(normalizedDescription)
  ) {
    return 'question';
  }
  if (hasItems || nodeClass === 'task') return 'checklist';
  return explicit;
}

function buildDefaultChecklistItems(): { id: string; text: string; completed: boolean }[] {
  return [
    { id: `item-${Date.now()}-0`, text: `Define scope and success criteria`, completed: false },
    { id: `item-${Date.now()}-1`, text: `Execute core activities`, completed: false },
    { id: `item-${Date.now()}-2`, text: `Review results and iterate`, completed: false },
  ];
}

/**
 * Parses AI response into structured format for mind map updates.
 */
export function parseAIResponse(
  response: string,
  goal: string,
  existingNodes: MindMapNode[],
  newNodeId: string,
  defaultParentId: string,
  lastUserMessage: string
): ParsedAIResponse {
  const normalizeLabelKey = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const resolveRedirectSection = (rawLabel: string): string | undefined => {
    const sectionLabels = existingNodes
      .filter((n) => n.nodeClass === 'section')
      .map((n) => n.label.trim())
      .filter((label) => label.length > 0);

    if (sectionLabels.length === 0) return undefined;
    if (!rawLabel) return undefined;

    const normalizedWanted = normalizeLabelKey(rawLabel);
    const exact = sectionLabels.find((label) => normalizeLabelKey(label) === normalizedWanted);
    if (exact) return exact;

    const contains = sectionLabels.find((label) =>
      normalizeLabelKey(label).includes(normalizedWanted) || normalizedWanted.includes(normalizeLabelKey(label))
    );

    return contains;
  };

  const switchMatch = response.match(/^\s*SWITCH_SECTION:\s*(.+)$/im);
  const switchPayload = switchMatch?.[1]?.trim() || '';
  const [rawRedirectLabel, rawRedirectReason] = switchPayload
    ? switchPayload.split('|', 2).map((part) => part.trim())
    : ['', ''];
  const redirectTo = resolveRedirectSection(rawRedirectLabel);
  const redirectReason = rawRedirectReason || undefined;

  // 1. Extract conversational message and mindmap block
  const mindmapMatch = response.match(/\`\`\`(?:mindmap)?\n([\s\S]*?)\`\`\`/i);
  let mindmapText = '';
  let assistantResponse = response;

  if (mindmapMatch) {
    mindmapText = mindmapMatch[1];
    // Remove the entire code block including backticks from the conversational response
    assistantResponse = response.replace(mindmapMatch[0], '');
  } else {
    // If no block, perhaps the AI just output the map without backticks. Try to salvage.
    mindmapText = response;
    assistantResponse = "I've updated the map based on your input.";
  }

  // Aggressively clean the conversational response from leaked map syntax
  assistantResponse = assistantResponse
    .replace(/^[A-Z0-9_-]+\s*-->\s*[A-Z0-9_-]+.*$/gm, '') // Strip edge definitions
    .replace(/^[A-Z0-9_-]+\[.*?\|.*?\|.*?\].*$/gm, '') // Strip node definitions
    .replace(/^\s*SWITCH_SECTION:\s*.+$/gim, '') // Strip redirect directives
    .replace(/EXISTING_ID(?:_[0-9]+)?/g, '') // Strip generic placeholders
    .trim();

  // Fallback for empty message after cleaning
  if (!assistantResponse) {
    assistantResponse = redirectTo
      ? `This belongs in "${redirectTo}".`
      : "I've updated your plan with these new additions.";
  }

  const newNodes: MindMapNode[] = [];
  const newEdges: MindMapEdge[] = [];
  const existingNodeIds = new Set(existingNodes.map(n => n.id));

  // 2. Parse nodes and edges from the text
  const lines = mindmapText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Node: ID[type|class|label|description]
    // Use a more lenient regex that tolerates trailing junk after the closing bracket
    const nodeMatch = line.match(/^([A-Z0-9_-]+)\[([^|]+)\|([^|]+)\|([^|\]]+)(?:\|([^\]]*))?\]/i);
    if (nodeMatch) {
      const id = nodeMatch[1].trim();

      // Collision protection - don't overwrite existing nodes
      if (existingNodeIds.has(id)) {
        console.warn(`[Parser] Skipping duplicate node ID: ${id}`);
        continue;
      }

      // Clean description to strip any leaked mindmap syntax
      let description = (nodeMatch[5] || '').trim();
      if (!description) description = `Details for: ${nodeMatch[4].trim()}`;
      // Strip patterns like " --> T2" or "[task" from leaked map syntax  
      description = description.replace(/\s*[-–→]+\s*[A-Z0-9_-]+.*$/i, '').trim();
      description = description.replace(/\[[^\]]*$/i, '').trim(); // Remove unclosed brackets
      description = description.replace(/^['"`]|['"`]$/g, '').trim();

      // Guard against leaked placeholder IDs like "T6" being used as descriptions.
      if (/^[A-Z]?\d{1,4}$/i.test(description) || /^T\d{1,4}$/i.test(description) || description.length < 4) {
        description = `Key detail for ${nodeMatch[4].trim()}.`;
      }

      const label = nodeMatch[4].trim();
      const rawClass = nodeMatch[3].trim();
      let resolvedClass = validateNodeClass(rawClass);
      if (resolvedClass === 'idea' && rawClass.toLowerCase() !== 'idea') {
        resolvedClass = inferClassFromLabel(`${label} ${description} ${rawClass}`);
      }

      const nodeData: MindMapNode = {
        id,
        nodeType: 'expandable',
        nodeClass: resolvedClass,
        label,
        description,
      };

      // Parse optional metadata lines in any order directly after a node.
      let lookahead = i + 1;
      while (lookahead < lines.length) {
        const nextLine = lines[lookahead].trim();
        if (!nextLine) {
          lookahead += 1;
          continue;
        }

        const looksLikeNode = /^([A-Z0-9_-]+)\[([^|]+)\|([^|]+)\|([^|\]]+)(?:\|([^\]]*))?\]/i.test(nextLine);
        const looksLikeEdge = /^([A-Z0-9_-]+)\s*-->\s*([A-Z0-9_-]+)/i.test(nextLine);
        if (looksLikeNode || looksLikeEdge) break;

        const itemsMatch = nextLine.match(/^ITEMS:\s*(.+)/i);
        if (itemsMatch) {
          nodeData.items = itemsMatch[1].split('|').map((text: string, idx: number) => ({
            id: `item-${Date.now()}-${idx}`,
            text: text.trim(),
            completed: false,
          })).filter((item: { text: string }) => item.text.length > 0);
          lookahead += 1;
          continue;
        }

        const optionsMatch = nextLine.match(/^OPTIONS:\s*(.+)/i);
        if (optionsMatch) {
          nodeData.decisionOptions = optionsMatch[1]
            .split('|')
            .map((option) => option.trim())
            .filter((option) => option.length > 0)
            .slice(0, 6);
          lookahead += 1;
          continue;
        }

        const chosenMatch = nextLine.match(/^CHOSEN:\s*(.+)/i);
        if (chosenMatch) {
          nodeData.chosenOption = chosenMatch[1].trim();
          lookahead += 1;
          continue;
        }

        const rowsMatch = nextLine.match(/^ROWS:\s*(.+)/i);
        if (rowsMatch) {
          const rows = rowsMatch[1]
            .split('|')
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .slice(0, 6);
          nodeData.tradeoffItems = rows.map((rowLabel, idx) => ({
            id: `${id}_row_${idx}`,
            label: rowLabel,
            impact: 3,
            effort: 3,
            risk: 2,
            time: 3,
          }));
          lookahead += 1;
          continue;
        }

        break;
      }
      i = lookahead - 1;

      nodeData.nodeType = inferNodeType(
        nodeMatch[2],
        nodeData.nodeClass,
        nodeData.label,
        nodeData.description,
        !!(nodeData.items && nodeData.items.length > 0)
      );

      if (nodeData.nodeType === 'checklist' && (!nodeData.items || nodeData.items.length === 0)) {
        nodeData.items = buildDefaultChecklistItems();
      }
      if (nodeData.nodeType === 'decision' && (!nodeData.decisionOptions || nodeData.decisionOptions.length === 0)) {
        nodeData.decisionOptions = ['Option A', 'Option B', 'Option C'];
      }
      if (nodeData.nodeType === 'tradeoff' && (!nodeData.tradeoffItems || nodeData.tradeoffItems.length === 0)) {
        nodeData.tradeoffItems = [
          { id: `${id}_row_0`, label: 'Low effort path', impact: 3, effort: 2, risk: 3, time: 2 },
          { id: `${id}_row_1`, label: 'Balanced path', impact: 4, effort: 3, risk: 2, time: 3 },
          { id: `${id}_row_2`, label: 'High impact path', impact: 5, effort: 4, risk: 3, time: 4 },
        ];
      }

      newNodes.push(nodeData);
      continue;
    }

    // Edge: SourceID --> TargetID (lenient — strip trailing junk)
    const edgeMatch = line.match(/^([A-Z0-9_-]+)\s*-->\s*([A-Z0-9_-]+)/i);
    if (edgeMatch) {
      newEdges.push({
        source: edgeMatch[1].trim(),
        target: edgeMatch[2].trim()
      });
      continue;
    }
  }

  // 3. Graceful fallback if parser completely failed (e.g. AI hallucinated hard)
  if (!redirectTo && newNodes.length === 0 && existingNodes.length > 0 && lastUserMessage) {
    newNodes.push({
      id: newNodeId, // Provided by the UI layer as fallback ID
      label: lastUserMessage.slice(0, 40),
      description: lastUserMessage,
      nodeClass: 'idea'
    });
    newEdges.push({ source: defaultParentId, target: newNodeId });
  } else if (!redirectTo && newNodes.length === 0 && existingNodes.length === 0) {
    newNodes.push({
      id: "root",
      label: goal.slice(0, 40),
      description: goal,
      nodeClass: 'goal'
    });
  }

  console.log('[Parser] Resolved Nodes:', newNodes);
  console.log('[Parser] Resolved Edges:', newEdges);

  return {
    assistantResponse,
    updatedMindMap: { nodes: newNodes, edges: newEdges },
    suggestions: [], // Deprecated OPTIONS feature
    redirectTo,
    redirectReason
  };
}

// ============================================================================
// AI SERVICE - Singleton pattern for model management
// ============================================================================

export class AIService {
  private static instance: AIService;
  private enginePromise: Promise<MLCEngine> | null = null;
  private currentModelId: string = selectedModelId;

  private constructor() { }

  /**
   * Gets the singleton instance of AIService.
   */
  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Returns the currently selected model ID.
   */
  public getCurrentModel(): string {
    return this.currentModelId;
  }

  /**
   * Switches to a different model size.
   */
  public async switchModel(
    modelSize: ModelSize,
    onProgress?: InitProgressCallback
  ): Promise<void> {
    const newModelId = MODEL_OPTIONS[modelSize].id;

    if (newModelId === this.currentModelId && this.enginePromise) {
      return; // Already loaded
    }

    this.enginePromise = null;
    this.currentModelId = newModelId;
    selectedModelId = newModelId;

    await this.getEngine(onProgress);
  }

  /**
   * Gets or initializes the LLM engine.
   */
  public async getEngine(onProgress?: InitProgressCallback): Promise<MLCEngine> {
    if (this.enginePromise) {
      return this.enginePromise;
    }

    this.enginePromise = CreateMLCEngine(this.currentModelId, {
      initProgressCallback: onProgress,
      logLevel: "INFO"
    });

    return this.enginePromise;
  }

  /**
   * Returns mode-specific guidance for the AI based on thinking mode.
   */
  private getModeGuidance(mode: 'explore' | 'analyze' | 'create' | 'execute'): string {
    const guidance: Record<string, string> = {
      explore: `EXPLORE MODE ACTIVE:
- Ask open-ended questions to understand the problem space
- Encourage divergent thinking - accept all ideas without judgment
- Focus on WHO benefits and WHAT problems exist
- Be curious and empathetic`,

      analyze: `ANALYZE MODE ACTIVE:
- Apply root cause analysis - ask WHY repeatedly
- Challenge assumptions and identify gaps
- Look for risks and dependencies
- Be structured and critical`,

      create: `CREATE MODE ACTIVE:
- Generate multiple alternative approaches
- Use SCAMPER thinking (Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse)
- Challenge constraints creatively
- Be innovative and playful`,

      execute: `EXECUTE MODE ACTIVE:
- Break work into concrete, actionable tasks
- Add deadlines, milestones, and owners
- Consider dependencies and sequence
- Be specific and practical`
    };

    return guidance[mode] || guidance.explore;
  }

  private mapContextToMode(context: PlanningContext): 'explore' | 'analyze' | 'create' | 'execute' {
    const mapping: Record<PlanningContext, 'explore' | 'analyze' | 'create' | 'execute'> = {
      new_project: 'explore',
      problem_solving: 'analyze',
      decision_making: 'analyze',
      brainstorming: 'create',
      refinement: 'create',
      execution: 'execute',
      validation: 'analyze',
      general: 'explore',
    };
    return mapping[context];
  }


  /**
   * Sends a chat message to the AI and returns the response.
   * @param initialGoal - The user's main goal
   * @param chatHistory - Conversation history
   * @param currentMindMapJSON - Current mind map state as JSON
   * @param thinkingMode - Current thinking mode (explore/analyze/create/execute)
   * @param onProgress - Optional progress callback
   */
  public async chat(
    initialGoal: string,
    chatHistory: ChatMessage[],
    currentMindMapJSON: string,
    thinkingMode?: 'explore' | 'analyze' | 'create' | 'execute',
    onProgress?: InitProgressCallback,
    options?: { forceContextual?: boolean; preEnrichedUserPrompt?: boolean; maxTokens?: number; temperature?: number }
  ): Promise<string> {
    const engine = await this.getEngine(onProgress);

    const isFirstTurn = !options?.forceContextual && chatHistory.length <= 1;
    const lastUserMsg = chatHistory[chatHistory.length - 1]?.content || "";
    const planningContext = detectPlanningContext(lastUserMsg, isFirstTurn);

    // Auto-select the most suitable mode from context unless explicitly provided.
    const resolvedMode = thinkingMode || this.mapContextToMode(planningContext);
    const modeGuidance = this.getModeGuidance(resolvedMode);

    // Build messages array with mode-enhanced system prompt
    const enhancedSystemMessage = `${SYSTEM_MESSAGE}\n\nCURRENT MODE: ${resolvedMode.toUpperCase()}\n${modeGuidance}`;

    const messages: ChatMessage[] = [
      { role: "system", content: enhancedSystemMessage }
    ];

    if (isFirstTurn) {
      messages.push({
        role: "user",
        content: buildFirstTurnPrompt(initialGoal)
      });
    } else {
      // Include conversation history for context (last 6 messages to fit context window)
      const recentHistory = chatHistory.slice(-6);
      for (const msg of recentHistory) {
        if (msg.role === 'system') continue; // Skip system messages from history
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }

      if (!options?.preEnrichedUserPrompt) {
        const existingLabels = this.extractNodeLabels(currentMindMapJSON);

        // Add the structured prompt as the final user message when caller did not provide an enriched prompt.
        messages.push({
          role: "user",
          content: buildContextualPrompt(
            initialGoal,
            lastUserMsg,
            existingLabels,
            planningContext
          )
        });
      }
    }

    const reply = await engine.chat.completions.create({
      messages: messages as unknown as Parameters<typeof engine.chat.completions.create>[0]['messages'],
      temperature: typeof options?.temperature === 'number' ? options.temperature : 0.7,
      max_tokens: typeof options?.maxTokens === 'number' ? options.maxTokens : 2048,
    });

    const response = reply.choices[0].message.content || "";

    return response;
  }

  /**
   * Extracts node labels from mind map JSON for context.
   */
  private extractNodeLabels(mindMapJSON: string): string {
    try {
      const data = JSON.parse(mindMapJSON);
      if (data.nodes && Array.isArray(data.nodes)) {
        return data.nodes
          .map((n: { id: string; type?: string; data?: { label?: string; nodeClass?: string } }) => {
            const label = n.data?.label || '';
            const nodeClass = n.data?.nodeClass || 'idea';
            const nodeType = n.type || 'expandable';
            if (!label) return '';
            return `${n.id}: [${nodeType}|${nodeClass}] ${label}`;
          })
          .filter((s: string) => s.length > 0)
          .join('\n');
      }
    } catch {
      console.warn("[AIService] Could not parse mind map JSON");
    }
    return "";
  }
}

// Export singleton instance
export const aiService = AIService.getInstance();
