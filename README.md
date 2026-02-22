<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/WebLLM-On--Device_AI-blue?logo=data:image/svg+xml;base64," alt="WebLLM" />
  <img src="https://img.shields.io/badge/React_Flow-Mind_Maps-purple" alt="React Flow" />
  <img src="https://img.shields.io/badge/Firebase-Auth_%26_DB-orange?logo=firebase" alt="Firebase" />
</p>

# 🧠 Idea.ai — AI-Powered Design Thinking Mind Maps

> **Let your thoughts flow naturally.** An AI-powered ideation workspace that transforms vague goals into structured, actionable plans through conversational design thinking — all running locally in your browser with zero cloud AI costs.

---

## 🎯 What is Idea.ai?

Idea.ai is a **privacy-first brainstorming and planning tool** that combines three powerful concepts:

1. **Conversational AI** — Chat with an on-device LLM that acts as a design thinking facilitator, not just a chatbot.
2. **Dynamic Mind Mapping** — Every AI response automatically builds and expands a visual mind map with classified, color-coded nodes.
3. **Design Thinking Frameworks** — The AI doesn't just answer questions. It applies real frameworks (Empathy & Discovery, Root Cause Analysis, SCAMPER, Six Perspectives) based on what you're trying to accomplish.

### The Core Flow

```
You type a goal → AI breaks it down into structured components →
A mind map grows organically → You guide the direction →
AI applies the right framework and expands further →
You end up with a structured, visual action plan.
```

**Example:** You type *"Launch a sustainable fashion brand"* — the AI creates an initial breakdown (Target Market, Supply Chain, Brand Identity, Revenue Model), classifies each node by type (Goal, Subgoal, Task, Resource, Constraint, Metric), and then asks probing questions to go deeper on whichever branch you want to explore.

---

## ✨ Current Features

### 🤖 On-Device AI (Zero Cloud Dependency)
- Runs **Qwen 2.5** models (1.5B or 3B parameters) entirely in-browser via [WebLLM](https://github.com/mlc-ai/web-llm)
- **No API keys, no subscriptions, no data leaves your machine**
- Model switching with download progress tracking
- ~900MB download for Fast mode, ~1.8GB for Quality mode

### 🗺️ Intelligent Mind Map Engine
- **React Flow** canvas with pan, zoom, minimap, and controls
- **4 specialized node types:** Expandable (default), Question, Checklist, and Metric
- **7-class node taxonomy:** Goal, Subgoal, Task, Resource, Constraint, Metric, Idea — each with distinct color coding
- **Semantic parent matching:** New nodes automatically attach to the most relevant existing node using TF-IDF-like keyword scoring + class hierarchy compatibility
- **d3-force physics layout** with class-based clustering (goals at top, tasks in the middle, resources at the bottom)
- **Edge reconnection** — drag edges to restructure your map
- **PNG export** of the entire mind map

### 🧭 Design Thinking Frameworks
The AI automatically detects your intent and applies the right framework:

| Your Intent | Framework Applied |
|---|---|
| Starting fresh | Empathy & Discovery |
| Describing a problem | Root Cause Analysis (5 Whys) |
| Choosing between options | Six Perspectives Analysis |
| Needing ideas | Divergent Thinking |
| Improving something | SCAMPER Innovation |
| Ready to act | Journey & Task Breakdown |
| Checking assumptions | OIOR Validation |

### 🎨 Thinking Modes
Four modes that shift the AI's personality and output style:
- **🔮 Explore** — Divergent, open-ended ideation
- **🔬 Analyze** — Structured, analytical breakdown
- **🎨 Create** — Creative, unconventional approaches
- **✅ Execute** — Action-oriented task planning

### 🔐 Authentication & Persistence
- Google Sign-In via Firebase Auth
- Firestore database integration (scaffolded)
- Session-based local storage for mind map state

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1 (App Router, Turbopack) |
| Language | TypeScript |
| State Management | Zustand |
| Mind Map Rendering | @xyflow/react (React Flow) |
| Physics Layout | d3-force |
| On-Device AI | @mlc-ai/web-llm (Qwen 2.5) |
| Animations | Framer Motion |
| Auth & DB | Firebase (Auth + Firestore) |
| Styling | Tailwind CSS 3.4 + custom Zen/neumorphic design system |
| Export | html-to-image |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A modern browser with WebGPU support (Chrome 113+, Edge 113+)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd idea.ai

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start brainstorming.

### Environment Variables (Optional)

For Firebase authentication, create a `.env.local` file:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

> The app works without Firebase config — it will use mock values and skip authentication.

---

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx              # Landing page with hero, features, and CTA
│   ├── layout.tsx            # Root layout with AuthProvider
│   ├── globals.css           # Design system (Zen/neumorphic theme)
│   └── mindmap/[id]/         # Dynamic mind map workspace route
├── components/
│   ├── Chat/
│   │   └── ChatPanel.tsx     # AI chat interface with model loading
│   ├── MindMap/
│   │   ├── MindMapBoard.tsx  # React Flow canvas with controls
│   │   ├── ExpandableNode.tsx # Primary node type (expandable cards)
│   │   ├── QuestionNode.tsx  # Question-style nodes
│   │   ├── ChecklistNode.tsx # Checklist-style nodes
│   │   ├── MetricNode.tsx    # Metric/KPI nodes
│   │   └── ImageNode.tsx     # Image-based nodes
│   ├── Auth/
│   │   └── LoginButton.tsx   # Google Sign-In button
│   ├── ModelSelector.tsx     # AI model size picker
│   └── ThinkingModeSelector.tsx  # Explore/Analyze/Create/Execute toggle
├── services/
│   └── ai.ts                 # AI engine (939 lines): WebLLM integration,
│                             # prompt engineering, response parsing,
│                             # design thinking frameworks, node classification
├── lib/
│   ├── store.ts              # Zustand store: nodes, edges, messages, modes
│   └── firebase.ts           # Firebase initialization
├── hooks/
│   └── useForceLayout.ts     # d3-force physics with class-based clustering
└── contexts/
    └── AuthContext.tsx        # Firebase auth context provider
```

---

## 🔮 Roadmap: From Prototype to Productivity Tool

The following improvements would transform Idea.ai from a compelling prototype into a tool people rely on daily.

### 🟢 Phase 1 — Foundation (Reliability & Persistence)

These are critical gaps that prevent serious use:

#### 1. **Real Data Persistence**
- **Problem:** Mind maps currently live only in Zustand (in-memory) and partial localStorage. Refreshing the page or closing the tab loses everything.
- **Solution:** Save mind maps to Firestore (or IndexedDB for offline-first) with auto-save on every change. Add a "My Maps" dashboard for browsing, renaming, and deleting past sessions.

#### 2. **Cloud AI Option**
- **Problem:** WebLLM models (1.5B–3B) are impressive for on-device, but their reasoning quality is limited — they sometimes produce placeholder text, miss nuances, or repeat themselves. The initial model download (~1GB+) is also a barrier.
- **Solution:** Add an optional cloud AI backend (Gemini, GPT-4, Claude) for users who want higher-quality reasoning. Keep local AI as the privacy-first default. Use a simple API key input or proxy server.

#### 3. **Undo/Redo & Version History**
- **Problem:** There's no way to undo accidental deletions or revisit earlier states of the mind map.
- **Solution:** Implement an undo stack in the Zustand store. For deeper history, snapshot the mind map state at key moments (after each AI expansion) and allow users to rewind.

#### 4. **Manual Node Editing**
- **Problem:** Users can add and delete nodes, but can't directly edit node labels or descriptions inline.
- **Solution:** Double-click to edit any node's title and description. Add rich text support (bold, links, checklists) within node descriptions.

---

### 🟡 Phase 2 — Usability & Polish

#### 5. **Shareable & Collaborative Maps**
- Share a mind map via link (read-only or collaborative)
- Real-time multiplayer editing using Firestore listeners or Yjs/CRDT
- Comment threads on individual nodes

#### 6. **Export & Interoperability**
- Export to **Markdown**, **JSON**, **PDF**, and **OPML** (for import into other mind mapping tools)
- Import from existing outlines, bullet lists, or other mind map formats
- Integration with Notion, Google Docs, or Linear for pushing tasks from the mind map into project management tools

#### 7. **Improved Layout & Navigation**
- **Hierarchical tree layout** as an alternative to force-directed (useful for structured plans)
- **Keyboard navigation** — arrow keys to move between nodes, Enter to expand, Tab to add siblings
- **Search & filter** — find nodes by label, class, or description in large maps
- **Node grouping/clustering** — collapse subtrees, group related nodes into named clusters

#### 8. **Mobile Experience**
- The current UI is desktop-first. A responsive or dedicated mobile layout would make the tool usable for capturing ideas on-the-go.
- Consider a simplified "capture mode" on mobile — quick voice/text input that gets mind-mapped later on desktop.

---

### 🔴 Phase 3 — Intelligence & Differentiation

#### 9. **Smarter AI Context**
- **Problem:** The AI currently has limited context — it sees the existing node labels but not the full tree structure, hierarchy, or user's editing patterns.
- **Solution:** Feed the AI a richer representation of the map (tree structure, which branch the user is focused on, recently modified nodes). This would let it make much more relevant suggestions.

#### 10. **AI-Powered Map Analysis**
- "Summarize this mind map" — generate an executive summary or brief from the entire map
- "Find gaps" — AI identifies areas of the plan that are underdeveloped
- "Prioritize" — AI suggests which branches to focus on first based on dependencies and constraints
- "Challenge my assumptions" — AI plays devil's advocate on the current plan

#### 11. **Templates & Starter Maps**
- Pre-built templates for common use cases: Product Launch, Business Plan, Research Paper, Event Planning, Learning Roadmap, Decision Matrix
- "Fork a template" to customize it for your specific goal

#### 12. **Multi-Modal Nodes**
- Attach **images**, **links**, **files**, and **embedded content** to nodes
- **Voice input** — speak your thoughts and the AI creates nodes from speech
- **Sketch nodes** — simple drawing within a node for wireframes or diagrams

#### 13. **Smart Notifications & Reminders**
- Convert Task-type nodes into actual to-do items with deadlines
- Optional reminders and progress tracking
- Integration with calendar apps for milestone nodes

#### 14. **Analytics & Reflection**
- Track how your thinking evolves over time
- Visualize ideation patterns: "You tend to under-develop resource planning"
- Session summaries: "In this session, you expanded 3 branches and added 12 nodes"

---

### 🏗️ Technical Improvements

| Area | Improvement |
|---|---|
| **Testing** | Add unit tests for AI response parsing, store mutations, and node hierarchy logic |
| **Error Handling** | Graceful fallbacks when WebLLM fails to load (GPU not available, model download interrupted) |
| **Performance** | Virtualize the React Flow canvas for maps with 100+ nodes; debounce force layout updates |
| **Accessibility** | ARIA labels on all interactive elements, keyboard-only navigation, screen reader support |
| **SEO** | Add proper meta tags, Open Graph images, and a blog/docs section |
| **PWA** | Make it installable as a Progressive Web App with offline support via Service Workers |
| **CI/CD** | GitHub Actions for linting, type-checking, and automated deployment to Vercel |

---

## 🤝 Contributing

Contributions are welcome! If you'd like to work on any of the roadmap items above, please open an issue first to discuss the approach.

## 📄 License

This project is private. All rights reserved.
