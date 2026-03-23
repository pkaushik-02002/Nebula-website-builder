# AGENTS.md

## Purpose

This repository is a production-quality AI website/app builder called **BuildKit / Nebula Website Builder**.

Agents working in this repo must behave like **senior product engineers**, not junior code generators.

That means:
- do not hallucinate product behavior
- do not invent requirements
- do not hardcode flows that should be state-driven
- do not add static lists, repeated mapping logic, or brittle `if/else` trees when the behavior should be derived from data/state
- do not duplicate UI, business logic, copy, or derived state
- do not create internal-tool dashboards for founder-facing flows
- do not make architectural changes unless required by the task

When something is unclear, **ask concise clarifying questions first** rather than guessing.

---

## Product overview

BuildKit / Nebula Website Builder is an AI website/app builder.

High-level architecture:
- Firestore `projects` documents hold project state
- `/api/generate` performs AI code generation and iterative edits
- `/api/sandbox` handles preview runtime through E2B
- `projectId` is the Firestore document ID in `projects`
- existing project edits are full-context regenerations using:
  - original prompt
  - current user request
  - current file set
- the project builder UI lives in `app/project/[id]/page.tsx`
- the landing page assistant is separate from project code generation

Two AI systems exist:
1. **Main builder AI**
   - code generation/editing
   - driven by `/api/generate`
2. **Website assistant**
   - landing-page assistant
   - separate from the builder generation flow

These must not be conflated.

---

## Non-negotiable architectural rules

Preserve these unless the task explicitly requires otherwise:

- `projectId` is the Firestore doc ID in `projects`
- project generation remains driven by `/api/generate`
- preview/runtime remains driven by `/api/sandbox`
- post-approval build flow must reuse the existing generation pipeline where possible
- do not rewrite server routes when the task is clearly UI/UX-only
- do not create parallel systems when existing ones can be extended cleanly
- do not fork the builder into duplicate versions for different states unless unavoidable

When changing UI behavior, prefer **front-end orchestration changes** over backend rewrites.

---

## Working style expected from agents

Before changing code:

1. inspect the current implementation
2. summarize the existing structure that matters
3. identify what should be preserved
4. identify the minimal safe refactor strategy
5. only then implement

Do not jump straight into code without first understanding the current structure.

For non-trivial tasks:
- explain the intended hierarchy/state flow first
- keep implementation scoped
- do not mix refactor + redesign + behavior change unless requested

---

## Clarification rule

If a request has ambiguity around:
- user flow
- approval semantics
- button meaning
- state transitions
- whether something should be shown or hidden
- whether logic should be UI-only vs backend-backed

ask a **small number of high-value clarifying questions** first.

Do not assume the missing behavior.

Examples of good clarification:
- “Should this button mean approve-and-generate-plan, or approve-and-build?”
- “Should this summary appear before requirements are complete, or only after approval?”
- “Should this remain local UI state, or be persisted to the project document?”

Examples of bad behavior:
- inventing a flow
- hardcoding one interpretation
- implementing both paths without reason
- adding speculative state fields

---

## UI / UX philosophy

This product is aimed at users including **non-technical founders**, not only developers.

Founder-facing UI must feel:
- calm
- clear
- premium
- focused
- modern
- restrained
- intelligent

It must **not** feel like:
- an internal tool
- an agent control room
- a dashboard full of metrics/chips/cards
- a Jira-style planning interface
- a cluttered SaaS template
- a raw IDE too early in the flow

### Design rules
- prefer one primary surface and one supporting surface
- reduce container count
- avoid deeply nested cards
- avoid repeated bordered panels inside bordered panels
- rely more on spacing, typography, and hierarchy than decorative boxes
- keep the number of simultaneously visible concepts low
- do not surface technical jargon to non-technical users

### Copy rules
Do not use internal/product-designer copy in the UI.

Avoid copy like:
- “source of truth”
- “agent conversation”
- “highest-impact unknowns”
- “readiness 78%”
- “planning artifact”
- “control panel”
- “state machine”

Prefer simple, natural copy like:
- “What we’re building”
- “What still needs your input”
- “Before I build”
- “Pages included”
- “Style direction”
- “One thing to confirm”

---

## Pre-build planning flow rules

For new/pending projects, the default behavior is **requirements-first**.

The assistant must not rush into generation from a vague prompt.

### Intended default flow
1. AI asks clarifying questions
2. user answers
3. no blueprint/plan is shown yet unless explicitly required by the product spec
4. once enough context exists, the user approves the answers
5. then the system generates the plan/blueprint
6. after that, the user can refine the plan
7. only then should the user build from the plan

### Important
Do not silently collapse:
- answering questions
- generating the plan
- approving the plan
- building the project

These are distinct states unless explicitly designed otherwise.

### Skip behavior
If the product includes a `Skip plan` path:
- it must be explicit
- it must not be the default
- it may move faster, but should not silently replace the default careful flow

---

## Maintainability rules

Agents must write maintainable code.

### Never do this
- add brittle one-off `if/else` chains for content generation when the same logic should be derived from configuration, schema, or state
- hardcode UI options that should come from structured data
- duplicate type definitions
- duplicate transformation logic in multiple components
- store derived state that can be computed cheaply from canonical state
- repeat the same strings/copy in many places
- add ad hoc helper logic inside large components if it belongs in a shared utility
- patch by copy-pasting near-identical code blocks
- add “temporary” logic that becomes permanent clutter

### Prefer this instead
- config-driven structures
- data-first rendering
- pure utility functions for transformations
- canonical source of truth
- derived selectors/helpers
- reusable components with clear responsibilities
- discriminated unions / typed state where appropriate
- single-purpose utilities in `lib/*` when logic is shared
- minimal public API surfaces between components

### Strong rule
If you find yourself writing long chains like:
- `if key === "pages" ...`
- `if key === "systems" ...`
- `if type === "x" ... else if type === "y" ...`
- static options with many manual branches

stop and ask:
**should this be represented as data/config instead?**

In most cases here, the answer is yes.

---

## State management rules

Before adding state, ask:

1. Is this canonical state or derived state?
2. Should this live locally in the component?
3. Should this be lifted?
4. Should this be computed from existing `project`/`blueprint`/messages instead of stored?
5. Is this UI state or business state?

Do not store duplicated state if it can be derived.

Examples:
- visibility flags that can be derived from planning status should not also become independent truth unless needed for animation/transition control
- labels like “plan ready” should be computed, not manually synchronized in many places
- duplicate copies of blueprint/summary/open questions should not exist in component state if the source object already owns them

---

## Component design rules

Components must be:
- single-purpose
- composable
- easy to reason about
- low-noise
- appropriately typed

### Prefer
- smaller presentational components
- extracted render helpers only when they improve clarity
- moving business logic out of UI components into utilities/hooks where appropriate

### Avoid
- giant components that contain UI, domain logic, copy rules, parsing, transformation, and orchestration all mixed together
- helper functions embedded in components when they are reused or domain-specific
- local utility logic duplicated across similar files

---

## Domain modeling rules

When product structure exists, represent it explicitly.

If the system has concepts like:
- planning stages
- blueprint sections
- question states
- approval states
- action availability

prefer:
- typed models
- config objects
- explicit maps
- reusable selectors

Avoid informal scattered logic spread across the component tree.

---

## Hardcoding and static data rules

Do not hardcode static option lists inside UI components unless they are:
- truly fixed product copy
- tiny and local
- not domain data
- not likely to be reused
- clearly not part of application behavior

If options, labels, section definitions, or behavior mappings are part of the product model, move them into:
- `lib/*`
- typed config files
- shared constants near the domain model

### Example anti-pattern
A component containing a large static list of options plus custom `if/else` formatting branches.

### Preferred pattern
A structured config map with typed metadata:
- key
- label
- selection mode
- helper copy
- formatter
- parser
- option derivation strategy

---

## Duplication rules

Agents must actively look for duplication before finalizing code.

Check for duplication in:
- copy
- derived state
- formatting logic
- data normalization
- section definitions
- status labeling
- button logic
- mobile/desktop rendering branches

If the same rule appears in two places, consider centralizing it.

Do not solve a problem once in the component and again in `lib/*` with slightly different logic.

---

## Senior engineering bar

Changes in this repo should feel like they were written by a senior engineer.

That means:
- clear separation of concerns
- explicit tradeoffs
- minimal moving parts
- no accidental complexity
- no “just make it work” patches
- no speculative abstractions
- no junior-style hardcoded decision trees when the domain can be modeled cleanly

A solution is **not acceptable** just because it works.
It must also be:
- understandable
- maintainable
- extensible
- consistent with the architecture

---

## Visual/theme rules

Use the existing BuildKit theme and visual language.

Do not invent a new palette.

Keep the UI aligned with the existing brand:
- off-white / ivory backgrounds
- deep charcoal foreground
- light neutral borders / muted surfaces
- premium minimal aesthetic

Avoid:
- neon AI colors
- generic dashboard chromes
- visually loud gradients
- excessive glassmorphism
- over-styled cards everywhere

Use subtle motion only where it improves clarity.

---

## File and folder expectations

When refactoring builder UI, prefer clean component extraction under:
- `components/project/*`

When extracting domain logic, prefer:
- `lib/*`
- typed helpers/selectors near the relevant domain

Do not create random utility files without clear ownership.

---

## PR / patch expectations for agents

For meaningful tasks, the agent should structure its response as:

1. **Current structure**
   - what exists now
   - what matters
2. **Problems**
   - what is wrong / risky / cluttered / duplicated
3. **Refactor plan**
   - minimal safe path
4. **Implementation**
   - code changes
5. **Why this is better**
   - maintainability / UX / clarity

Do not dump code without explaining the structure first.

---

## When asked for UI changes

Agents must be careful not to:
- redesign unrelated areas
- introduce duplicate interaction systems
- add dashboards where a simple flow is needed
- surface too much state at once
- make founder-facing flows too technical

For any first-run or pre-build experience, optimize for:
1. what we are building
2. what still needs user input
3. what the user should do next

If an element does not clearly support one of those goals, it is probably unnecessary.

---

## When asked for logic changes

Agents must:
- identify the canonical source of truth
- avoid deriving from text heuristics if a stronger model already exists
- avoid encoding product behavior in fragile string parsing if a typed state/config solution is possible
- avoid mixing parsing logic into UI components

If the logic involves:
- blueprint sections
- planning states
- guided options
- question sequencing
- plan/build transitions

prefer robust typed config/state-driven design over scattered conditional logic.

---

## Do not guess from prompt text when a product state should exist

Heuristic text parsing should be a last resort, not the default architecture.

If the app needs structured information such as:
- target audience
- pages
- features
- style
- integrations
- approval state
- question completion state

prefer an explicit structured model over repeatedly parsing freeform prompt strings.

If you must use heuristics temporarily:
- isolate them clearly
- keep them small
- do not spread them across the codebase
- mark them as transitional if appropriate
- avoid pretending they are a durable domain model

---

## Code review checklist for agents

Before finalizing, check:

### Product / UX
- Is the flow correct?
- Did I assume anything not explicitly confirmed?
- Is the UI calm and founder-friendly?
- Did I avoid clutter and duplicate information?
- Is the next action obvious?

### Architecture
- Did I preserve core route/data assumptions?
- Did I avoid unnecessary backend changes?
- Did I avoid duplicate systems?

### Maintainability
- Did I introduce hardcoded lists that should be config-driven?
- Did I write brittle `if/else` trees where structured mappings would be better?
- Did I duplicate logic or copy?
- Did I store derived state unnecessarily?
- Is the code easy to extend?

### Components
- Are responsibilities clear?
- Is domain logic separated from UI where needed?
- Did I avoid giant mixed-responsibility components?

If any answer is weak, revise before finalizing.

---

## Preferred agent behavior summary

Be:
- careful
- explicit
- minimal
- senior
- maintainable
- product-minded

Do not be:
- speculative
- assumption-heavy
- dashboard-happy
- duplicate-prone
- junior-style
- hardcode-first

When unsure, ask.
When possible, simplify.
When implementing, preserve architecture.
When designing, prioritize clarity over cleverness.