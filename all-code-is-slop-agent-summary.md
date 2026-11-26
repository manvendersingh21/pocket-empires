# Video Summary & Agent Reference: "All Code Is Slop (Except Mine)" — Lauren Tan (SpaceXSI)

- **Source Video:** [All Code Is Slop (Except Mine) — Lauren Tan, SpaceXSI](http://www.youtube.com/watch?v=O_zcc6Xl12g)
- **Speaker:** Lauren Tan ("poteto"), Grok Bot team at SpaceXSI
- **Event / Channel:** AI Engineer (Published: 2026-11-14 | Duration: 17:32)
- **Purpose:** Structured engineering reference and actionable ruleset for AI coding agents and human-in-the-loop agentic workflows.

---

## 1. Core Thesis: Building High-Trust Agent Environments

The modern software engineering meta is maintaining or improving code quality while scaling productivity via AI agents [00:01:11]. Rather than relying on blind trust or bloated prompt instructions, engineers must invest in the **agent's environment** so agents produce correct, high-quality code by default [00:01:32].

### The Trust Hierarchy (Inverse Pyramid)
Spend engineering effort from the bottom (most deterministic) up to the top (least deterministic) [00:02:04]:

1. **Codebase Architecture & API Design (Deterministic):** Clean abstractions, refactoring, and conventional directory structures that make the right pattern the path of least resistance [00:02:13].
2. **Static Analysis & Automated Testing (Deterministic):** Custom lint rules, strict type systems, compilers, dependency graph analyzers, and unit/property-based tests that block anti-patterns automatically [00:02:22].
3. **Runtime & Formal Verification (Semi-Deterministic / Automated):** Giving agents tools to execute and inspect the running app (Chrome DevTools Protocol, custom CLIs), formal model checking (TLA+, Lean), and UI property-based fuzzing (Bombadil) [00:02:36].
4. **Prose & Prompting (Non-Deterministic — Use Sparingly):** `AGENTS.md`, rules, skills, and documentation reserved strictly for high-level judgment [00:02:49].

> **Golden Rule for Agent Corrections:** Every time an agent makes a mistake, convert the correction into a **deterministic check** (lint rule, type constraint, or API refactor) rather than adding another line to `AGENTS.md` or rules files [00:03:13].

---

## 2. Codebase as a Garden (Input Hygiene)

- **Codebase = Largest Input:** Agents generate outputs based on existing patterns in the repository. Any workaround, deprecated pattern, or tech debt left in the codebase acts like a weed that agents will copy and multiply across hundreds of PRs [00:04:25].
- **Ban Nuance-Heavy APIs:** APIs that require subtle human judgment to use safely (e.g., React's `useEffect`) consistently produce agent "slop." Ban them in product code via lint rules and encapsulate them inside safe, opinionated framework primitives (such as Grok Bot's internal Electron framework, *Dune*) [00:05:33].
- **Context Through Directory Structure:** Encode architectural boundaries directly into folder names and enforce them with dependency graph analyzers. For example, separating `electron-renderer` and `electron-main` at the top level and banning cross-imports prevents agents from accidentally blocking the UI thread [00:06:15].
- **Ban Code Comments & Escape Hatches:** Grok Bot banned ~99% of code comments [00:08:26]. Comments go stale, cannot be enforced, and give agents an "escape hatch" to write lengthy justifications for hacky workarounds (e.g., scattering `setTimeout` or `requestAnimationFrame` patches) instead of fixing root architectural causes [00:07:28].
- **Actionable Lint Errors:** Write custom lint rules with descriptive, instructive error messages that guide the agent toward fixing the underlying root cause rather than suppressing or patching around the symptom [00:09:01].

---

## 3. Verification & Review Artifacts

As PR volume scales, human code review shifts from reading raw diffs to inspecting **verification artifacts** (videos, screenshots, state diagrams, formal proofs) [00:09:50]. Roughly 70% of daily token usage goes toward verification rather than initial code generation [00:12:10].

- **Runtime Verification & Feature Maps:** Equip agents with debugging interfaces (e.g., Chrome DevTools Protocol) and reusable custom CLIs to save tokens and ensure deterministic execution [00:10:12]. Maintain a **Feature Map** (a user-centric sitemap of UI capabilities) so humans and agents share an exact vocabulary without guessing component locations [00:10:19].
- **Formal Verification:** Use formal methods—now economical because agents write and maintain the specs—to validate complex invariants [00:10:52]:
  - **TLA+:** Model checking multi-device, cross-platform state flows (e.g., notifications).
  - **Lean:** Proving mathematical correctness of critical algorithms (e.g., custom UI virtualization without jitter or flickering).
- **UI Property-Based Testing:** Use tools like **Bombadil** to fuzz UI interactions and catch edge-case visual/state regressions automatically [00:11:40].
- **State Machine Visualization:** Use statechart generation skills (e.g., from the `pstack` / Potato Stack plugin) to visualize user-facing state transitions alongside video recordings during review [00:13:05].

---

## 4. Production Metrics & Autonomous Outer Loops

Investing in deterministic foundations enabled the Grok Bot team to achieve extreme velocity without sacrificing stability [00:13:34]:

| Metric | Outcome |
| :--- | :--- |
| **Individual Output** | ~3,000 PRs shipped to production in one month by a single engineer [00:00:42] |
| **Team Output** | ~11,000 PRs shipped to production in one month across 227 contributors [00:13:34] |
| **Release Cadence** | New stable client release cut approximately once per day [00:13:50] |
| **Revert Rate** | ~0.5% (decreased on a relative basis despite higher volume) [00:14:24] |
| **App Performance** | Improved startup time, typing latency, and chat switching speed in Electron [00:14:39] |

### Scaling to the Outer Loop
1. **Fix the Inner Loop First:** Automating a sloppy inner coding loop only multiplies slop and burns tokens [00:15:38]. Establish static analysis, clean APIs, and runtime/formal verification first.
2. **Autonomous Release Fuzzing:** Once foundations are solid, orchestrate outer-loop cloud agents (e.g., Cursor cloud agents/routines) on every new release to fuzz the live build like a real user, file bug reports, open fix PRs, and auto-merge verified fixes [00:16:26].

---

## 5. Agent Operational Directives (System Prompt / `AGENTS.md` Snippet)

If you are an AI coding agent operating in a repository guided by these principles, adhere to the following rules:

- **Do Not Patch Symptoms:** Never use imperative timers (`setTimeout`, `requestAnimationFrame`), `useEffect` workarounds, or inline suppression comments to bypass architectural constraints. Fix the root cause in the proper abstraction layer.
- **No Explanatory Excuse Comments:** Do not write comments explaining why a suboptimal workaround is acceptable. Keep code self-documenting through clear types, naming, and structure.
- **Respect Directory Boundaries:** Strictly honor module and process boundaries (e.g., main vs. renderer process) enforced by the linter and dependency graph.
- **Verify Before Concluding:** Do not rely on static code inspection alone. Run the test suite, linters, type checkers, runtime verification CLIs, and UI/property checks to generate concrete verification artifacts before marking a task complete.
- **Follow Existing Pristine Patterns:** Match established framework APIs and conventions; if an existing pattern conflicts with lint rules or architectural invariants, refactor toward the canonical pattern rather than duplicating legacy debt.

---

## 6. Pocket Empires Enforcement Matrix

Every principle in the Inverse Trust Pyramid is wired into deterministic scripts in this repository:

| Inverse Trust Pyramid Layer | Pocket Empires Mechanism | Automated Gate |
|---|---|---|
| **Codebase Architecture & API Design** | Pure 20 Hz engine (`src/types/`, `src/engine/`), isolated client/UI/rendering/AI (`src/client/`, `src/ui/`, `src/rendering/`, `src/ai/`), shared DTOs (`src/shared/messages.ts`), Devvit server (`src/server/`), vetted hook primitives (`src/client/hooks.ts`) | `ARCH_ENGINE_PURE`, `ARCH_CLIENT_SERVER_BOUNDARY`, `DEVVIT_WEBVIEW_CSP`, `NO_RAW_USE_EFFECT_IN_PRODUCT` in `scripts/check-invariants.mjs` |
| **Static Analysis & Automated Testing** | 8 custom architectural lint rules with root-cause remediation hints, full client+engine TypeScript typechecking, unit tests, 50-seed 180°-symmetry + 300-tick absorbing terminal state fuzz tests, 30-day Siege solver | `npm run check:invariants`, `npm run typecheck`, `npm test`, `npm run verify:levels` |
| **Runtime & Verification Artifacts** | `FEATURE_MAP.json` selector contract, real mounted Redis API preview routes, Playwright Chromium headless verification across Splash (`560x420`, `360x380`), Desktop (`1280x800`), and Mobile (`390x844`) with 2D HUD/minimap collision checks & PNG screenshots | `node scripts/verify-runtime.mjs --screenshots <dir>` |
| **Prose & Prompting** | Concise architecture statecharts and engineering ledger | `ARCHITECTURE.md`, `docs/ENGINEERING_LEDGER.md` |
