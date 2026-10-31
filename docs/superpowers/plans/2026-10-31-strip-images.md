# pi-strip-images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-command rescue of image-bearing pi conversations on text-only models, via staged `context_edit` entries.

**Architecture:** Pure scan/rebuild functions in `extensions/lib.ts` (unit-tested), a thin extension shell `extensions/strip-images.ts` that stages drafts on `/strip-images` and proposes them at `turn_end`/`agent_before_settle` boundaries.

**Tech Stack:** TypeScript (no build step, loaded by pi), vitest for unit tests, npm package with `pi-package` keyword.

**Spec:** `docs/superpowers/specs/2026-10-31-strip-images-design.md`

## Global Constraints

- pi package rules: host packages (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`) only as `import type` + `peerDependencies: "*"`; never in `dependencies`.
- `keywords: ["pi-package"]` in package.json.
- Extension discovered from conventional `extensions/` directory, TypeScript, no build step.
- toolResult entries: text replacement only, never `replacement: null`.
- Replacement value shape: `{ content: ContextEditableContent } | null` (object with `content` key — NOT bare content).
- Placeholder format: `[image removed: <mime>]` (user/custom), `[image removed: tool result from <toolName>]` (toolResult).

## Review Focus

- Assistant messages and `thinking`/`toolCall` blocks must never be touched (scan filters roles; pinned in Task 2 tests).
- String user content (no blocks) must pass through scan untargeted (Task 2).
- Stale staged targets (compacted/off-branch between staging and apply) must be dropped, not proposed (Task 3 test + logic).
- `continue` must not be returned on `completed`/`aborted` outcomes — no duplicate responses (Task 3 test).
- Double `/strip-images` invocation must not duplicate drafts (Map staging, Task 2).

---

### Task 1: Scaffold package

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`, `README.md`, `docs/superpowers/plans/2026-10-31-strip-images.md` (this file), `docs/superpowers/specs/2026-10-31-strip-images-design.md` (already present)

**Interfaces:**
- Produces: package name `pi-strip-images` v0.1.0, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"` scripts used by later tasks.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "pi-strip-images",
  "version": "0.1.0",
  "description": "pi extension: strip image blocks from model context so image-bearing conversations keep working on text-only models",
  "keywords": ["pi-package"],
  "license": "MIT",
  "type": "module",
  "repository": "github:philipp-mlr/pi-strip-images",
  "files": ["extensions", "README.md", "LICENSE"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-ai": "*"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-ai": "*",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json** (module NodeNext, target ES2022, strict, noEmit, include `extensions/**/*.ts` `test/**/*.ts`; skipLibCheck true)
- [ ] **Step 3: Write .gitignore** (`node_modules/`, `*.tgz`)
- [ ] **Step 4: Write LICENSE** (MIT, copyright 2026 Philipp MLR)
- [ ] **Step 5: Write README.md** — install (`pi install git:github.com/philipp-mlr/pi-strip-images`, npm variant), usage, what it does/doesn't (raw history preserved), v2 roadmap line
- [ ] **Step 6: `npm install` and `npm run typecheck`** — expect clean pass with only scaffold files (add a stub `extensions/strip-images.ts` exporting default function taking `pi: ExtensionAPI` if needed for the pass)
- [ ] **Step 7: Commit** `feat: scaffold pi-strip-images package`

### Task 2: Pure lib functions (TDD)

**Files:**
- Create: `extensions/lib.ts`, `test/lib.test.ts`

**Interfaces:**
- Produces (exact signatures, consumed by Task 3):

```ts
type ImageTarget = { entryId: string; replacement: { content: (TextContent)[] } };
function findImageTargets(entries: SessionEntry[]): ImageTarget[];
function buildDrafts(targets: Map<string, ImageTarget>, contextEntryIds: Set<string>): ContextEditEntryDraft[];
```

`findImageTargets` scans `type === "message"` entries (roles `user`, `toolResult`) and `type === "custom_message"` entries for array content containing `{type:"image"}` blocks; it rebuilds full content (text parts preserved, images → placeholder text blocks). Roles `assistant` and string content are never targeted. `buildDrafts` filters targets whose id is absent from `contextEntryIds`.

- [ ] **Step 1: Write failing tests in `test/lib.test.ts`** covering: user message text+2 images → one target, text preserved verbatim, 2 placeholder blocks; toolResult with image → placeholder includes toolName; assistant entry with thinking/toolCall → no target; string user content → no target; custom_message with image → target; buildDrafts drops target not in id set; double-entry idempotency (Map keyed by entryId — second scan produces same single target)
- [ ] **Step 2: `npm test`** — expect FAIL (module missing)
- [ ] **Step 3: Implement `extensions/lib.ts`** — no imports at runtime; `import type { TextContent } from "@earendil-works/pi-ai"`; `import type { SessionEntry, ContextEditEntryDraft }` from session-manager types via `"@earendil-works/pi-coding-agent"` (type-only)
- [ ] **Step 4: `npm test`** — expect PASS; `npm run typecheck` PASS
- [ ] **Step 5: Commit** `feat: pure scan/rebuild lib with unit tests`

### Task 3: Extension shell

**Files:**
- Create: `extensions/strip-images.ts`

**Interfaces:**
- Consumes: `findImageTargets`, `buildDrafts` from `./lib.js` (Task 2 signatures).
- Produces: default export `function (pi: ExtensionAPI)` registering command `strip-images`; module-level `Map<string, ImageTarget>` staging.

- [ ] **Step 1: Implement** — command handler: scan `ctx.sessionManager.buildContextEntries()`, stage targets (Map merge = idempotent), `ctx.ui.notify` summary (`N image block(s) in M entries staged` / `no images found`). Register `turn_end` + `agent_before_settle` handlers: if staging empty → return; build id set from `ctx.sessionManager.buildContextEntries()`, `buildDrafts(staging, ids)`, clear staging, `ctx.ui.notify("strip-images: applied N edits")`, return `{ entries: drafts, continue: event.outcome === "error" }`.
- [ ] **Step 2: `npm run typecheck` + `npm test`** — expect PASS
- [ ] **Step 3: Commit** `feat: /strip-images command with boundary apply`

### Task 4: Spike verification (real session)

- [ ] **Step 1:** Scratch dir + `pi -e /home/philipp/repos/pi-strip-images`; make an image part of context (read a small png); switch `/model` to a text-only z.ai model; send a prompt → expect 1210 error, then automatic `continue` retry succeeding with `[image removed: …]` placeholders in context
- [ ] **Step 2:** Second scenario: no images → `/strip-images` reports "no images found"; run completes normally, no extra request
- [ ] **Step 3:** Document result in commit message `docs: spike verification results` (or fix + re-spike if failures)

### Task 5: Publish

- [ ] **Step 1:** `gh repo create philipp-mlr/pi-strip-images --public --source . --push`
- [ ] **Step 2:** `git tag v0.1.0 && git push origin v0.1.0`
- [ ] **Step 3:** `npm pack` dry-run — tarball contains `extensions/`, README, LICENSE, package.json only
- [ ] **Step 4:** npm publish left to Philipp (login required) — exact command in handoff
