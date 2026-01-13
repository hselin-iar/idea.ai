import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

// ============================================================================
// V43: AUTO-EXPAND MODE - Create all nodes, expand from outermost
// ============================================================================

/**
 * System message - Comprehensive planning, no useless questions
 */
const SYSTEM_MESSAGE = `You are a project planning assistant.
Create comprehensive mind maps with real, specific content.
Use your knowledge to suggest technologies, strategies, and steps.
Keep responses concise.`;

/**
 * FIRST TURN: Create comprehensive structure, no question
 */
const buildFirstTurnUserMessage = (goal: string): string => {
  return `Goal: ${goal}

Create a COMPREHENSIVE mind map with 5-6 topics covering all important aspects.
Use your knowledge to suggest SPECIFIC things (technologies, strategies, steps).

Reply format:
MESSAGE: Here's your initial plan for ${goal}. Click any topic or type to expand.
TOPIC1: [Topic name]|[Description]
TOPIC2: [Topic name]|[Description]
TOPIC3: [Topic name]|[Description]
TOPIC4: [Topic name]|[Description]
TOPIC5: [Topic name]|[Description]
OPTIONS: [Topic1 name], [Topic2 name], [Topic3 name]

Example for "build a SaaS":
MESSAGE: Here's your initial plan. Click any topic or type to expand.
TOPIC1: Tech Stack|React, Node.js, PostgreSQL for modern web development
TOPIC2: User Authentication|Secure login with OAuth and JWT tokens
TOPIC3: Payment Integration|Stripe for subscriptions and billing
TOPIC4: Marketing Strategy|SEO, content marketing, social media presence
TOPIC5: Customer Support|Help desk, documentation, chat support
OPTIONS: Tech Stack, Authentication, Payments`;
};

/**
 * SUBSEQUENT TURNS: Expand from the topic user mentioned
 */
const buildMainTurnUserMessage = (
  goal: string,
  lastUserMessage: string,
  conversationSummary: string,
  leafNodes: string
): string => {
  return `User wants to expand: "${lastUserMessage}"
Project: ${goal}

Current leaf topics (outermost nodes): ${leafNodes}

Add 2-3 NEW sub-topics under "${lastUserMessage}" with SPECIFIC details.
Use your knowledge to suggest real options.

Reply format:
MESSAGE: [Short response about ${lastUserMessage}]
NEWTOPIC: [Sub-topic name]|[Specific details]
NEWTOPIC: [Another sub-topic]|[Specific details]
PARENT: [Name of topic to connect these to]
OPTIONS: [Sub-topic 1], [Sub-topic 2], [Sub-topic 3]`;
};

/**
 * V43: Parse text format into JSON structure
 */
export const parseAIResponse = (response: string, goal: string, existingNodes: any[], newNodeId: string, defaultParentId: string, lastUserMessage: string) => {
  const lines = response.split('\n').filter(l => l.trim());

  let message = `Here's your plan for ${goal}. Click any topic or type to expand.`;
  const topics: { name: string, desc: string }[] = [];
  let options: string[] = [];
  let parentName = "";

  for (const line of lines) {
    if (line.startsWith('MESSAGE:')) {
      message = line.replace('MESSAGE:', '').trim();
    } else if (line.startsWith('QUESTION:')) {
      message = line.replace('QUESTION:', '').trim();
    } else if (line.startsWith('TOPIC') || line.startsWith('NEWTOPIC')) {
      const content = line.replace(/^(TOPIC\d?|NEWTOPIC):?\s*/, '');
      const [name, desc] = content.split('|').map(s => s.trim());
      if (name && !name.includes('[')) topics.push({ name, desc: desc || name });
    } else if (line.startsWith('OPTIONS:')) {
      options = line.replace('OPTIONS:', '').split(',').map(s => s.trim()).filter(s => s && !s.includes('['));
    } else if (line.startsWith('PARENT:')) {
      parentName = line.replace('PARENT:', '').trim();
    }
  }

  const isFirstTurn = existingNodes.length === 0;

  if (isFirstTurn) {
    // V43: First turn - create comprehensive structure (5-6 topics)
    const nodes = [
      { id: "root", label: goal.slice(0, 30), description: goal },
      ...topics.slice(0, 6).map((t, i) => ({
        id: `aspect-${i + 1}`,
        label: t.name,
        description: t.desc
      }))
    ];
    const edges = topics.slice(0, 6).map((_, i) => ({
      source: "root",
      target: `aspect-${i + 1}`
    }));

    return {
      assistantResponse: message,
      updatedMindMap: { nodes, edges },
      suggestions: options.length > 0 ? options : topics.slice(0, 3).map(t => t.name)
    };
  } else {
    // V43: Subsequent turns - add multiple sub-nodes
    // Find parent by name match
    let parentId = defaultParentId;
    if (parentName) {
      const matchingNode = existingNodes.find(n =>
        (n.data?.label || n.label || "").toLowerCase().includes(parentName.toLowerCase())
      );
      if (matchingNode) parentId = matchingNode.id;
    }

    // Also try matching to user's message
    if (parentId === defaultParentId && lastUserMessage) {
      const matchingNode = existingNodes.find(n =>
        (n.data?.label || n.label || "").toLowerCase().includes(lastUserMessage.toLowerCase().split(' ')[0])
      );
      if (matchingNode) parentId = matchingNode.id;
    }

    // Create nodes for all topics
    const timestamp = Date.now();
    const newNodes = topics.slice(0, 3).map((t, i) => ({
      id: `node-${timestamp}-${i}`,
      label: t.name,
      description: t.desc
    }));

    const newEdges = newNodes.map(n => ({
      source: parentId,
      target: n.id
    }));

    // If no topics parsed, create one from user message
    if (newNodes.length === 0) {
      newNodes.push({
        id: newNodeId,
        label: lastUserMessage || "New Topic",
        description: `Details about ${lastUserMessage}`
      });
      newEdges.push({ source: parentId, target: newNodeId });
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

  private constructor() { }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public async getEngine(onProgress?: InitProgressCallback): Promise<MLCEngine> {
    if (this.enginePromise) {
      return this.enginePromise;
    }

    this.enginePromise = CreateMLCEngine(SELECTED_MODEL, {
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
      try {
        const mapData = JSON.parse(currentMindMapJSON);
        if (mapData.nodes && mapData.edges) {
          const sourceIds = new Set(mapData.edges.map((e: any) => e.source));
          const leafNodes = mapData.nodes.filter((n: any) => !sourceIds.has(n.id));
          leafNodeLabels = leafNodes.map((n: any) => n.label || n.data?.label).join(', ');
        }
      } catch (e) {
        console.warn("Could not parse mind map for leaf nodes");
      }

      messages.push({
        role: "user",
        content: buildMainTurnUserMessage(initialGoal, lastUserMsg, summary, leafNodeLabels)
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


