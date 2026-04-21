import { App, Menu, Notice, setIcon } from "obsidian";
import {
	icon,
	type AbstractElement,
	type IconDefinition,
} from "@fortawesome/fontawesome-svg-core";
import {
	faCircleDown,
	faFeather,
	faHeart,
	faMountain,
	faPersonWalking,
	faShieldHalved,
	faStar,
	faWater,
} from "@fortawesome/free-solid-svg-icons";
import { exportMonsterAsJson } from "../export/exportJson";
import { exportElementAsPng } from "../export/exportPng";
import { resolveLinkedFile } from "../export/assets";
import type {
	AbilityDescLine,
	AbilityEntry,
	ActionEntry,
	ActionSaveEntry,
	ActionTriggerEffect,
	ItemEntry,
	ItemRarity,
	ItemStatblock,
	MonsterStatblock,
	SoloPhaseAbility,
	SoloPhaseState,
	SpeedEntry,
} from "../types/statblock";

type HeaderBadgeKind = "shield" | "heart" | "movement" | "save";
type MovementType = "walk" | "fly" | "climb" | "swim" | "burrow";

interface HeaderBadge {
	kind: HeaderBadgeKind;
	value: string;
	ariaLabel: string;
	movementType?: MovementType;
}

interface MovementBadgeDisplay {
	badgeValue: string;
	ariaValue: string;
}

const MOVEMENT_BADGE_ORDER: MovementType[] = [
	"walk",
	"fly",
	"climb",
	"swim",
	"burrow",
];

const MOVEMENT_BADGE_ICONS: Record<MovementType, IconDefinition> = {
	walk: faPersonWalking,
	fly: faFeather,
	climb: faMountain,
	swim: faWater,
	burrow: faCircleDown,
};

const MOVEMENT_BADGE_LABELS: Record<MovementType, string> = {
	walk: "Walking",
	fly: "Flying",
	climb: "Climbing",
	swim: "Swimming",
	burrow: "Burrowing",
};

const MOVEMENT_DEFAULTS: Record<MovementType, number> = {
	walk: 6,
	fly: 0,
	climb: 0,
	swim: 0,
	burrow: 0,
};

export function renderMonsterStatblock(
	app: App,
	statblock: MonsterStatblock,
	containerEl: HTMLElement,
	sourcePath: string,
): void {
	containerEl.empty();

	const hostEl = containerEl.createDiv({ cls: "nimble-statblock-host" });
	const controlsEl = hostEl.createDiv({ cls: "nimble-statblock-controls" });
	const statblockEl = hostEl.createDiv({
		cls: ["nimble-statblock", `nimble-layout-${statblock.layout}`],
	});

	renderMonsterImage(app, statblock, statblockEl, sourcePath);
	renderHeader(statblock, statblockEl);
	renderFeatureRibbons(app, statblock.features, statblockEl, sourcePath);

	const actionsHeading = statblock.layout === "legendary" ? "Actions" : undefined;
	renderActions(app, statblock.actions, statblockEl, sourcePath, actionsHeading);

	if (statblock.layout === "solo") {
		renderSoloSection(statblock, statblockEl);
	}

	if (statblock.layout === "legendary") {
		renderLegendarySoloSections(app, statblock, statblockEl, sourcePath);
	}

	renderExportButtons(app, controlsEl, statblock, statblockEl, sourcePath);
}

function renderExportButtons(
	app: App,
	containerEl: HTMLElement,
	statblock: MonsterStatblock,
	exportRoot: HTMLElement,
	sourcePath: string,
): void {
	const menuTriggerEl = containerEl.createEl("button", {
		cls: ["clickable-icon", "nimble-statblock-menu-trigger"],
		attr: {
			type: "button",
			"aria-label": "Statblock options",
			"aria-haspopup": "menu",
		},
	});
	setIcon(menuTriggerEl, "more-horizontal");

	menuTriggerEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();

		const menu = new Menu();
		menu.addItem((item) => {
			item
				.setTitle("Export to Foundry")
				.setIcon("download")
				.onClick(() => void handleJsonExport(app, statblock, sourcePath));
		});
		menu.addItem((item) => {
			item
				.setTitle("Export as PNG")
				.setIcon("image")
				.onClick(() => void handlePngExport(exportRoot, statblock.name));
		});
		menu.showAtMouseEvent(event);
	});
}

async function handleJsonExport(
	app: App,
	statblock: MonsterStatblock,
	sourcePath: string,
): Promise<void> {
	try {
		const outputPath = await exportMonsterAsJson(app, statblock, sourcePath);
		new Notice(`Nimble JSON exported: ${outputPath}`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error while exporting JSON.";
		new Notice(`JSON export failed: ${message}`);
	}
}

async function handlePngExport(
	exportRoot: HTMLElement,
	monsterName: string,
): Promise<void> {
	try {
		const outputPath = await exportElementAsPng(exportRoot, `${monsterName}-statblock`);
		new Notice(`PNG exported: ${outputPath}`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error while exporting PNG.";
		new Notice(`PNG export failed: ${message}`);
	}
}

function renderHeader(
	statblock: MonsterStatblock,
	containerEl: HTMLElement,
): void {
	if (statblock.layout === "legendary") {
		renderLegendaryHeader(statblock, containerEl);
		return;
	}

	const headerEl = containerEl.createDiv({ cls: "nimble-statblock__header-row" });
	const titleEl = headerEl.createDiv({ cls: "nimble-statblock__title-row" });
	const metaText =
		statblock.layout === "solo" && (statblock.archetype || statblock.subtitle)
			? buildSoloSubtitleLine(statblock)
			: `Lvl ${statblock.level}, ${String(statblock.size).toUpperCase()}`;

	titleEl.createEl("span", {
		cls: "nimble-statblock__name",
		text: statblock.name,
	});
	titleEl.createEl("span", {
		cls: "nimble-statblock__meta",
		text: metaText,
	});

	const badgesEl = headerEl.createDiv({ cls: "nimble-statblock__badges" });
	for (const badge of getHeaderBadges(statblock)) {
		const classes = ["nimble-statblock__badge"];
		if (badge.kind === "shield") {
			classes.push("nimble-statblock__badge-shield");
		}
		if (badge.kind === "heart") {
			classes.push("nimble-statblock__badge-heart");
		}
		if (badge.kind === "movement" && badge.movementType) {
			classes.push("nimble-statblock__badge-movement");
			classes.push(`nimble-statblock__badge-movement-${badge.movementType}`);
		}
		if (badge.kind === "save") {
			classes.push("nimble-statblock__badge-save");
		}

		const badgeEl = badgesEl.createSpan({
			cls: classes,
			attr: { "aria-label": badge.ariaLabel },
		});

		if (badge.kind === "shield") {
			renderIconBadgeContent(badgeEl, faShieldHalved, badge.value);
			continue;
		}

		if (badge.kind === "heart") {
			renderIconBadgeContent(badgeEl, faHeart, badge.value);
			continue;
		}

		if (badge.kind === "movement" && badge.movementType) {
			renderIconBadgeContent(
				badgeEl,
				MOVEMENT_BADGE_ICONS[badge.movementType],
				badge.value,
			);
			continue;
		}

		if (badge.kind === "save") {
			renderIconBadgeContent(badgeEl, faStar, badge.value);
			continue;
		}

		badgeEl.setText(badge.value);
	}
}

function renderLegendaryHeader(
	statblock: MonsterStatblock,
	containerEl: HTMLElement,
): void {
	const headerEl = containerEl.createDiv({
		cls: ["nimble-statblock__header-row", "nimble-statblock__header-row-legendary"],
	});
	const titleEl = headerEl.createDiv({
		cls: ["nimble-statblock__title-row", "nimble-statblock__title-row-legendary"],
	});

	titleEl.createEl("span", {
		cls: ["nimble-statblock__meta", "nimble-statblock__meta-legendary"],
		text: buildSoloSubtitleLine(statblock),
	});
	titleEl.createEl("span", {
		cls: ["nimble-statblock__name", "nimble-statblock__name-legendary"],
		text: statblock.name,
	});

	const badgesEl = headerEl.createDiv({ cls: "nimble-statblock__badges" });
	for (const badge of getHeaderBadges(statblock)) {
		const classes = ["nimble-statblock__badge"];
		if (badge.kind === "shield") {
			classes.push("nimble-statblock__badge-shield");
		}
		if (badge.kind === "heart") {
			classes.push("nimble-statblock__badge-heart");
		}
		if (badge.kind === "movement" && badge.movementType) {
			classes.push("nimble-statblock__badge-movement");
			classes.push(`nimble-statblock__badge-movement-${badge.movementType}`);
		}
		if (badge.kind === "save") {
			classes.push("nimble-statblock__badge-save");
		}

		const badgeEl = badgesEl.createSpan({
			cls: classes,
			attr: { "aria-label": badge.ariaLabel },
		});

		if (badge.kind === "shield") {
			renderIconBadgeContent(badgeEl, faShieldHalved, badge.value);
			continue;
		}

		if (badge.kind === "heart") {
			renderIconBadgeContent(badgeEl, faHeart, badge.value);
			continue;
		}

		if (badge.kind === "movement" && badge.movementType) {
			renderIconBadgeContent(
				badgeEl,
				MOVEMENT_BADGE_ICONS[badge.movementType],
				badge.value,
			);
			continue;
		}
		if (badge.kind === "save") {
			renderIconBadgeContent(badgeEl, faStar, badge.value);
			continue;
		}
		badgeEl.setText(badge.value);
	}
}

function buildSoloSubtitleLine(statblock: MonsterStatblock): string {
	const parts = [`Level ${statblock.level}`, "Solo"];
	const archetype = statblock.archetype?.trim();
	if (archetype) {
		parts.push(archetype);
	}

	const subtitle = statblock.subtitle?.trim();
	if (subtitle) {
		parts.push(subtitle);
	}

	return parts.join(" ");
}

function getHeaderBadges(statblock: MonsterStatblock): HeaderBadge[] {
	const badges: HeaderBadge[] = [];

	if (statblock.layout === "minion") {
		pushMovementBadges(badges, statblock.speed);
		return badges;
	}

	const hasArmor = statblock.armor !== undefined;
	if (hasArmor) {
		const armorValue = String(statblock.armor);
		badges.push({
			kind: "shield",
			value: armorValue,
			ariaLabel: `Armor ${armorValue}`,
		});
	}

	if (statblock.hp !== undefined) {
		const hpValue = String(statblock.hp);
		badges.push({
			kind: "heart",
			value: hpValue,
			ariaLabel: `Hit points ${hpValue}`,
		});
	}

	pushMovementBadges(badges, statblock.speed);

	if (statblock.layout === "legendary") {
		const saveBadge = buildLegendarySaveBadge(statblock);
		if (saveBadge) {
			badges.push(saveBadge);
		}
	}

	return badges;
}

function buildLegendarySaveBadge(statblock: MonsterStatblock): HeaderBadge | undefined {
	if (!statblock.saves) {
		return undefined;
	}

	const entries = [
		formatLegendarySaveEntry("DEX", statblock.saves.dex),
		formatLegendarySaveEntry("WIL", statblock.saves.wil),
		formatLegendarySaveEntry("STR", statblock.saves.str),
		formatLegendarySaveEntry("INT", statblock.saves.int),
	].filter((entry): entry is string => Boolean(entry));

	if (entries.length === 0) {
		return undefined;
	}

	return {
		kind: "save",
		value: entries.join(", "),
		ariaLabel: `Saves ${entries.join(", ")}`,
	};
}

function formatLegendarySaveEntry(
	key: "DEX" | "WIL" | "STR" | "INT",
	value: number | undefined,
): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	const symbol = toLegendarySaveSymbol(value);
	if (!symbol) {
		return undefined;
	}

	return `${key}${symbol}`;
}

function toLegendarySaveSymbol(value: number): string {
	if (value > 0) {
		return "+".repeat(Math.max(1, Math.trunc(value)));
	}
	if (value < 0) {
		return "-".repeat(Math.max(1, Math.abs(Math.trunc(value))));
	}
	return "";
}

function pushMovementBadges(
	badges: HeaderBadge[],
	speedEntries: SpeedEntry[],
): void {
	for (const movementType of MOVEMENT_BADGE_ORDER) {
		const movementDisplay = getMovementBadgeDisplay(speedEntries, movementType);
		if (!movementDisplay) {
			continue;
		}

		const movementLabel = MOVEMENT_BADGE_LABELS[movementType];
		badges.push({
			kind: "movement",
			movementType,
			value: movementDisplay.badgeValue,
			ariaLabel: `${movementLabel} speed ${movementDisplay.ariaValue}`,
		});
	}
}

function getMovementBadgeDisplay(
	speedEntries: SpeedEntry[],
	movementType: MovementType,
): MovementBadgeDisplay | undefined {
	const speedEntry = speedEntries.find(
		(entry) => entry.type.trim().toLowerCase() === movementType,
	);
	const speedValue = speedEntry?.value ?? MOVEMENT_DEFAULTS[movementType];
	const displayValue = normalizeDisplaySpeedValue(speedValue);
	if (!displayValue) {
		return undefined;
	}

	const numericValue = normalizeNumericSpeedValue(speedValue);
	if (movementType === "walk" && numericValue === 6) {
		return undefined;
	}

	if (movementType !== "walk" && numericValue === 6) {
		return {
			badgeValue: "",
			ariaValue: "6",
		};
	}

	return {
		badgeValue: displayValue,
		ariaValue: displayValue,
	};
}

function normalizeDisplaySpeedValue(value: number | string): string | undefined {
	if (typeof value === "number") {
		return value > 0 ? String(value) : undefined;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const numericValue = Number(trimmed);
	if (!Number.isNaN(numericValue)) {
		return numericValue > 0 ? trimmed : undefined;
	}

	return trimmed;
}

function normalizeNumericSpeedValue(value: number | string): number | undefined {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const numericValue = Number(trimmed);
	return Number.isNaN(numericValue) ? undefined : numericValue;
}

function renderIconBadgeContent(
	badgeEl: HTMLElement,
	iconDefinition: IconDefinition,
	value: string,
): void {
	const iconEl = badgeEl.createSpan({ cls: "nimble-statblock__badge-icon" });
	appendFontAwesomeIcon(iconEl, iconDefinition);
	if (value) {
		badgeEl.createSpan({
			cls: "nimble-statblock__badge-icon-value",
			text: value,
		});
	}
}

function appendFontAwesomeIcon(
	containerEl: HTMLElement,
	iconDefinition: IconDefinition,
): void {
	const renderedIcon = icon(iconDefinition, {
		styles: {},
	});
	const abstractNode = renderedIcon.abstract[0];
	if (!abstractNode) {
		return;
	}

	const svgEl = createSvgElementFromAbstract(abstractNode);
	svgEl.removeAttribute("style");
	svgEl.setAttribute("aria-hidden", "true");
	svgEl.setAttribute("focusable", "false");
	containerEl.appendChild(svgEl);
}

function createSvgElementFromAbstract(abstractNode: AbstractElement): SVGElement {
	const svgNamespace = "http://www.w3.org/2000/svg";
	const element = document.createElementNS(svgNamespace, abstractNode.tag);
	const attributes = asRecord(abstractNode.attributes);

	for (const [name, value] of Object.entries(attributes)) {
		if (value === undefined || value === null) {
			continue;
		}
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			element.setAttribute(name, String(value));
		}
	}

	for (const childNode of abstractNode.children ?? []) {
		element.appendChild(createSvgElementFromAbstract(childNode));
	}

	return element;
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function renderMonsterImage(
	app: App,
	statblock: MonsterStatblock,
	containerEl: HTMLElement,
	sourcePath: string,
): void {
	if (!statblock.image) {
		return;
	}

	const imageFile = resolveLinkedFile(app, sourcePath, statblock.image);
	if (!imageFile) {
		return;
	}

	containerEl.createEl("img", {
		cls: "nimble-statblock__image",
		attr: {
			src: app.vault.getResourcePath(imageFile),
			alt: `${statblock.name} art`,
		},
	});
}

function renderFeatureRibbons(
	app: App,
	features: AbilityEntry[],
	containerEl: HTMLElement,
	sourcePath: string,
): void {
	if (features.length === 0) {
		return;
	}

	const ribbonWrapEl = containerEl.createDiv({ cls: "nimble-statblock__ribbons" });
	for (const feature of features) {
		const ribbonEl = ribbonWrapEl.createDiv({ cls: "nimble-statblock__feature-ribbon" });
		const contentEl = ribbonEl.createDiv({ cls: "nimble-statblock__feature-content" });
		renderFeatureImage(app, feature, contentEl, sourcePath);

		const copyEl = contentEl.createSpan({ cls: "nimble-statblock__feature-copy" });
		copyEl.createSpan({
			cls: "nimble-statblock__feature-name",
			text: `${feature.name}.`,
		});
		const detailText = descLinesToSentence(feature.desc);
		if (detailText) {
			copyEl.createSpan({
				cls: "nimble-statblock__feature-text",
				text: ` ${detailText}`,
			});
		}
	}
}

function renderFeatureImage(
	app: App,
	feature: AbilityEntry,
	containerEl: HTMLElement,
	sourcePath: string,
): void {
	if (!feature.image) {
		return;
	}

	const imageFile = resolveLinkedFile(app, sourcePath, feature.image);
	if (!imageFile) {
		return;
	}

	containerEl.createEl("img", {
		cls: "nimble-statblock__feature-image",
		attr: {
			src: app.vault.getResourcePath(imageFile),
			alt: `${feature.name} icon`,
		},
	});
}

function renderActions(
	app: App,
	actions: ActionEntry[],
	containerEl: HTMLElement,
	sourcePath: string,
	heading: string | undefined = undefined,
): void {
	if (actions.length === 0) {
		return;
	}

	const actionsRootEl = heading
		? containerEl.createDiv({ cls: "nimble-statblock__actions-section" })
		: containerEl;
	if (heading) {
		actionsRootEl.createDiv({
			cls: "nimble-statblock__section-heading",
			text: `${heading}:`,
		});
	}

	const listEl = actionsRootEl.createEl("ul", { cls: "nimble-statblock__actions" });
	for (const action of actions) {
		const itemEl = listEl.createEl("li", { cls: "nimble-statblock__action-line" });
		const hasImage = renderActionImage(app, action, itemEl, sourcePath);
		if (hasImage) {
			itemEl.addClass("nimble-statblock__action-line-has-image");
		}

		const contentEl = itemEl.createSpan({ cls: "nimble-statblock__action-content" });

		contentEl.createSpan({
			cls: "nimble-statblock__action-name",
			text: `${action.name}.`,
		});

		renderActionDetails(action, contentEl);
	}
}

function renderActionImage(
	app: App,
	action: ActionEntry,
	containerEl: HTMLElement,
	sourcePath: string,
): boolean {
	if (!action.image) {
		return false;
	}

	const imageFile = resolveLinkedFile(app, sourcePath, action.image);
	if (!imageFile) {
		return false;
	}

	containerEl.createEl("img", {
		cls: "nimble-statblock__action-image",
		attr: {
			src: app.vault.getResourcePath(imageFile),
			alt: `${action.name} marker`,
		},
	});

	return true;
}

function renderActionDetails(action: ActionEntry, itemEl: HTMLElement): void {
	const modeSegment = formatActionMode(action.mode, action.modeValue);
	const damageSegment = formatActionDamage(action);
	const saveSegment = formatActionSaveSegment(action);
	const onHitSegment = formatActionTriggerSegment("On Hit", action.onHit);
	const onCritSegment = formatActionTriggerSegment("On Crit", action.onCrit);
	const flavorSegment = normalizeActionSegment(action.flavor);
	const extraSegments =
		action.extraText?.map((segment) => normalizeActionSegment(segment)).filter(
			(segment): segment is string => Boolean(segment),
		) ?? [];

	const hasStructuredContent =
		Boolean(modeSegment) ||
		Boolean(damageSegment) ||
		Boolean(saveSegment) ||
		Boolean(onHitSegment) ||
		Boolean(onCritSegment) ||
		Boolean(flavorSegment) ||
		extraSegments.length > 0;

	if (!hasStructuredContent) {
		const fallback = descLinesToSentence(action.desc);
		if (fallback) {
			appendActionSegment(itemEl, fallback, "nimble-statblock__action-text");
		}
		return;
	}

	const coreSegments: string[] = [];
	if (modeSegment) {
		coreSegments.push(modeSegment);
	}
	if (damageSegment) {
		coreSegments.push(damageSegment);
	}

	const mainSegments: string[] = [];
	if (coreSegments.length > 0) {
		mainSegments.push(coreSegments.join(" "));
	}
	if (saveSegment) {
		mainSegments.push(saveSegment);
	}
	if (onHitSegment) {
		mainSegments.push(onHitSegment);
	}
	if (onCritSegment) {
		mainSegments.push(onCritSegment);
	}
	mainSegments.push(...extraSegments);

	if (mainSegments.length > 0) {
		appendActionSegment(
			itemEl,
			mainSegments.join(", "),
			"nimble-statblock__action-text",
		);
	}

	if (flavorSegment) {
		appendActionSegment(itemEl, flavorSegment, "nimble-statblock__action-flavor");
	}
}

function formatActionMode(
	mode: ActionEntry["mode"],
	modeValue: ActionEntry["modeValue"],
): string | undefined {
	if (!mode || modeValue === undefined) {
		return undefined;
	}

	const normalizedValue =
		typeof modeValue === "number" ? String(modeValue) : modeValue.trim();
	if (!normalizedValue) {
		return undefined;
	}

	const numericValue = Number(normalizedValue);
	if (mode === "reach" && !Number.isNaN(numericValue) && numericValue === 1) {
		return undefined;
	}

	const label = mode === "reach" ? "Reach" : "Range";
	return `(${label} ${normalizedValue})`;
}

function formatActionSaveSegment(action: ActionEntry): string | undefined {
	if (!action.save) {
		return undefined;
	}

	const segments: string[] = [`(${formatActionSavePhrase(action.save)})`];
	if (action.save.onFail) {
		segments.push(`On Fail: ${action.save.onFail}`);
	}
	if (action.save.onSuccess) {
		segments.push(`On Success: ${action.save.onSuccess}`);
	}
	if (action.save.effect) {
		segments.push(action.save.effect);
	}

	return segments.join(", ");
}

function formatActionTriggerSegment(
	label: "On Hit" | "On Crit",
	trigger: ActionTriggerEffect | undefined,
): string | undefined {
	if (!trigger) {
		return undefined;
	}

	const segments: string[] = [];
	if (trigger.save) {
		segments.push(formatActionSavePhrase(trigger.save));
		if (trigger.save.onFail) {
			segments.push(`On Fail: ${trigger.save.onFail}`);
		}
		if (trigger.save.onSuccess) {
			segments.push(`On Success: ${trigger.save.onSuccess}`);
		}
		if (trigger.save.effect) {
			segments.push(trigger.save.effect);
		}
	}

	if (trigger.text) {
		segments.push(trigger.text);
	}

	if (segments.length === 0) {
		return undefined;
	}

	return `${label}: ${segments.join(", ")}`;
}

function formatActionSavePhrase(save: ActionSaveEntry): string {
	const dcSuffix =
		save.dc !== undefined && String(save.dc).trim()
			? ` (DC ${String(save.dc).trim()})`
			: "";
	return `${save.type} Save${dcSuffix}`;
}

function formatActionDamage(action: ActionEntry): string | undefined {
	const damage = normalizeActionSegment(action.damage);
	const damageType = normalizeActionSegment(action.damageType);
	if (damage && damageType) {
		return `${damage} ${damageType}`;
	}
	return damage ?? damageType;
}

function appendActionSegment(
	itemEl: HTMLElement,
	value: string,
	className: string,
): void {
	const normalized = normalizeActionSegment(value);
	if (!normalized) {
		return;
	}
	itemEl.createSpan({
		cls: className,
		text: ` ${ensureTrailingPunctuation(normalized)}`,
	});
}

function normalizeActionSegment(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed || undefined;
}

function ensureTrailingPunctuation(value: string): string {
	return /[.!?]$/.test(value) ? value : `${value}.`;
}

function renderSoloSection(statblock: MonsterStatblock, containerEl: HTMLElement): void {
	const sectionEl = containerEl.createDiv({ cls: "nimble-statblock__solo-section" });

	if (statblock.saves && Object.keys(statblock.saves).length > 0) {
		const savesEl = sectionEl.createDiv({ cls: "nimble-statblock__saves" });
		const orderedSaves: Array<{ key: string; value: number }> = [
			{ key: "DEX", value: statblock.saves.dex ?? 0 },
			{ key: "WIL", value: statblock.saves.wil ?? 0 },
			{ key: "STR", value: statblock.saves.str ?? 0 },
			{ key: "INT", value: statblock.saves.int ?? 0 },
		];
		for (const save of orderedSaves) {
			savesEl.createDiv({
				cls: "nimble-statblock__save",
				text: `${save.key} ${formatModifier(save.value)}`,
			});
		}
	}

	if (statblock.lastStand) {
		sectionEl.createDiv({
			cls: "nimble-statblock__solo-line",
			text: `Last stand: ${statblock.lastStand}`,
		});
	}

	if (statblock.bloodied) {
		sectionEl.createDiv({
			cls: "nimble-statblock__solo-line",
			text: `Bloodied: ${statblock.bloodied}`,
		});
	}
}

function renderLegendarySoloSections(
	app: App,
	statblock: MonsterStatblock,
	containerEl: HTMLElement,
	sourcePath: string,
): void {
	const bloodiedState = normalizeLegendaryPhaseState(
		statblock.bloodiedState,
		statblock.bloodied,
	);
	const lastStandState = normalizeLegendaryPhaseState(
		statblock.lastStandState,
		statblock.lastStand,
	);

	const hasBloodied = Boolean(bloodiedState);
	const hasLastStand = Boolean(lastStandState);
	if (!hasBloodied && !hasLastStand) {
		return;
	}

	const sectionEl = containerEl.createDiv({ cls: "nimble-statblock__legendary-phases" });

	if (bloodiedState) {
		renderLegendaryPhase(app, sectionEl, sourcePath, "Bloodied", bloodiedState);
	}

	if (lastStandState) {
		renderLegendaryPhase(app, sectionEl, sourcePath, "Last Stand", lastStandState);
	}
}

function normalizeLegendaryPhaseState(
	state: SoloPhaseState | undefined,
	fallbackText: string | undefined,
): SoloPhaseState | undefined {
	const abilities = [
		...(state?.abilities ?? []),
		...(fallbackText
			? [
				{
					desc: [fallbackText],
				} satisfies SoloPhaseAbility,
			]
			: []),
	]
		.map((entry) => normalizeLegendaryPhaseAbility(entry))
		.filter((entry): entry is SoloPhaseAbility => Boolean(entry));

	const uniqueAbilities = Array.from(
		new Map(
			abilities.map((entry) => [legendaryPhaseAbilitySignature(entry), entry]),
		).values(),
	);
	const hpThreshold = state?.hpThreshold;

	if (uniqueAbilities.length === 0 && hpThreshold === undefined) {
		return undefined;
	}

	const normalized: SoloPhaseState = {
		abilities: uniqueAbilities,
	};
	if (hpThreshold !== undefined) {
		normalized.hpThreshold = hpThreshold;
	}
	return normalized;
}

function normalizeLegendaryPhaseAbility(
	entry: SoloPhaseAbility,
): SoloPhaseAbility | undefined {
	const name = entry.name?.trim();
	const image = entry.image?.trim();
	const desc = entry.desc
		.map((line) => (typeof line === "string" ? line.trim() : line))
		.filter((line) => (typeof line === "string" ? Boolean(line) : true));

	if (!name && !image && desc.length === 0) {
		return undefined;
	}

	const normalized: SoloPhaseAbility = { desc };
	if (name) {
		normalized.name = name;
	}
	if (image) {
		normalized.image = image;
	}
	return normalized;
}

function legendaryPhaseAbilitySignature(entry: SoloPhaseAbility): string {
	const desc = entry.desc
		.map((line) => (typeof line === "string" ? line : JSON.stringify(line)))
		.join("|");
	return `${entry.name ?? ""}::${desc}::${entry.image ?? ""}`;
}

function renderLegendaryPhase(
	app: App,
	containerEl: HTMLElement,
	sourcePath: string,
	label: "Bloodied" | "Last Stand",
	state: SoloPhaseState,
): void {
	const phaseEl = containerEl.createDiv({ cls: "nimble-statblock__legendary-phase" });
	const thresholdText =
		state.hpThreshold !== undefined && String(state.hpThreshold).trim()
			? ` (${String(state.hpThreshold).trim()} HP)`
			: "";
	phaseEl.createDiv({
		cls: "nimble-statblock__legendary-phase-title",
		text: `${label}${thresholdText}:`,
	});

	if (state.abilities.length === 0) {
		return;
	}

	const listEl = phaseEl.createEl("ul", {
		cls: ["nimble-statblock__legendary-phase-list", "nimble-statblock__actions"],
	});
	for (const ability of state.abilities) {
		const itemEl = listEl.createEl("li", {
			cls: ["nimble-statblock__legendary-phase-item", "nimble-statblock__action-line"],
		});
		const hasImage = renderLegendaryPhaseAbilityImage(
			app,
			ability,
			itemEl,
			sourcePath,
		);
		if (hasImage) {
			itemEl.addClass("nimble-statblock__action-line-has-image");
		}

		const contentEl = itemEl.createSpan({ cls: "nimble-statblock__action-content" });
		const name = ability.name?.trim();
		if (name) {
			contentEl.createSpan({
				cls: "nimble-statblock__action-name",
				text: formatPhaseAbilityName(name),
			});
		}

		const detailText = descLinesToSentence(ability.desc);
		const normalizedDetail = normalizeActionSegment(detailText);
		if (normalizedDetail) {
			contentEl.createSpan({
				cls: "nimble-statblock__action-text",
				text: name
					? ` ${ensureTrailingPunctuation(normalizedDetail)}`
					: ensureTrailingPunctuation(normalizedDetail),
			});
		}
	}
}

function renderLegendaryPhaseAbilityImage(
	app: App,
	ability: SoloPhaseAbility,
	containerEl: HTMLElement,
	sourcePath: string,
): boolean {
	if (!ability.image) {
		return false;
	}

	const imageFile = resolveLinkedFile(app, sourcePath, ability.image);
	if (!imageFile) {
		return false;
	}

	containerEl.createEl("img", {
		cls: "nimble-statblock__action-image",
		attr: {
			src: app.vault.getResourcePath(imageFile),
			alt: `${ability.name ?? "Phase ability"} marker`,
		},
	});

	return true;
}

function formatPhaseAbilityName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) {
		return "";
	}
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function descLinesToSentence(lines: AbilityDescLine[]): string {
	const segments: string[] = [];
	for (const line of lines) {
		if (typeof line === "string") {
			const cleaned = line.trim();
			if (cleaned) {
				segments.push(cleaned);
			}
			continue;
		}

		const objectEntries = Object.entries(line);
		for (const [key, value] of objectEntries) {
			segments.push(formatDescObjectEntry(key, value));
		}
	}

	return segments.join(" ");
}

function formatDescObjectEntry(key: string, value: string | number | boolean): string {
	const normalized = key.trim().toLowerCase();
	const valueText = String(value).trim();

	if (
		normalized === "range/reach" ||
		normalized === "range" ||
		normalized === "reach" ||
		normalized === "trigger" ||
		normalized === "condition"
	) {
		return `(${toTitleCase(key)} ${valueText})`;
	}

	if (normalized === "damage" || normalized === "flavor") {
		return valueText;
	}

	return `${toTitleCase(key)}: ${valueText}`;
}

function formatModifier(value: number): string {
	return value >= 0 ? `+${value}` : `${value}`;
}

function toTitleCase(value: string): string {
	if (!value) {
		return "";
	}
	return value
		.split(/[\s/_-]+/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

type ItemRarityColorClass = "nimble-rarity-uncommon" | "nimble-rarity-rare" | "nimble-rarity-very-rare" | "nimble-rarity-legendary" | "nimble-rarity-mythical";

const RARITY_COLOR_CLASSES: Record<ItemRarity, ItemRarityColorClass> = {
	"uncommon": "nimble-rarity-uncommon",
	"rare": "nimble-rarity-rare",
	"very rare": "nimble-rarity-very-rare",
	"legendary": "nimble-rarity-legendary",
	"mythical": "nimble-rarity-mythical",
};

export function renderItemStatblock(
	app: App,
	statblock: ItemStatblock,
	containerEl: HTMLElement,
	sourcePath: string,
): void {
	containerEl.empty();

	const hostEl = containerEl.createDiv({ cls: "nimble-statblock-host" });
	const controlsEl = hostEl.createDiv({ cls: "nimble-statblock-controls" });
	const statblockEl = hostEl.createDiv({
		cls: ["nimble-statblock", "nimble-layout-item"],
	});

	renderItemImage(app, statblock, statblockEl, sourcePath);
	renderItemHeader(statblock, statblockEl);
	renderItemEntries(statblock.entries, statblockEl);

	if (statblock.flavor) {
		renderItemFlavor(statblock.flavor, statblockEl);
	}

	renderItemExportButton(controlsEl, statblock, statblockEl);
}

function renderItemImage(
	app: App,
	statblock: ItemStatblock,
	containerEl: HTMLElement,
	sourcePath: string,
): void {
	if (!statblock.image) {
		return;
	}

	const imageFile = resolveLinkedFile(app, sourcePath, statblock.image);
	if (!imageFile) {
		return;
	}

	containerEl.createEl("img", {
		cls: "nimble-statblock__image",
		attr: {
			src: app.vault.getResourcePath(imageFile),
			alt: `${statblock.name} art`,
		},
	});
}

function renderItemHeader(statblock: ItemStatblock, containerEl: HTMLElement): void {
	const headerEl = containerEl.createDiv({ cls: "nimble-statblock__header-row" });
	const titleEl = headerEl.createDiv({ cls: "nimble-statblock__title-row" });

	titleEl.createEl("span", {
		cls: ["nimble-statblock__name", "nimble-statblock__name-item", RARITY_COLOR_CLASSES[statblock.rarity]],
		text: statblock.name,
	});

	const metaParts: string[] = [statblock.rarity.charAt(0).toUpperCase() + statblock.rarity.slice(1)];
	if (statblock.itemType) {
		metaParts.push(statblock.itemType);
	}
	if (statblock.requirements) {
		metaParts.push(`Requires ${statblock.requirements}`);
	}
	if (statblock.price) {
		metaParts.push(statblock.price);
	}

	titleEl.createEl("span", {
		cls: "nimble-statblock__meta",
		text: metaParts.join(" · "),
	});
}

function renderItemEntries(entries: ItemEntry[], containerEl: HTMLElement): void {
	if (entries.length === 0) {
		return;
	}

	const entriesEl = containerEl.createDiv({ cls: "nimble-statblock__item-entries" });

	for (const entry of entries) {
		const entryEl = entriesEl.createDiv({ cls: "nimble-statblock__item-entry" });
		const labelEl = entryEl.createSpan({
			cls: "nimble-statblock__item-entry-name",
			text: `${entry.name}:`,
		});
		const detailText = descLinesToSentence(entry.desc);
		if (detailText) {
			entryEl.createSpan({
				cls: "nimble-statblock__item-entry-text",
				text: ` ${detailText}`,
			});
		}
	}
}

function renderItemFlavor(flavor: string, containerEl: HTMLElement): void {
	containerEl.createDiv({
		cls: "nimble-statblock__item-flavor",
		text: flavor,
	});
}

function renderItemExportButton(
	containerEl: HTMLElement,
	statblock: ItemStatblock,
	exportRoot: HTMLElement,
): void {
	const menuTriggerEl = containerEl.createEl("button", {
		cls: ["clickable-icon", "nimble-statblock-menu-trigger"],
		attr: {
			type: "button",
			"aria-label": "Statblock options",
			"aria-haspopup": "menu",
		},
	});
	setIcon(menuTriggerEl, "more-horizontal");

	menuTriggerEl.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();

		const menu = new Menu();
		menu.addItem((item) => {
			item
				.setTitle("Export as PNG")
				.setIcon("image")
				.onClick(() => void handleItemPngExport(exportRoot, statblock.name));
		});
		menu.showAtMouseEvent(event);
	});
}

async function handleItemPngExport(
	exportRoot: HTMLElement,
	itemName: string,
): Promise<void> {
	try {
		const outputPath = await exportElementAsPng(exportRoot, `${itemName}-item`);
		new Notice(`PNG exported: ${outputPath}`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error while exporting PNG.";
		new Notice(`PNG export failed: ${message}`);
	}
}

async function handleJsonExport(
	app: App,
	statblock: MonsterStatblock,
	sourcePath: string,
): Promise<void> {
	try {
		const outputPath = await exportMonsterAsJson(app, statblock, sourcePath);
		new Notice(`Nimble JSON exported: ${outputPath}`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error while exporting JSON.";
		new Notice(`JSON export failed: ${message}`);
	}
}

async function handlePngExport(
	exportRoot: HTMLElement,
	monsterName: string,
): Promise<void> {
	try {
		const outputPath = await exportElementAsPng(exportRoot, `${monsterName}-statblock`);
		new Notice(`PNG exported: ${outputPath}`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error while exporting PNG.";
		new Notice(`PNG export failed: ${message}`);
	}
}
