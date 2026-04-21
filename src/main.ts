import { Plugin } from "obsidian";
import { parseNimbleBlock } from "./parser/parseNimbleBlock";
import { renderMonsterStatblock } from "./render/statblockRenderer";

export default class NimbleStatblocksPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerMarkdownCodeBlockProcessor("nimble", (source, el, ctx) => {
			const parseResult = parseNimbleBlock(source);
			if (!parseResult.statblock) {
				const message = parseResult.error?.message ?? "Unknown parse error.";
				el.empty();
				el.createDiv({
					cls: "nimble-statblock-error",
					text: `Nimble block error: ${message}`,
				});
				return;
			}

			renderMonsterStatblock(this.app, parseResult.statblock, el, ctx.sourcePath);
		});
	}
}
