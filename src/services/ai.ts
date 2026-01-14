import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

// Model options with metadata
export const MODEL_OPTIONS = {
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
} as const;

export type ModelSize = keyof typeof MODEL_OPTIONS;

let SELECTED_MODEL: string = MODEL_OPTIONS["1.5B"].id;

// ============================================================================
// V49: INTENT PREPROCESSING - Extract user intent before sending to AI
// ============================================================================

interface UserIntent {
  action: 'add' | 'explain' | 'list' | 'expand' | 'general';
  topic: string;
  keywords: string[];
  suggestedNodeCount: number;
}

/**
 * V49: Extract structured intent from natural language user message
 * This helps the small model understand what the user wants
 */
const extractUserIntent = (message: string): UserIntent => {
  const lower = message.toLowerCase();

  // Detect action type from common patterns
  let action: UserIntent['action'] = 'general';

  if (/\b(steps|procedure|process|workflow|how to)\b/.test(lower)) {
    action = 'list'; // Treat steps as a list
  } else if (/\b(add|include|suggest|recommend|list|give me|show me|what are|examples)\b/.test(lower)) {
    action = 'list';
  } else if (/\b(explain|what is|how does|describe|tell me about)\b/.test(lower)) {
    action = 'explain';
  } else if (/\b(expand|more|details|elaborate|dig into)\b/.test(lower)) {
    action = 'expand';
  } else if (/\b(create|make|build|set up)\b/.test(lower)) {
    action = 'add';
  }

  // Extract key topic words (remove common filler words)
  const fillerWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'can', 'for', 'of', 'to', 'in', 'on', 'at', 'by',
    'with', 'about', 'into', 'through', 'from', 'up', 'out', 'and', 'or', 'but',
    'so', 'if', 'then', 'than', 'that', 'this', 'these', 'those', 'what', 'which',
    'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
    'same', 'just', 'also', 'very', 'my', 'your', 'our', 'their', 'its', 'me',
    'please', 'thanks', 'want', 'need', 'like', 'add', 'include', 'suggest', 'give',
    'steps', 'process', 'procedure'
  ]);

  const words = message.toLowerCase().split(/\s+/);
  const keywords = words.filter(w => w.length > 2 && !fillerWords.has(w));

  // Extract main topic (longest remaining keyword or first noun-like word)
  const topic = keywords.length > 0
    ? keywords.reduce((a, b) => a.length >= b.length ? a : b)
    : message.slice(0, 30);

  // Suggest node count based on action type
  let suggestedNodeCount = 2;
  if (action === 'list') suggestedNodeCount = 5;
  else if (action === 'explain') suggestedNodeCount = 2;
  else if (action === 'expand') suggestedNodeCount = 4;
  else if (action === 'add') suggestedNodeCount = 3;

  return { action, topic, keywords, suggestedNodeCount };
};

/**
 * System message - Comprehensive planning, no useless questions
 */
const SYSTEM_MESSAGE = `You are a project planning assistant.
Create comprehensive mind maps with real, specific content.
Use your knowledge to suggest technologies, strategies, and steps.
Keep responses concise.`;

/**
 * FIRST TURN: Create comprehensive structure
 * V50: Restored "Large Base" - asking for 8-10 nodes
 */
const buildFirstTurnUserMessage = (goal: string): string => {
  return `Goal: ${goal}

Create a large, comprehensive mind map with 8-10 main topics covering all key aspects.
Use your knowledge to suggest SPECIFIC, REAL things (not placeholders).

Reply format:
MESSAGE: Here's your plan for ${goal}. Click any topic to expand.
TOPIC1: Topic Name|Specific description with real details
TOPIC2: Topic Name|Specific description with real details
TOPIC3: Topic Name|Specific description with real details
TOPIC4: Topic Name|Specific description with real details
TOPIC5: Topic Name|Specific description with real details
TOPIC6: Topic Name|Specific description with real details
TOPIC7: Topic Name|Specific description with real details
TOPIC8: Topic Name|Specific description with real details
TOPIC9: Topic Name|Specific description with real details
TOPIC10: Topic Name|Specific description with real details
OPTIONS: TopicName1, TopicName2, TopicName3

RULES:
- Generate at least 8 main topics to form a strong base
- Each description must contain REAL, USEFUL information
- No brackets [] around text
- OPTIONS must use actual topic names you created`;
};

/**
 * V50: Intent-aware prompting + Multi-Parent Support
 */
const buildMainTurnUserMessage = (
  goal: string,
  lastUserMessage: string,
  conversationSummary: string,
  leafNodes: string,
  existingLabels: string
): string => {
  const intent = extractUserIntent(lastUserMessage);

  const intentDescription = {
    'list': 'User wants a LIST of specific items/options',
    'explain': 'User wants an EXPLANATION of a concept',
    'expand': 'User wants MORE DETAILS on an existing topic',
    'add': 'User wants to ADD/CREATE something new',
    'general': 'User has a general question'
  }[intent.action];

  return `Context: "${goal}"

USER REQUEST: "${lastUserMessage}"
INTENT: ${intentDescription}
KEY TOPICS: ${intent.keywords.join(', ') || 'general'}
SUGGESTED NODES: ${intent.suggestedNodeCount}

Existing nodes: ${existingLabels}

TASK:
1. Find which existing node(s) relate to: ${intent.topic}
2. Create ${intent.suggestedNodeCount} new nodes with REAL, SPECIFIC content
3. Format descriptions using bullet points (•) for readability
4. If addressing multiple existing nodes, specify PARENT before each group

Reply format:
MESSAGE: Brief response
PARENT: [Related Node A]
NEWTOPIC: Name|Description • Fact 1 • Fact 2
PARENT: [Related Node B]
NEWTOPIC: Name|Description • Fact 1 • Fact 2
OPTIONS: [Names of nodes you created]

EXAMPLE:
User: "list databases"
PARENT: Tech Stack
NEWTOPIC: PostgreSQL|Relational database • ACID compliant • SQL standard
NEWTOPIC: MongoDB|NoSQL document store • Flexible schema • JSON-like
OPTIONS: PostgreSQL, MongoDB

RULES:
- PARENT must be from the existing nodes list
- To add to different nodes, repeat the PARENT: line
- Descriptions MUST use "•" to separate facts`;
};


/**
 * V50: Parse text format into JSON structure - Supports Multiple Parents
 */
export const parseAIResponse = (response: string, goal: string, existingNodes: any[], newNodeId: string, defaultParentId: string, lastUserMessage: string) => {
  const lines = response.split('\n').filter(l => l.trim());

  let message = `Here's your plan for ${goal}. Click any topic or type to expand.`;
  // V50: Store parent preference with each topic
  const topics: { name: string, desc: string, preferredParent?: string }[] = [];
  let options: string[] = [];
  let currentParentName = "";

  for (const line of lines) {
    if (line.startsWith('MESSAGE:')) {
      message = line.replace('MESSAGE:', '').trim();
    } else if (line.startsWith('QUESTION:')) {
      message = line.replace('QUESTION:', '').trim();
    } else if (line.startsWith('PARENT:')) {
      currentParentName = line.replace('PARENT:', '').trim();
    } else if (line.startsWith('TOPIC') || line.startsWith('NEWTOPIC')) {
      const content = line.replace(/^(TOPIC\d?|NEWTOPIC):?\s*/, '');
      let [name, desc] = content.split('|').map(s => s.trim());
      name = name.replace(/^\[|\]$/g, '').trim();
      desc = (desc || name).replace(/^\[|\]$/g, '').trim();
      if (name && name.length > 0) {
        topics.push({ name, desc, preferredParent: currentParentName });
      }
    } else if (line.startsWith('OPTIONS:')) {
      options = line.replace('OPTIONS:', '').split(',')
        .map(s => s.trim().replace(/^\[|\]$/g, ''))
        .filter(s => s && s.length > 0);
    }
  }

  const isFirstTurn = existingNodes.length === 0;

  if (isFirstTurn) {
    // V50: First turn - create comprehensive structure (8+ topics)
    const nodes = [
      { id: "root", label: goal.slice(0, 30), description: goal },
      ...topics.map((t, i) => ({
        id: `aspect-${i + 1}`,
        label: t.name,
        description: t.desc
      }))
    ];
    // Connect all to root
    const edges = topics.map((_, i) => ({
      source: "root",
      target: `aspect-${i + 1}`
    }));

    return {
      assistantResponse: message,
      updatedMindMap: { nodes, edges },
      suggestions: options.length > 0 ? options : topics.slice(0, 3).map(t => t.name)
    };
  } else {
    // V50: Mass Update Support - Resolve parent for EACH topic
    const timestamp = Date.now();
    const newNodes: any[] = [];
    const newEdges: any[] = [];

    // Helper: calculate word overlap score
    const getOverlapScore = (nodeLabel: string, searchText: string): number => {
      const nodeWords = nodeLabel.toLowerCase().split(/\s+/);
      const searchWords = searchText.toLowerCase().split(/\s+/);
      return searchWords.filter(sw => nodeWords.some(nw => nw.includes(sw) || sw.includes(nw))).length;
    };

    const rootNode = existingNodes.find(n => n.id.includes('root') || existingNodes.indexOf(n) === 0);
    const rootId = rootNode?.id;

    topics.forEach((topic, index) => {
      let parentId = defaultParentId;

      // 1. Try Topic's specific Preferred Parent
      if (topic.preferredParent) {
        const matchingNode = existingNodes.find(n => {
          const label = (n.data?.label || n.label || "").toLowerCase();
          return label.includes(topic.preferredParent!.toLowerCase()) || topic.preferredParent!.toLowerCase().includes(label);
        });
        if (matchingNode) {
          parentId = matchingNode.id;
        }
      }
      // 2. Fallback: If no preferred parent (or not found), try context matching
      if (parentId === defaultParentId || parentId === rootId) {
        let bestScore = 0;
        let bestMatch = null;
        for (const node of existingNodes) {
          if (node.id === rootId) continue;
          const label = node.data?.label || node.label || "";
          // Match against user message AND topic name to be smart
          const score = getOverlapScore(label, lastUserMessage + " " + topic.name);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = node;
          }
        }
        if (bestMatch && bestScore > 0) parentId = bestMatch.id;
      }

      // Create Node
      const nodeId = `node-${timestamp}-${index}-new`; // unique suffix
      newNodes.push({
        id: nodeId,
        label: topic.name,
        description: topic.desc
      });

      // Create Edge
      newEdges.push({
        source: parentId,
        target: nodeId
      });
    });

    // Fallback: If no topics parsed, create one from user message (legacy)
    if (newNodes.length === 0) {
      newNodes.push({
        id: newNodeId,
        label: lastUserMessage || "New Topic",
        description: `Details about ${lastUserMessage}`
      });
      newEdges.push({ source: defaultParentId, target: newNodeId });
    }

    return {
      assistantResponse: message,
      updatedMindMap: { nodes: newNodes, edges: newEdges },
      suggestions: options
    };
  }
};

// ============================================================================
// AI SERVICE
// ============================================================================

export class AIService {
  private static instance: AIService;
  private enginePromise: Promise<MLCEngine> | null = null;
  private currentModelId: string = SELECTED_MODEL;

  private constructor() { }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public getCurrentModel(): string {
    return this.currentModelId;
  }

  public async switchModel(modelSize: ModelSize, onProgress?: InitProgressCallback): Promise<void> {
    const newModelId = MODEL_OPTIONS[modelSize].id;
    if (newModelId === this.currentModelId && this.enginePromise) {
      return; // Already loaded
    }

    // Clear existing engine
    this.enginePromise = null;
    this.currentModelId = newModelId;
    SELECTED_MODEL = newModelId;

    // Pre-load the new model
    await this.getEngine(onProgress);
  }

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

  public async chat(
    initialGoal: string,
    chatHistory: { role: string; content: string }[],
    currentMindMapJSON: string,
    onProgress?: InitProgressCallback
  ) {
    const engine = await this.getEngine(onProgress);

    const isFirstTurn = chatHistory.length <= 1;

    // V39: Build messages array with system + user messages
    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_MESSAGE }
    ];

    if (isFirstTurn) {
      messages.push({
        role: "user",
        content: buildFirstTurnUserMessage(initialGoal)
      });
    } else {
      // V44: Get the last user message
      const lastUserMsg = chatHistory[chatHistory.length - 1]?.content || "";

      // V44: Limit conversation summary to last 4 messages (context window limit)
      const recentHistory = chatHistory.slice(-5, -1); // Last 4, excluding current
      const summary = recentHistory
        .map(m => `${m.role}: ${m.content.slice(0, 100)}`) // Truncate long messages
        .join('\n');

      // V43: Find leaf nodes (outermost - nodes that are not sources of any edge)
      let leafNodeLabels = "root";
      let existingLabels = "";
      try {
        const mapData = JSON.parse(currentMindMapJSON);
        if (mapData.nodes && mapData.edges) {
          const sourceIds = new Set(mapData.edges.map((e: any) => e.source));
          const leafNodes = mapData.nodes.filter((n: any) => !sourceIds.has(n.id));
          leafNodeLabels = leafNodes.map((n: any) => n.label || n.data?.label).join(', ');
          // V45: Get all existing labels to prevent duplicates
          existingLabels = mapData.nodes.map((n: any) => n.label || n.data?.label).join(', ');
        }
      } catch (e) {
        console.warn("Could not parse mind map for leaf nodes");
      }

      messages.push({
        role: "user",
        content: buildMainTurnUserMessage(initialGoal, lastUserMsg, summary, leafNodeLabels, existingLabels)
      });
    }

    console.log("V39 DEBUG: Sending messages:", JSON.stringify(messages, null, 2));

    const reply = await engine.chat.completions.create({
      messages: messages as any,
      temperature: 0.7, // Higher for more creativity, less template copying
      max_tokens: 400,
      // V42: No JSON format - using simple text format
    });

    const response = reply.choices[0].message.content || "";
    console.log("V39 DEBUG: Raw response:", response);

    return response;
  }
}

export const aiService = AIService.getInstance();


