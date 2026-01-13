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
3. Ask ONE question about which aspect they want to focus on first

OUTPUT THIS JSON (fill in the <> parts with REAL content):
{
  "assistantResponse": "<your question about their priority>",
  "updatedMindMap": {
    "nodes": [
      {"id": "root", "label": "${goal.slice(0, 30)}", "description": "${goal}"},
      {"id": "aspect-1", "label": "<first important aspect>", "description": "<why this matters>"},
      {"id": "aspect-2", "label": "<second aspect>", "description": "<why this matters>"},
      {"id": "aspect-3", "label": "<third aspect>", "description": "<why this matters>"}
    ],
    "edges": [
      {"source": "root", "target": "aspect-1"},
      {"source": "root", "target": "aspect-2"},
      {"source": "root", "target": "aspect-3"}
    ]
  },
  "suggestions": ["<option about aspect 1>", "<option about aspect 2>", "<option about aspect 3>", "<other option>"]
}`;
};

/**
 * SUBSEQUENT TURNS: User input at TOP, explicit response instruction
 */
const buildMainTurnUserMessage = (
  goal: string,
  lastUserMessage: string,
  conversationSummary: string,
  currentNodes: string
): string => {
  return `=== USER JUST SAID THIS (YOU MUST RESPOND TO THIS) ===
"${lastUserMessage}"

=== PROJECT GOAL ===
${goal}

=== CONVERSATION SO FAR ===
${conversationSummary}

=== CURRENT MIND MAP NODES ===
${currentNodes}

DO THIS NOW:
1. READ what the user just said above
2. Create a NEW node about "${lastUserMessage}" 
3. Connect it to the most relevant existing node
4. Ask a DIFFERENT follow-up question about "${lastUserMessage}"

OUTPUT THIS JSON:
{
  "assistantResponse": "<your NEW question about ${lastUserMessage}>",
  "updatedMindMap": {
    "nodes": [
      {"id": "new-<timestamp>", "label": "<topic from user message>", "description": "<details about what user said>"}
    ],
    "edges": [
      {"source": "<id of related existing node>", "target": "new-<timestamp>"}
    ]
  },
  "suggestions": ["<specific option 1>", "<specific option 2>", "<specific option 3>"]
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

      messages.push({
        role: "user",
        content: buildMainTurnUserMessage(initialGoal, lastUserMsg, summary, nodesList)
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


