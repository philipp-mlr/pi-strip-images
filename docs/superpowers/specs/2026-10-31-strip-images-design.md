# pi-strip-images — Design (v1)

**Date:** 2026-10-31 · **Status:** approved (Philipp, chat)

## Intent & why

pi conversations that contain image content blocks (pasted screenshots, `read`
on image files, browser screenshots) break on text-only models: e.g. Z.ai
GLM-5.3 rejects them with `400 code 1210 "messages.content.type is invalid,
allowed values: ['text']"`. Manual rescue (jq on the session JSONL, `/tree`
branching) is fiddly. This extension makes the rescue a one-command operation
inside pi.

## Goals

- `/strip-images` command: find all image blocks in the active context and
  stage `context_edit` entries that replace them with text placeholders.
- Edits apply at the next actionable boundary (`turn_end` /
  `agent_before_settle`); when the run failed with a provider error, the
  handler returns `continue: true` so the same prompt retries clean.
- Raw session history stays untouched (native `context_edit` semantics) —
  a later pass (v2 transcription) can re-edit the same entries.
- Usable on image-free sessions: command reports "no images found", stages
  nothing.

## Non-goals (v1)

- No vision-model transcription (`--describe` flag is planned for v2).
- No automatic trigger on provider error 1210.
- No interactive per-image selection.
- No deletion of images from raw history.

## Constraints

- Host-provided packages (`@earendil-works/pi-coding-agent`,
  `@earendil-works/pi-ai`) only via `import type` / `peerDependencies "*"` —
  never bundled, never in `dependencies` (pi package rules, docs/packages.md).
- npm package must carry `keywords: ["pi-package"]` for gallery eligibility.
- Extension loaded from conventional `extensions/` dir, TypeScript, no build
  step.
- toolResult entries get text replacements, never `replacement: null`
  (orphaned tool calls would trip some providers).
- Mixed-content messages keep their original text parts; only image blocks
  are substituted.

## Approaches considered

1. **Session-file surgery (jq context_edit append)** — works, but outside
   pi, requires closing the session, error-prone. Rejected as UX; its
   mechanics (context_edit) became the implementation vehicle.
2. **`/tree` branch + summary** — built-in, but loses post-branch work and
   is manual prose, not targeted. Rejected for this purpose.
3. **Extension staging + boundary proposals (chosen)** — sanctioned
   mechanism (`SessionBoundaryDraft` at `turn_end`/`agent_before_settle`),
   in-session UX, reversible, minimal code.

## Decided behavior

- Placeholder text: `[image removed: <mime>]` for user/custom messages;
  `[image removed: tool result from <toolName>]` for toolResults.
- `continue: true` is returned **only** when staging was consumed and
  `outcome === "error"`. On completed runs edits apply silently without
  forcing an extra request.
- Staging is idempotent (Map keyed by target entry id); stale targets
  (compacted away / off-branch) are dropped at apply time.
- Scanned source: `sessionManager.buildContextEntries()` (active branch,
  compaction-aware). Targets: `message` entries with role `user` /
  `toolResult`, plus `custom_message` entries with image blocks.

## Left to the builder

- Exact vitest setup, commit granularity, README copy polish.
