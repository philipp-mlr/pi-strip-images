import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { BoundaryResult } from "@earendil-works/pi-coding-agent";
import { buildDrafts, findImageTargets, type ImageTarget } from "./lib.js";

/** Entry-id keyed staging; a second /strip-images overwrites in place (idempotent). */
const staging = new Map<string, ImageTarget>();

function countPlaceholders(target: ImageTarget): number {
	return target.replacement.content.filter((block) => block.text.startsWith("[image removed:")).length;
}

function applyStaged(ctx: ExtensionContext, outcome: string): BoundaryResult | undefined {
	if (staging.size === 0) return;
	const contextEntryIds = new Set(ctx.sessionManager.buildContextEntries().map((entry) => entry.id));
	const drafts = buildDrafts(staging, contextEntryIds);
	staging.clear();
	if (drafts.length === 0) return;
	ctx.ui.notify(`strip-images: applied ${drafts.length} context edit(s)`, "info");
	// Only a failed run needs the forced retry; on success the edits land
	// silently and the next request is already clean.
	return { entries: drafts, continue: outcome === "error" };
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

	pi.on("turn_end", (event, ctx) => applyStaged(ctx, event.outcome));
	pi.on("agent_before_settle", (event, ctx) => applyStaged(ctx, event.outcome));
}
