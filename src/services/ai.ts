import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

// ============================================================================
// V37: FIXED PROMPTS - No hardcoded IDs, proper context tracking
// ============================================================================

/**
 * FIRST TURN: Create initial structure and ask opening question
 * Key fix: Use timestamp-based IDs, not hardcoded "who/what/how"
 */
const buildFirstQuestionPrompt = (initialGoal: string): string => {
  const timestamp = Date.now();
  return `You are an AI assistant helping to plan a project. The user's goal is: "${initialGoal}"

Your task:
1. Create an initial mind map structure with 3-4 starter topics related to this goal
2. Ask ONE focused question to understand more about their project

CRITICAL RULES:
- Use UNIQUE node IDs like "node-${timestamp}-1", "node-${timestamp}-2", etc.
- NEVER use generic IDs like "who", "what", "how", "root"
- The root node ID must be exactly "root"
- Create relevant starter topics based on the SPECIFIC goal, not generic categories

OUTPUT FORMAT (JSON only):
{
  "assistantResponse": "Your opening question here",
  "updatedMindMap": {
    "nodes": [
      {"id": "root", "label": "${initialGoal.slice(0, 30)}", "description": "${initialGoal}"},
      {"id": "node-${timestamp}-1", "label": "Relevant Topic 1", "description": "Brief description"},
      {"id": "node-${timestamp}-2", "label": "Relevant Topic 2", "description": "Brief description"},
      {"id": "node-${timestamp}-3", "label": "Relevant Topic 3", "description": "Brief description"}
    ],
    "edges": [
      {"source": "root", "target": "node-${timestamp}-1"},
      {"source": "root", "target": "node-${timestamp}-2"},
      {"source": "root", "target": "node-${timestamp}-3"}
    ]
  },
  "suggestions": ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"]
}`;
};

/**
 * SUBSEQUENT TURNS: Expand based on user's response
 * Key fixes: 
 * - Clear instruction to NOT repeat questions
 * - Create only NEW nodes for new information
 * - Track what's already in the map
 */
const buildMainPrompt = (initialGoal: string, chatHistory: string, currentMindMap: string): string => {
  const timestamp = Date.now();
  return `You are an AI assistant helping plan: "${initialGoal}"

CONVERSATION SO FAR:
${chatHistory}

CURRENT MIND MAP STATE:
${currentMindMap}

YOUR TASK:
1. Read the user's LAST message carefully
2. Create a NEW node for what they mentioned (if it's new information)
3. Ask a NEW follow-up question that DIGS DEEPER into what they just said
4. Provide relevant quick-reply suggestions

CRITICAL RULES:
- NEVER repeat a question you already asked (check conversation history)
- NEVER create nodes that already exist in the mind map
- Use UNIQUE IDs like "node-${timestamp}-1" for any new nodes
- Only add nodes for genuinely NEW information from the user
- Your question must be about what the user JUST SAID, not about something else
- If the user gave a short answer like "Technology", expand on THAT topic specifically

OUTPUT FORMAT (JSON only):
{
  "assistantResponse": "Your NEW question about what user just said",
  "updatedMindMap": {
    "nodes": [
      {"id": "node-${timestamp}-1", "label": "Topic from user's message", "description": "Details about this"}
    ],
    "edges": [
      {"source": "parent-node-id", "target": "node-${timestamp}-1"}
    ]
  },
  "suggestions": ["Sub-topic 1", "Sub-topic 2", "Sub-topic 3", "Sub-topic 4"]
}

IMPORTANT: If there's nothing new to add to the map, return empty nodes/edges arrays.`;
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

