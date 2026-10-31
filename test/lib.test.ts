import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { findImageTargets, buildDrafts } from "../extensions/lib.js";

// Minimal structural fixtures cast to SessionEntry — lib.ts only reads
// type/id and content blocks at runtime.
const base = { parentId: null, timestamp: "2026-10-31T00:00:00.000Z" };
const img = (mime = "image/png") => ({ type: "image", data: "aGVsbG8=", mimeType: mime });
const txt = (text: string) => ({ type: "text" as const, text });

function userEntry(id: string, content: unknown): SessionEntry {
	return { type: "message", id, ...base, message: { role: "user", content, timestamp: 0 } } as unknown as SessionEntry;
}

function toolResultEntry(id: string, toolName: string, content: unknown): SessionEntry {
	return {
		type: "message", id, ...base,
		message: { role: "toolResult", toolCallId: "call_1", toolName, content, isError: false, timestamp: 0 },
	} as unknown as SessionEntry;
}

describe("findImageTargets", () => {
	it("targets a user message with text + 2 images: text preserved verbatim, 2 placeholders", () => {
		const entry = userEntry("u1", [
			txt("look at this"),
			img(),
			img("image/jpeg"),
		]);
		const targets = findImageTargets([entry]);
		expect(targets).toHaveLength(1);
		expect(targets[0].entryId).toBe("u1");
		const content = targets[0].replacement.content;
		expect(content).toEqual([
			txt("look at this"),
			txt("[image removed: image/png]"),
			txt("[image removed: image/jpeg]"),
		]);
	});

	it("targets a toolResult with an image and names the tool in the placeholder", () => {
		const entry = toolResultEntry("t1", "read", [img()]);
		const targets = findImageTargets([entry]);
		expect(targets).toHaveLength(1);
		expect(targets[0].replacement.content).toEqual([
			txt("[image removed: tool result from read]"),
		]);
	});

	it("never targets assistant messages (thinking/toolCall blocks stay untouched)", () => {
		const entry = {
			type: "message", id: "a1", ...base,
			message: {
				role: "assistant", api: "anthropic-messages", provider: "anthropic",
				model: "claude-test", usage: {}, stopReason: "stop", timestamp: 0,
				content: [{ type: "thinking", thinking: "hmm", thinkingSignature: "sig" }],
			},
		} as unknown as SessionEntry;
		expect(findImageTargets([entry])).toHaveLength(0);
	});

	it("never targets string user content", () => {
		expect(findImageTargets([userEntry("u2", "plain text")])).toHaveLength(0);
	});

	it("targets custom_message entries with image blocks", () => {
		const entry = {
			type: "custom_message", id: "c1", ...base,
			customType: "my-ext", content: [txt("note"), img()], display: true,
		} as unknown as SessionEntry;
		const targets = findImageTargets([entry]);
		expect(targets).toHaveLength(1);
		expect(targets[0].entryId).toBe("c1");
		expect(targets[0].replacement.content).toEqual([txt("note"), txt("[image removed: image/png]")]);
	});

	it("scanning twice yields the same single target (idempotent)", () => {
		const entries = [userEntry("u1", [txt("look"), img()])];
		const first = findImageTargets(entries);
		const second = findImageTargets(entries);
		expect(first).toEqual(second);
		expect(first).toHaveLength(1);
	});
});

describe("buildDrafts", () => {
	it("keeps drafts whose target is in the context and drops stale ones", () => {
		const entry = userEntry("u1", [img()]);
		const staging = new Map(findImageTargets([entry]).map((t) => [t.entryId, t]));
		const stale = { entryId: "gone", replacement: { content: [txt("x")] } };

		const drafts = buildDrafts(new Map([...staging, [stale.entryId, stale]]), new Set(["u1"]));

		expect(drafts).toHaveLength(1);
		expect(drafts[0]).toEqual({
			type: "context_edit",
			targetId: "u1",
			replacement: { content: [txt("[image removed: image/png]")] },
		});
	});
});
