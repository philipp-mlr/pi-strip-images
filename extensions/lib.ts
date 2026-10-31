import type { TextContent } from "@earendil-works/pi-ai";
import type { ContextEditEntryDraft, SessionEntry } from "@earendil-works/pi-coding-agent";

export type ImageTarget = {
	entryId: string;
	replacement: { content: TextContent[] };
};

type Placeholder = (mime: string) => string;

const mimePlaceholder: Placeholder = (mime) => `[image removed: ${mime}]`;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Rebuild content blocks: text kept verbatim, images replaced by placeholder text. */
function rebuildContent(
	content: unknown,
	placeholder: Placeholder,
): TextContent[] | null {
	if (!Array.isArray(content)) return null;
	const out: TextContent[] = [];
	let hasImage = false;
	for (const block of content) {
		if (!isRecord(block)) continue;
		if (block.type === "image") {
			const mime = typeof block.mimeType === "string" ? block.mimeType : "unknown";
			out.push({ type: "text", text: placeholder(mime) });
			hasImage = true;
		} else if (block.type === "text" && typeof block.text === "string") {
			out.push({ type: "text", text: block.text });
		}
	}
	return hasImage ? out : null;
}

/**
 * Scan session entries for image-bearing messages.
 *
 * Targets: `message` entries with role `user` or `toolResult`, and
 * `custom_message` entries. Assistant messages (thinking/toolCall blocks)
 * and string content are never targeted.
 */
export function findImageTargets(entries: SessionEntry[]): ImageTarget[] {
	const targets: ImageTarget[] = [];
	for (const entry of entries) {
		if (entry.type === "custom_message") {
			const content = (entry as { content?: unknown }).content;
			const rebuilt = rebuildContent(content, mimePlaceholder);
			if (rebuilt) {
				targets.push({ entryId: entry.id, replacement: { content: rebuilt } });
			}
			continue;
		}
		if (entry.type !== "message") continue;
		const message = (entry as { message?: { role?: string; content?: unknown; toolName?: string } }).message;
		if (!message || (message.role !== "user" && message.role !== "toolResult")) continue;
		const placeholder: Placeholder =
			message.role === "toolResult"
				? () => `[image removed: tool result from ${message.toolName ?? "unknown"}]`
				: mimePlaceholder;
		const rebuilt = rebuildContent(message.content, placeholder);
		if (rebuilt) {
			targets.push({ entryId: entry.id, replacement: { content: rebuilt } });
		}
	}
	return targets;
}

/**
 * Turn staged targets into context_edit drafts, dropping targets that are no
 * longer part of the model context (compacted away or off-branch).
 */
export function buildDrafts(
	targets: Map<string, ImageTarget>,
	contextEntryIds: Set<string>,
): ContextEditEntryDraft[] {
	const drafts: ContextEditEntryDraft[] = [];
	for (const [targetId, target] of targets) {
		if (!contextEntryIds.has(targetId)) continue;
		drafts.push({
			type: "context_edit",
			targetId,
			replacement: { content: target.replacement.content },
		});
	}
	return drafts;
}
