import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("strip-images", {
		description: "Strip image blocks from model context (placeholder stub)",
		handler: async (_args, ctx) => {
			ctx.ui.notify("stub", "info");
		},
	});
}
