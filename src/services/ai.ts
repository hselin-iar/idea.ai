import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

// ============================================================================
// V38: COMPREHENSIVE FIX - Connected nodes, rich descriptions, no repetition
// ============================================================================

/**
 * FIRST TURN: Create initial structure with rich descriptions
 */
const buildFirstQuestionPrompt = (initialGoal: string): string => {
  return `You are a project planning AI. The user wants to: "${initialGoal}"

Create an initial mind map and ask ONE opening question.

RULES:
1. Create 3-4 SPECIFIC starter topics (not generic "Who/What/How")
2. Each node MUST have a DETAILED description (2-3 sentences minimum)
3. Your question should help understand their priorities

RESPOND WITH ONLY THIS JSON:
{
  "assistantResponse": "Ask about their top priority or main focus area",
  "updatedMindMap": {
    "nodes": [
      {"id": "root", "label": "${initialGoal.slice(0, 25)}...", "description": "${initialGoal}"},
      {"id": "topic-1", "label": "Specific Topic", "description": "Detailed explanation of this topic and why it matters for the project"},
      {"id": "topic-2", "label": "Another Topic", "description": "Detailed explanation of this topic and its importance"},
      {"id": "topic-3", "label": "Third Topic", "description": "Detailed explanation and context"}
    ],
    "edges": [
      {"source": "root", "target": "topic-1"},
      {"source": "root", "target": "topic-2"},
      {"source": "root", "target": "topic-3"}
    ]
  },
  "suggestions": ["Focus area 1", "Focus area 2", "Focus area 3", "Something else"]
}`;
};

/**
 * MAIN TURNS: Expand the SINGLE mind map with connected nodes
 */
const buildMainPrompt = (
  initialGoal: string,
  fullChatHistory: string,
  currentMindMap: string,
  existingNodesList: string
): string => {
  return `You are a project planning AI helping with: "${initialGoal}"

=== FULL CONVERSATION (DO NOT ASK THE SAME QUESTIONS AGAIN) ===
${fullChatHistory}

=== CURRENT MIND MAP (USE THESE EXACT IDs TO CONNECT NEW NODES) ===
${currentMindMap}

=== EXISTING NODE IDs YOU CAN CONNECT TO ===
${existingNodesList}

=== YOUR TASK ===
1. Read the user's LAST message
2. Add NEW nodes based on what they said
3. Connect new nodes to the MOST RELEVANT existing node ID from the list above
4. Ask a DIFFERENT follow-up question (check conversation above - do NOT repeat!)
5. Update descriptions of existing nodes if the user gave new context

=== CRITICAL RULES ===
- NEVER repeat a question from the conversation above
- EVERY new node MUST connect to an existing node ID from the list
- Descriptions must be DETAILED (2+ sentences)
- If user answered about "Technology", ask about SPECIFIC tech choices
- If user answered about "Users", ask about SPECIFIC user needs
- Always progress the conversation forward

=== REQUIRED JSON OUTPUT ===
{
  "assistantResponse": "Your NEW question that digs deeper into what user just said",
  "updatedMindMap": {
    "nodes": [
      {"id": "new-node-1", "label": "Topic from user", "description": "Detailed description based on what user said, at least 2 sentences explaining this aspect"}
    ],
    "edges": [
      {"source": "EXISTING_NODE_ID_FROM_LIST", "target": "new-node-1"}
    ],
    "nodeUpdates": [
      {"id": "existing-node-id", "description": "Updated description with new context from user"}
    ]
  },
  "suggestions": ["Specific option 1", "Specific option 2", "Specific option 3"]
}`;
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
      // V38: Use FULL history for proper context tracking
      const historyString = chatHistory
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

      // V38: Extract existing node IDs for the AI to connect to
      let existingNodesList = "root";
      try {
        const mapData = JSON.parse(currentMindMapJSON);
        if (mapData.nodes && Array.isArray(mapData.nodes)) {
          existingNodesList = mapData.nodes
            .map((n: any) => `- ${n.id}: "${n.label}"`)
            .join('\n');
        }
      } catch (e) {
        console.warn("Could not parse mind map for node list");
      }

      prompt = buildMainPrompt(initialGoal, historyString, currentMindMapJSON, existingNodesList);
    }

    const reply = await engine.chat.completions.create({
      messages: [{ role: "user", content: prompt }] as any,
      temperature: 0.3,
      max_tokens: 600, // Increased for richer descriptions
      response_format: { type: "json_object" },
    });

    return reply.choices[0].message.content || "";
  }
}

export const aiService = AIService.getInstance();

