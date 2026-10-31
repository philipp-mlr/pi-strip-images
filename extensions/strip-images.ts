import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { BoundaryResult } from "@earendil-works/pi-coding-agent";
import { buildDrafts, findImageTargets, type ImageTarget } from "./lib.js";

/** Entry-id keyed staging; a second /strip-images overwrites in place (idempotent). */
const staging = new Map<string, ImageTarget>();

function countPlaceholders(target: ImageTarget): number {
	return target.replacement.content.filter((block) => block.text.startsWith("[image removed:")).length;
}

function applyStaged(ctx: ExtensionContext, allowContinue: boolean): BoundaryResult | undefined {
	if (staging.size === 0) return;
	const contextEntryIds = new Set(ctx.sessionManager.buildContextEntries().map((entry) => entry.id));
	const drafts = buildDrafts(staging, contextEntryIds);
	staging.clear();
	if (drafts.length === 0) return;
	ctx.ui.notify(`strip-images: applied ${drafts.length} context edit(s)`, "info");
	return { entries: drafts, continue: allowContinue };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("strip-images", {
		description: "Strip image blocks from model context (placeholder text, raw history untouched)",
		handler: async (_args, ctx) => {
			const targets = findImageTargets(ctx.sessionManager.buildContextEntries());
			if (targets.length === 0) {
				ctx.ui.notify("strip-images: no images found in current context", "warning");
				return;
			}
			const imageBlocks = targets.reduce((sum, target) => sum + countPlaceholders(target), 0);
			for (const target of targets) staging.set(target.entryId, target);
			ctx.ui.notify(
				`strip-images: ${imageBlocks} image block(s) in ${targets.length} entries staged — edits apply at the next run boundary`,
				"info",
			);
		},
	});

	pi.on("turn_end", (event, ctx) => {
		if (event.outcome !== "completed") return;
		return applyStaged(ctx, false);
	});
	pi.on("agent_before_settle", (event, ctx) => {
		if (event.outcome !== "error") return applyStaged(ctx, false);
		// Failed run: only act when we actually staged edits (never retry
		// unrelated provider errors). pi persists the failed assistant attempt;
		// a continuation request cannot end on an assistant message, so it must
		// be omitted too — mirroring pi's own overflow recovery.
		const applied = applyStaged(ctx, true);
		if (!applied) return undefined;
		const entries = [...(applied.entries ?? [])];
		const leaf = ctx.sessionManager.getLeafEntry();
		if (leaf?.type === "message") {
			const message = (leaf as { message?: { role?: string; stopReason?: string } }).message;
			if (message?.role === "assistant" && message.stopReason === "error") {
				entries.push({ type: "context_edit", targetId: leaf.id, replacement: null });
			}
		}
		return { entries, continue: true };
	});
}
