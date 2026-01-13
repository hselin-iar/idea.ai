import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

// ============================================================================
// V39: DEEP FIX - System messages, step-by-step, no template copying
// ============================================================================

/**
 * System message that defines the AI's core behavior
 */
const SYSTEM_MESSAGE = `You are a mind map planning assistant. Your ONLY job is to:
1. Ask SHORT questions to understand the user's project
2. Create mind map nodes based on their answers
3. NEVER repeat questions
4. ALWAYS respond to what the user just said

You output JSON only. Never output placeholder text like "Focus area 1" - always use REAL content based on the user's goal.`;

/**
 * FIRST TURN: Simple instructions, no template to copy
 */
const buildFirstTurnUserMessage = (goal: string): string => {
  return `The user's goal is: "${goal}"

DO THIS NOW:
1. Think of 3-4 important aspects of this specific goal
2. Create a mind map with these topics as nodes
3. Write a question asking which aspect they want to focus on

IMPORTANT: The "assistantResponse" field MUST contain your question as a string, not null!

OUTPUT JSON:
{
  "assistantResponse": "Which of these aspects would you like to focus on first: [aspect1], [aspect2], or [aspect3]?",
  "updatedMindMap": {
    "nodes": [
      {"id": "root", "label": "${goal.slice(0, 30)}", "description": "${goal}"},
      {"id": "aspect-1", "label": "[first topic]", "description": "[why it matters]"},
      {"id": "aspect-2", "label": "[second topic]", "description": "[why it matters]"},
      {"id": "aspect-3", "label": "[third topic]", "description": "[why it matters]"}
    ],
    "edges": [
      {"source": "root", "target": "aspect-1"},
      {"source": "root", "target": "aspect-2"},
      {"source": "root", "target": "aspect-3"}
    ]
  },
  "suggestions": ["[topic 1]", "[topic 2]", "[topic 3]", "Something else"]
}`;
};

/**
 * SUBSEQUENT TURNS: Pre-generate node ID, explicit topic extraction
 */
const buildMainTurnUserMessage = (
  goal: string,
  lastUserMessage: string,
  conversationSummary: string,
  currentNodes: string,
  newNodeId: string
): string => {
  // Extract a short topic from user message (first 30 chars or up to first punctuation)
  const shortTopic = lastUserMessage.slice(0, 40).split(/[.,!?]/)[0].trim();

  return `USER SAID: "${lastUserMessage}"

CREATE THIS NODE:
- id: "${newNodeId}"  
- label: A short name for "${shortTopic}"
- description: What the user wants to know about this

CONNECT IT TO: Pick the most relevant node from this list:
${currentNodes}

ASK A SHORT QUESTION (1 sentence max) about "${shortTopic}"

CONVERSATION CONTEXT:
${conversationSummary}

OUTPUT JSON:
{
  "assistantResponse": "[Your 1-sentence question about ${shortTopic}]",
  "updatedMindMap": {
    "nodes": [
      {"id": "${newNodeId}", "label": "[Short name for ${shortTopic}]", "description": "[What user wants]"}
    ],
    "edges": [
      {"source": "[pick from node list above]", "target": "${newNodeId}"}
    ]
  },
  "suggestions": ["[option 1]", "[option 2]", "[option 3]"]
}`;
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

      // Extract node labels for reference
      let nodesList = "root";
      try {
        const mapData = JSON.parse(currentMindMapJSON);
        if (mapData.nodes && Array.isArray(mapData.nodes)) {
          nodesList = mapData.nodes
            .map((n: any) => `- ${n.id}: "${n.label}"`)
            .join('\n');
        }
      } catch (e) {
        console.warn("Could not parse mind map");
      }

      // V39.2: Pre-generate a unique node ID
      const newNodeId = `node-${Date.now()}-user`;

      messages.push({
        role: "user",
        content: buildMainTurnUserMessage(initialGoal, lastUserMsg, summary, nodesList, newNodeId)
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


