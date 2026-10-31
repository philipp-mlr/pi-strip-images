import type { AgentActivityOutcome, BoundaryResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { boundaryResult, buildDrafts, findImageTargets, hasProjectedImage, type ImageTarget } from "./lib.js";

/** Entry-id keyed staging; a second /strip-images overwrites in place (idempotent). */
const staging = new Map<string, ImageTarget>();

function countPlaceholders(target: ImageTarget): number {
	return target.replacement.content.filter((block) => block.text.startsWith("[image removed:")).length;
}

function applyStaged(ctx: ExtensionContext, outcome: AgentActivityOutcome): BoundaryResult | undefined {
	if (staging.size === 0) return;
	const contextEntries = ctx.sessionManager.buildContextEntries();
	const contextEntryIds = new Set(contextEntries.map((entry) => entry.id));
	const drafts = buildDrafts(staging, contextEntryIds);
	staging.clear();
	const lastMessageEntry = contextEntries.findLast((entry) => entry.type === "message");
	const result = boundaryResult(outcome, drafts, lastMessageEntry);
	if (result) ctx.ui.notify(`strip-images: applied ${drafts.length} context edit(s)`, "info");
	return result;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("strip-images", {
		description: "Strip image blocks from model context (placeholder text, raw history untouched)",
		handler: async (_args, ctx) => {
			// Only stage entries whose *projected* content still contains an
			// image — an earlier strip (ours, another extension, or a manual
			// edit) must not be re-staged or overwritten.
			const projection = ctx.sessionManager.buildSessionProjection();
			const strippable = new Set<string>();
			for (const projected of projection.entries) {
				if (hasProjectedImage(projected.messages)) strippable.add(projected.sourceEntry.id);
			}
			const targets = findImageTargets(ctx.sessionManager.buildContextEntries()).filter((target) =>
				strippable.has(target.entryId),
			);
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

	// turn_end fires on every finished turn, INCLUDING failed runs. Only
	// consume staging on completed turns (mid-run cleanup); on error runs
	// staging must survive until agent_before_settle, the only boundary where
	// a continuation request is actually runnable.
	pi.on("turn_end", (event, ctx) => {
		if (event.outcome !== "completed") return;
		return applyStaged(ctx, event.outcome);
	});
	pi.on("agent_before_settle", (event, ctx) => applyStaged(ctx, event.outcome));
}
