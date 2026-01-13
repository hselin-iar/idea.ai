import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

// ============================================================================
// V42: SIMPLE FORMAT - AI outputs text, code builds structure
// ============================================================================

/**
 * System message - Simple output format
 */
const SYSTEM_MESSAGE = `You are a helpful planning assistant for building projects.
When asked about a goal, suggest 3 specific topics to explore.
Keep responses SHORT and specific.
Use your knowledge to SUGGEST real options (technologies, strategies, etc).`;

/**
 * FIRST TURN: Just ask for topics, no JSON template
 */
const buildFirstTurnUserMessage = (goal: string): string => {
  return `Goal: ${goal}

Suggest 3 specific topics to explore for this goal.

Reply in this EXACT format:
QUESTION: [Your question asking which topic to focus on]
TOPIC1: [First topic name]|[Brief description]
TOPIC2: [Second topic name]|[Brief description]  
TOPIC3: [Third topic name]|[Brief description]
OPTIONS: [Option1], [Option2], [Option3]

Example for "build a mobile app":
QUESTION: Would you like to focus on UI design, backend development, or app publishing?
TOPIC1: UI Design|Creating user interface and experience
TOPIC2: Backend Development|Server-side logic and APIs
TOPIC3: App Publishing|Submitting to app stores
OPTIONS: UI Design, Backend, Publishing, Other`;
};

/**
 * SUBSEQUENT TURNS: Simple format for new topics
 */
const buildMainTurnUserMessage = (
  goal: string,
  lastUserMessage: string,
  conversationSummary: string
): string => {
  return `User said: "${lastUserMessage}"
Project: ${goal}

Previous: ${conversationSummary}

Respond to what the user said. If they ask about tech, SUGGEST specific technologies.

Reply format:
QUESTION: [Short follow-up question or recommendation]
NEWTOPIC: [Topic name based on user's message]|[Description]
OPTIONS: [Option1], [Option2], [Option3]`;
};

/**
 * Parse simple text format into JSON structure
 */
export const parseAIResponse = (response: string, goal: string, existingNodes: any[], newNodeId: string, parentId: string, lastUserMessage: string) => {
  const lines = response.split('\n').filter(l => l.trim());

  let question = "What would you like to explore?";
  const topics: { name: string, desc: string }[] = [];
  let options: string[] = [];

  for (const line of lines) {
    if (line.startsWith('QUESTION:')) {
      question = line.replace('QUESTION:', '').trim();
    } else if (line.startsWith('TOPIC') || line.startsWith('NEWTOPIC:')) {
      const content = line.replace(/^(TOPIC\d?|NEWTOPIC):?\s*/, '');
      const [name, desc] = content.split('|').map(s => s.trim());
      if (name) topics.push({ name, desc: desc || name });
    } else if (line.startsWith('OPTIONS:')) {
      options = line.replace('OPTIONS:', '').split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  // Build proper JSON structure
  const isFirstTurn = existingNodes.length === 0;

  if (isFirstTurn) {
    // First turn: create root + topics
    const nodes = [
      { id: "root", label: goal.slice(0, 30), description: goal },
      ...topics.slice(0, 3).map((t, i) => ({
        id: `aspect-${i + 1}`,
        label: t.name,
        description: t.desc
      }))
    ];
    const edges = topics.slice(0, 3).map((_, i) => ({
      source: "root",
      target: `aspect-${i + 1}`
    }));

    return {
      assistantResponse: question,
      updatedMindMap: { nodes, edges },
      suggestions: options.length > 0 ? options : topics.map(t => t.name)
    };
  } else {
    // Subsequent turns: add new node
    const newTopic = topics[0] || { name: lastUserMessage || "New Topic", desc: "User topic" };

    return {
      assistantResponse: question,
      updatedMindMap: {
        nodes: [{ id: newNodeId, label: newTopic.name, description: newTopic.desc }],
        edges: [{ source: parentId, target: newNodeId }]
      },
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
      // V42: Get the last user message
      const lastUserMsg = chatHistory[chatHistory.length - 1]?.content || "";

      // Build conversation summary (excluding last message)
      const summary = chatHistory
        .slice(0, -1)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      messages.push({
        role: "user",
        content: buildMainTurnUserMessage(initialGoal, lastUserMsg, summary)
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


