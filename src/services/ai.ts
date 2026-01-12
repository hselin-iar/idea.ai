import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

// ============================================================================
// V33: PATTERN-BASED EXPANSION (Generalized Fix)
// ============================================================================

/**
 * FIRST TURN: Create structure and ask to expand on the goal
 */
const buildFirstQuestionPrompt = (initialGoal: string): string => {
  return `Goal: "${initialGoal}"

You are helping plan this project. Create a mind map structure and ask ONE question to understand more.

OUTPUT FORMAT:
{
  "assistantResponse": "Ask what specific aspect they want to focus on first",
  "updatedMindMap": {
    "nodes": [
      {"id": "root", "label": "${initialGoal.slice(0, 30)}", "description": "${initialGoal}"},
      {"id": "who", "label": "Who", "description": "Target users"},
      {"id": "what", "label": "What", "description": "Features and scope"},
      {"id": "how", "label": "How", "description": "Implementation"}
    ],
    "edges": [
      {"source": "root", "target": "who"},
      {"source": "root", "target": "what"},
      {"source": "root", "target": "how"}
    ]
  },
  "suggestions": ["Who uses it", "Main features", "Technology", "Timeline", "Budget"]
}`;
};

/**
 * MAIN TURNS: Expand on whatever the user mentioned
 */
const buildMainPrompt = (initialGoal: string, chatHistory: string, currentMindMap: string): string => {
  return `Goal: "${initialGoal}"

CHAT:
${chatHistory}

MAP: ${currentMindMap}

PATTERN: When the user mentions something, EXPAND on it.
- If they mention a TOPIC, ask about its DETAILS or SUB-PARTS
- If they give a DETAIL, ask for MORE SPECIFICS or NEXT STEPS
- Always dig DEEPER into what they said

The user just said something. Read their LAST message.
1. Create a node for what they mentioned
2. Ask a question to break it down further

JSON:
{
  "assistantResponse": "Question that expands on what user said",
  "updatedMindMap": {
    "nodes": [{"id": "topic-id", "label": "Topic from user", "description": "Details"}],
    "edges": [{"source": "parent-id", "target": "topic-id"}]
  },
  "suggestions": ["Sub-topic 1", "Sub-topic 2", "Sub-topic 3", "Sub-topic 4", "Sub-topic 5"]
}

RULE: Your question must be about what the user JUST SAID. Expand their topic.`;
};


// ============================================================================
// AI SERVICE - FAST
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

    let prompt: string;

    if (isFirstTurn) {
      prompt = buildFirstQuestionPrompt(initialGoal);
    } else {
      const historyString = chatHistory
        .slice(-4) // Only last 4 messages for speed
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
      prompt = buildMainPrompt(initialGoal, historyString, currentMindMapJSON);
    }

    const reply = await engine.chat.completions.create({
      messages: [{ role: "user", content: prompt }] as any,
      temperature: 0.3, // Lower for predictability
      max_tokens: 400, // REDUCED for speed
      response_format: { type: "json_object" },
    });

    return reply.choices[0].message.content || "";
  }
}

export const aiService = AIService.getInstance();

