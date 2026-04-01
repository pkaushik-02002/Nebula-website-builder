# Dynamic Agent Timeline Implementation

## Overview

The dynamic agent timeline is a **Claude Artifacts-style thinking display** that shows real-time agent reasoning in structured phases. Unlike the traditional build timeline, this provides users with transparency into what the agent is actually thinking at each step.

## Features

### 🧠 Real-Time Thinking Phases

Agent mode now displays **4 structured thinking phases**:

1. **Analysis** 🔍 - Understanding requirements
   - Reading project brief
   - Identifying core features
   - Planning architecture

2. **Planning** 📋 - Designing structure
   - Defining components
   - Planning data schemas
   - Mapping user flows

3. **Generation** ⚡ - Writing code
   - Creating application files
   - Building components and logic
   - Setting up integrations

4. **Validation** ✅ - Quality checks
   - Verifying imports and types
   - Checking code consistency
   - Validating structure

### 📊 Two-Panel Layout (Agent Mode)

When using agent mode, users see:

**Panel 1: Agent Thinking Stream** (primary focus)
- Real-time reasoning steps with phase indicators
- Current active step highlighted with shimmer animation
- Step progress counter
- Live indicator showing agent is thinking
- Expandable details for each phase

**Panel 2: Execution Progress** (secondary reference)
- High-level timeline progress (Analyze → Plan → Build → Validate)
- File generation counter
- Overall progress bar
- Current file being written

### 🎨 Visual Differentiation

| Aspect | Agent Mode | Build Mode |
|--------|-----------|-----------|
| **Primary Display** | Thinking stream | Execution timeline |
| **Color Scheme** | Blue (thinking) + Amber (execution) | Zinc (neutral) |
| **Animation** | Shimmer on active thought | Pulse on active step |
| **Details** | Reasoning and assumptions | Files touched |
| **User Focus** | "What is the agent thinking?" | "How much is done?" |

### 🔄 Real-Time Updates

The thinking stream updates dynamically as the agent progresses:

```
Start: Analysis (active)
  ↓
Analysis (complete) → Planning (active)
  ↓
Planning (complete) → Generation (active)
  ↓
Generation (complete) → Validation (complete)
```

Each step shows:
- **Status badges**: "thinking" (active) or "done" (complete)
- **Live pulse indicator**: Shows real-time activity
- **Details section**: Bullet points of what's happening
- **Smooth transitions**: Fade-in animations as steps progress

## Components

### 1. **AgentThinkingStream** (`agent-thinking-stream.tsx`)

Claude-like thinking display component. Shows:
- Structured phase cards with visual indicators
- Auto-scrolls to active step
- Progress bar with phase breakdown
- Compact and expanded views

```tsx
<AgentThinkingStream
  steps={thinkingSteps}
  isStreaming={isStreaming}
  currentPhase={activePhase}
  expandedView={true}
/>
```

### 2. **DynamicAgentTimeline** (`dynamic-agent-timeline.tsx`)

Main timeline component that differentiates between agent and build modes.

**Agent Mode** (two panels):
```tsx
<DynamicAgentTimeline
  timelineSteps={agentTimeline}
  thinkingSteps={thinkingSteps}
  isStreaming={true}
  mode="agent"
  showThinking={true}
/>
```

**Build Mode** (single panel):
```tsx
<DynamicAgentTimeline
  timelineSteps={agentTimeline}
  thinkingSteps={thinkingSteps}
  isStreaming={true}
  mode="build"
  showThinking={false}
/>
```

### 3. **Helper Functions** (`extract-thinking-steps.ts`)

Utilities for thinking step management:

- `createThinkingStep()` - Create new step
- `completeThinkingStep()` - Mark step done
- `generateImplicitThinkingSteps()` - Auto-generate based on status
- `formatThinkingStepsSummary()` - Format for display
- `groupThinkingStepsByPhase()` - Organize by phase

## State Management

### New State Variable

```tsx
const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([])
```

### ThinkingStep Type

```ts
interface ThinkingStep {
  id: string
  phase: "analysis" | "planning" | "generation" | "validation"
  title: string
  description: string
  status: "pending" | "active" | "complete" | "error"
  details?: string[]
  timestamp: number
}
```

## Integration Points

### 1. **Generation Start** (line 1897)
- Initialize `analysis` phase
- Set status to "active"
- Show initial details

### 2. **Planning Phase Transition** (line 1926)
- Complete `analysis` phase
- Activate `planning` phase
- Update details

### 3. **File Generation** (line 2015)
- Transition to `generation` phase
- Update details with current file
- Keep track of generated count

### 4. **Generation Complete** (line 2257)
- Complete all active phases
- Add `validation` phase (complete)
- Mark as finished

## User Experience Flow

**Agent Mode (with thinking):**
```
User clicks "Generate with Agent"
  ↓
1. Analysis phase (showing reasoning)
   - Agent is understanding your requirements
   - Displaying what it's analyzing
  ↓
2. Planning phase (showing reasoning)
   - Agent is designing the structure
   - Showing planning details
  ↓
3. Generation phase (showing reasoning + files)
   - Agent is writing code
   - Displaying current file
   - Progress bar updates
  ↓
4. Validation phase (complete)
   - Agent verified quality
   - Build ready
```

**vs. Build Mode (traditional):**
```
User clicks "Generate"
  ↓
Execution Timeline
  - Step 1: Writing files [=====> ]
  - Step 2: Installing deps [ ]
  - Step 3: Starting server [ ]
  ↓
Preview ready
```

## Code Examples

### Example 1: Start Generation with Thinking
```tsx
// In generateCode effect
setThinkingSteps([{
  id: "analysis-123",
  phase: "analysis",
  title: "Understanding requirements",
  description: "Analyzing your project brief",
  status: "active",
  details: ["Reading brief", "Identifying features"],
  timestamp: Date.now(),
}])
```

### Example 2: Transition Between Phases
```tsx
// When planning starts
setThinkingSteps((prev) =>
  prev.map((s) =>
    s.phase === "analysis" ? completeThinkingStep(s) : s
  ).concat({
    id: "planning-456",
    phase: "planning",
    title: "Planning structure",
    description: "Designing application architecture",
    status: "active",
    details: ["Components", "Data models", "User flows"],
    timestamp: Date.now(),
  })
)
```

### Example 3: Update Generation Details
```tsx
// When new file is being written
setThinkingSteps((prev) => {
  const genIdx = prev.findIndex((s) => s.phase === "generation")
  if (genIdx >= 0) {
    prev[genIdx] = {
      ...prev[genIdx],
      details: [`Writing: ${newFile.path}`],
    }
  }
  return [...prev]
})
```

## Visual Reference

### Agent Mode Layout
```
┌─ Agent Thinking Stream ─────────────────────┐
│ 🧠 Agent Reasoning                 Thinking  │
│ ─────────────────────────────────────────── │
│ Progress: 2/4                                │
│ [==============>        ]                    │
│                                              │
│ ✓ Analysis            done                   │
│ ● Planning            thinking (shimmer)     │
│ ○ Generation          pending               │
│ ○ Validation          pending               │
│                                              │
│ Currently: Planning structure                │
│ • Defining components                        │
│ • Planning data schemas                      │
│ • Mapping user flows                         │
└──────────────────────────────────────────────┘

┌─ Execution Progress ────────────────────────┐
│ ⚡ Execution Progress          Live           │
│ ─────────────────────────────────────────── │
│ Planning application structure               │
│ src/app/layout.tsx                           │
│                                              │
│ Execution: 1/5                               │
│ [======>                 ]                   │
│                                              │
│ Files touched: 3                             │
└──────────────────────────────────────────────┘
```

### Build Mode Layout
```
┌─ Build Progress ────────────────────────────┐
│ Build Progress                    Live       │
│ ─────────────────────────────────────────── │
│ Writing files                                │
│ src/components/Header.tsx                    │
│                                              │
│ Progress: 3/5                                │
│ [===================>         ]             │
│                                              │
│ ✓ Setup (done)                              │
│ ✓ Components (done)                         │
│ ● Utilities (thinking)                      │
│ ○ Styles (pending)                         │
│ ○ Integration (pending)                    │
│                                              │
│ Files touched: 8                             │
└──────────────────────────────────────────────┘
```

## Performance Considerations

- **Minimal re-renders**: `useRef` for tracking prevents unnecessary updates
- **Smooth animations**: CSS transitions on progress bar (500ms)
- **Auto-scroll**: Only scrolls when new step becomes active
- **Memory efficient**: Old thinking steps maintain same structure, just update status
- **No blocking**: Thinking updates happen in parallel with file writing

## Future Enhancements

1. **Streaming markers in API response**
   - Add `===THINKING:analysis=== Title | Description | details ===END===` markers
   - Parse thinking directly from agent response

2. **Detailed reasoning export**
   - Allow users to view full thinking transcript
   - Export as JSON for debugging

3. **Thinking pause/resume**
   - User can pause thinking to review
   - Resume to continue generation

4. **Phase-specific insights**
   - Show assumptions discovered during analysis
   - Highlight risks identified during planning

5. **Comparative analysis**
   - Show what agent considered but rejected
   - Transparency into decision-making

## Summary

The dynamic agent timeline transforms the agent generation experience from opaque "black box" code generation to transparent, step-by-step thinking display. Users can see exactly what the agent is reasoning about at each phase, building trust and understanding in the generation process.

This implementation maintains the existing generation pipeline while adding a sophisticated UI layer that communicates agent thinking in real-time.
