import { Plugin } from "obsidian";
import { parseNimbleBlock } from "./parser/parseNimbleBlock";
import { renderMonsterStatblock, renderItemStatblock } from "./render/statblockRenderer";
import type { Statblock } from "./types/statblock";

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

			const statblock: Statblock = parseResult.statblock;
			if (statblock.layout === "item") {
				renderItemStatblock(this.app, statblock, el, ctx.sourcePath);
			} else {
				renderMonsterStatblock(this.app, statblock, el, ctx.sourcePath);
			}
		});
	}
}
