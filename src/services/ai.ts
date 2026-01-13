import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

// ============================================================================
// V40: NO BRACKETS - All placeholders removed, explicit values only
// ============================================================================

/**
 * System message that defines the AI's core behavior
 */
const SYSTEM_MESSAGE = `You are a mind map planning assistant. Your job is to:
1. Ask SHORT questions (1 sentence) to understand the user's project
2. Create mind map nodes with REAL labels based on their goal
3. NEVER use placeholder text like "topic 1" or "option 1"
4. ALWAYS respond to what the user just said

You output JSON only. All text must be REAL content, never placeholders.`;

/**
 * FIRST TURN: No template shown - just describe what to generate
 */
const buildFirstTurnUserMessage = (goal: string): string => {
  return `GOAL: "${goal}"

Generate a mind map with 3 starter topics for this goal.

Your JSON must have:
- assistantResponse: A question asking which topic to focus on (mention the actual topics)
- updatedMindMap.nodes: Array with root node + 3 topic nodes with REAL labels and descriptions
- updatedMindMap.edges: Connect each topic to root
- suggestions: 3-4 clickable options matching your topics

Example for "build a mobile app":
{
  "assistantResponse": "Would you like to focus on the user interface design, backend development, or app store publishing first?",
  "updatedMindMap": {
    "nodes": [
      {"id": "root", "label": "Build Mobile App", "description": "Creating a mobile application"},
      {"id": "aspect-1", "label": "UI Design", "description": "User interface and user experience design"},
      {"id": "aspect-2", "label": "Backend Development", "description": "Server-side logic and database"},
      {"id": "aspect-3", "label": "App Store Publishing", "description": "Submitting to app stores"}
    ],
    "edges": [
      {"source": "root", "target": "aspect-1"},
      {"source": "root", "target": "aspect-2"},
      {"source": "root", "target": "aspect-3"}
    ]
  },
  "suggestions": ["UI Design", "Backend Development", "App Store Publishing", "Something else"]
}

Now generate for: "${goal}"`;
};

/**
 * SUBSEQUENT TURNS: Pre-fill node ID AND edge source
 */
const buildMainTurnUserMessage = (
  goal: string,
  lastUserMessage: string,
  conversationSummary: string,
  currentNodes: string,
  newNodeId: string,
  defaultParentId: string
): string => {
  return `USER SAID: "${lastUserMessage}"

Add a node for "${lastUserMessage}" to the mind map.

NODE TO CREATE:
- id: "${newNodeId}"
- label: Short name based on "${lastUserMessage}"
- description: Brief explanation

CONNECT TO: "${defaultParentId}" (or pick better match from: ${currentNodes})

QUESTION: Ask 1 short question about "${lastUserMessage}"

SUGGESTIONS: 3 options related to "${lastUserMessage}"

Previous conversation:
${conversationSummary}

Output JSON with assistantResponse, updatedMindMap (nodes, edges), and suggestions.`;
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
      // Get the last user message prominently
      const lastUserMsg = chatHistory[chatHistory.length - 1]?.content || "";

      // Build conversation summary (excluding last message)
      const summary = chatHistory
        .slice(0, -1)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      // V40: Extract node info and find default parent
      let nodesList = "root";
      let defaultParentId = "root";
      try {
        const mapData = JSON.parse(currentMindMapJSON);
        if (mapData.nodes && Array.isArray(mapData.nodes)) {
          nodesList = mapData.nodes
            .map((n: any) => `${n.id}`)
            .join(', ');
          // Use first node (root) as default parent
          defaultParentId = mapData.nodes[0]?.id || "root";
        }
      } catch (e) {
        console.warn("Could not parse mind map");
      }

      // V40: Pre-generate a unique node ID
      const newNodeId = `node-${Date.now()}-user`;

      messages.push({
        role: "user",
        content: buildMainTurnUserMessage(initialGoal, lastUserMsg, summary, nodesList, newNodeId, defaultParentId)
      });
    }

    console.log("V39 DEBUG: Sending messages:", JSON.stringify(messages, null, 2));

    const reply = await engine.chat.completions.create({
      messages: messages as any,
      temperature: 0.7, // Higher for more creativity, less template copying
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const response = reply.choices[0].message.content || "";
    console.log("V39 DEBUG: Raw response:", response);

    return response;
  }
}

export const aiService = AIService.getInstance();


