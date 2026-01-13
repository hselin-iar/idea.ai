import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

// ============================================================================
// V41: PROACTIVE AI - Suggests options, correct JSON format, contextual links
// ============================================================================

/**
 * System message - AI should SUGGEST, not just ask
 */
const SYSTEM_MESSAGE = `You are a proactive planning assistant. Your job is to:
1. SUGGEST specific options based on your knowledge (don't just ask questions)
2. When user asks about tech, RECOMMEND specific technologies
3. Create mind map nodes with your suggestions
4. Keep questions SHORT (1 sentence)

Example: If user asks "what tech stack?", suggest: "For a SaaS, I recommend React + Node.js + PostgreSQL. Which area: frontend, backend, or database?"

CRITICAL: Your JSON must have this EXACT structure:
- updatedMindMap.nodes: ARRAY of node objects
- updatedMindMap.edges: ARRAY of edge objects
Never use node IDs as object keys.`;

/**
 * FIRST TURN: Exact format with arrays
 */
const buildFirstTurnUserMessage = (goal: string): string => {
  return `GOAL: "${goal}"

Create initial mind map with 3 topics. SUGGEST specific things based on your knowledge.

REQUIRED JSON FORMAT:
{
  "assistantResponse": "Your question mentioning the actual topics",
  "updatedMindMap": {
    "nodes": [
      {"id": "root", "label": "${goal.slice(0, 25)}", "description": "${goal}"},
      {"id": "aspect-1", "label": "REAL TOPIC NAME", "description": "Why this matters"},
      {"id": "aspect-2", "label": "REAL TOPIC NAME", "description": "Why this matters"},
      {"id": "aspect-3", "label": "REAL TOPIC NAME", "description": "Why this matters"}
    ],
    "edges": [
      {"source": "root", "target": "aspect-1"},
      {"source": "root", "target": "aspect-2"},
      {"source": "root", "target": "aspect-3"}
    ]
  },
  "suggestions": ["Topic 1 name", "Topic 2 name", "Topic 3 name", "Other"]
}

Remember: nodes and edges must be ARRAYS, not objects with ID keys.`;
};

/**
 * SUBSEQUENT TURNS: Proactive suggestions, contextual parent
 */
const buildMainTurnUserMessage = (
  goal: string,
  lastUserMessage: string,
  conversationSummary: string,
  nodesList: string,
  newNodeId: string,
  suggestedParentId: string,
  suggestedParentLabel: string
): string => {
  return `USER: "${lastUserMessage}"

BE PROACTIVE: If user asks about tech/tools, SUGGEST specific ones (React, Node.js, etc.)
Don't just ask - provide your recommendations!

NEW NODE: id="${newNodeId}", label based on "${lastUserMessage}"
PARENT: Connect to "${suggestedParentId}" (${suggestedParentLabel}) or pick closer match from: ${nodesList}

REQUIRED JSON (nodes and edges must be ARRAYS):
{
  "assistantResponse": "Short question OR your recommendation",
  "updatedMindMap": {
    "nodes": [{"id": "${newNodeId}", "label": "Topic Name", "description": "Details"}],
    "edges": [{"source": "${suggestedParentId}", "target": "${newNodeId}"}]
  },
  "suggestions": ["Specific option 1", "Specific option 2", "Specific option 3"]
}

Context: ${conversationSummary}`;
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

      // V41: Find contextually best parent node
      let nodesList = "root";
      let suggestedParentId = "root";
      let suggestedParentLabel = "root";

      try {
        const mapData = JSON.parse(currentMindMapJSON);
        if (mapData.nodes && Array.isArray(mapData.nodes)) {
          nodesList = mapData.nodes
            .map((n: any) => `${n.id}: "${n.label}"`)
            .join(', ');

          // V41: Find best parent by checking if user message relates to any node label
          const userMsgLower = lastUserMsg.toLowerCase();
          let bestMatch = mapData.nodes[0]; // default to root

          for (const node of mapData.nodes) {
            const label = (node.data?.label || node.label || "").toLowerCase();
            // Check if user message contains node label or vice versa
            if (label && (userMsgLower.includes(label) || label.includes(userMsgLower.split(' ')[0]))) {
              bestMatch = node;
              break;
            }
          }

          suggestedParentId = bestMatch.id || "root";
          suggestedParentLabel = bestMatch.data?.label || bestMatch.label || "root";
        }
      } catch (e) {
        console.warn("Could not parse mind map");
      }

      // V41: Pre-generate a unique node ID
      const newNodeId = `node-${Date.now()}-user`;

      messages.push({
        role: "user",
        content: buildMainTurnUserMessage(initialGoal, lastUserMsg, summary, nodesList, newNodeId, suggestedParentId, suggestedParentLabel)
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


