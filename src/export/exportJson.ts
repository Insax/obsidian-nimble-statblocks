import { App } from "obsidian";
import { buildEmbeddedAsset } from "./assets";
import type {
	ExportAbilityEntry,
	ExportAttackEntry,
	ExportMonsterArmor,
	ExportMonsterKind,
	ExportMonsterSize,
	ExportMonsterStatblock,
	ExportMovementMode,
	ExportPhaseEntry,
	ExportPhaseItemEntry,
	ExportSaveKey,
	NimbleMonsterExportDocument,
} from "../types/export";
import type {
	AbilityDescLine,
	AbilityEntry,
	ActionEntry,
	ActionSaveEntry,
	ActionTriggerEffect,
	MonsterLayout,
	MonsterStatblock,
	SaveMap,
	SoloPhaseAbility,
	SoloPhaseState,
	SpeedEntry,
} from "../types/statblock";
import { sanitizeFileName, writeTextToDownloads } from "../utils/downloads";

const ENTRY_IMAGE_MAX_PX = 40;
const EXPORT_SCHEMA_VERSION = "1.0";
const SAVE_KEYS: ExportSaveKey[] = ["str", "dex", "int", "wil"];
const MOVEMENT_ORDER: ExportMovementMode[] = ["walk", "fly", "swim", "climb", "burrow"];
const MOVEMENT_DEFAULTS: Record<ExportMovementMode, number> = {
	walk: 6,
	fly: 0,
	swim: 0,
	climb: 0,
	burrow: 0,
};
const VALID_SIZES = new Set<ExportMonsterSize>([
	"tiny",
	"small",
	"medium",
	"large",
	"huge",
	"gargantuan",
]);
const VALID_ARMOR_VALUES = new Set<ExportMonsterArmor>(["none", "medium", "heavy"]);
const SAVE_TYPE_TO_IMPORTER: Record<
	ActionSaveEntry["type"],
	"strength" | "dexterity" | "intelligence" | "will"
> = {
	STR: "strength",
	DEX: "dexterity",
	INT: "intelligence",
	WIL: "will",
};

export async function exportMonsterAsJson(
	app: App,
	statblock: MonsterStatblock,
	sourcePath: string,
): Promise<string> {
	const exportMonster = await buildExportMonster(app, statblock, sourcePath);
	const document: NimbleMonsterExportDocument = {
		schemaVersion: EXPORT_SCHEMA_VERSION,
		imports: [
			{
				kind: "monster",
				data: exportMonster,
			},
		],
	};

	const fileName = `${sanitizeFileName(statblock.name)}.nimble.json`;
	const payload = JSON.stringify(document, null, 2);
	return writeTextToDownloads(fileName, payload);
}

async function buildExportMonster(
	app: App,
	statblock: MonsterStatblock,
	sourcePath: string,
): Promise<ExportMonsterStatblock> {
	const abilities = await buildExportAbilities(app, statblock.features, sourcePath);
	const attacks = await buildExportAttacks(app, statblock.actions, sourcePath);

	const exportMonster: ExportMonsterStatblock = {
		name: statblock.name,
		monsterType: normalizeMonsterType(statblock.layout),
		level: normalizeLevel(statblock.level),
		creatureType: normalizeText(statblock.creatureType ?? statblock.archetype),
		description: normalizeText(statblock.description ?? statblock.subtitle),
		size: normalizeSize(statblock.size),
		armor: normalizeArmor(statblock.armorType, statblock.armor),
		hp: normalizeHp(statblock),
		speed: normalizeSpeedForExport(statblock.speed),
		saves: normalizeSavesForExport(statblock.saves),
		abilities,
		attacks,
	};

	const actionsInstructions = normalizeText(statblock.actionsInstructions);
	if (actionsInstructions) {
		exportMonster.actionsInstructions = actionsInstructions;
	}

	if (statblock.image) {
		const imageAsset = await buildEmbeddedAsset(app, sourcePath, statblock.image);
		if (imageAsset) {
			exportMonster.image = imageAsset;
		}
	}

	const bloodiedPhase = await buildPhaseExport(
		app,
		sourcePath,
		statblock.bloodied,
		statblock.bloodiedState,
	);
	if (bloodiedPhase) {
		exportMonster.bloodied = bloodiedPhase;
	}

	const lastStandPhase = await buildPhaseExport(
		app,
		sourcePath,
		statblock.lastStand,
		statblock.lastStandState,
	);
	if (lastStandPhase) {
		exportMonster.lastStand = lastStandPhase;
	}

	return exportMonster;
}

async function buildExportAbilities(
	app: App,
	entries: AbilityEntry[],
	sourcePath: string,
): Promise<ExportAbilityEntry[]> {
	const exportedEntries: ExportAbilityEntry[] = [];

	for (const entry of entries) {
		const exportEntry: ExportAbilityEntry = {
			name: formatExportEntryName(normalizeText(entry.name, "Ability")),
			description: descLinesToSentence(entry.desc),
		};

		if (entry.image) {
			const imageAsset = await buildEmbeddedAsset(app, sourcePath, entry.image, {
				maxWidth: ENTRY_IMAGE_MAX_PX,
				maxHeight: ENTRY_IMAGE_MAX_PX,
			});
			if (imageAsset) {
				exportEntry.image = imageAsset;
			}
		}

		exportedEntries.push(exportEntry);
	}

	return exportedEntries;
}

async function buildExportAttacks(
	app: App,
	entries: ActionEntry[],
	sourcePath: string,
): Promise<ExportAttackEntry[]> {
	const exportedEntries: ExportAttackEntry[] = [];

	for (const entry of entries) {
		const exportEntry: ExportAttackEntry = {
			name: formatExportEntryName(normalizeText(entry.name, "Attack")),
			description: buildActionDescription(entry),
		};

		const damageRoll = buildDamageRoll(entry.damage, entry.damageType);
		if (damageRoll) {
			exportEntry.damage = { roll: damageRoll };
		}

		const target = buildAttackTarget(entry);
		if (target) {
			exportEntry.target = target;
		}

		const effects = buildAttackEffects(entry);
		if (effects.length > 0) {
			exportEntry.effects = effects;
		}

		if (entry.image) {
			const imageAsset = await buildEmbeddedAsset(app, sourcePath, entry.image, {
				maxWidth: ENTRY_IMAGE_MAX_PX,
				maxHeight: ENTRY_IMAGE_MAX_PX,
			});
			if (imageAsset) {
				exportEntry.image = imageAsset;
			}
		}

		exportedEntries.push(exportEntry);
	}

	return exportedEntries;
}

async function buildPhaseExport(
	app: App,
	sourcePath: string,
	directDescription: string | undefined,
	state: SoloPhaseState | undefined,
): Promise<ExportPhaseEntry | undefined> {
	const descriptionParts: string[] = [];
	const normalizedDescription = normalizeText(directDescription);
	if (normalizedDescription) {
		descriptionParts.push(normalizedDescription);
	}

	if (state?.hpThreshold !== undefined) {
		descriptionParts.push(`HP threshold: ${String(state.hpThreshold).trim()}`);
	}

	let phaseImage: ExportPhaseEntry["image"];
	const items: ExportPhaseItemEntry[] = [];

	for (const ability of state?.abilities ?? []) {
		const normalizedAbility = await normalizePhaseAbility(app, sourcePath, ability);
		if (!normalizedAbility) {
			continue;
		}

		if (!normalizedAbility.name) {
			if (normalizedAbility.description) {
				descriptionParts.push(normalizedAbility.description);
			}
			if (!phaseImage && normalizedAbility.image) {
				phaseImage = normalizedAbility.image;
			}
			continue;
		}

		const item: ExportPhaseItemEntry = {
			name: normalizedAbility.name,
			description: normalizedAbility.description,
		};
		if (normalizedAbility.image) {
			item.image = normalizedAbility.image;
		}
		items.push(item);
	}

	const description = dedupeStrings(descriptionParts).join(" ").trim();
	if (!description && !phaseImage && items.length === 0) {
		return undefined;
	}

	const phase: ExportPhaseEntry = {
		description,
	};

	if (phaseImage) {
		phase.image = phaseImage;
	}

	if (items.length > 0) {
		phase.items = items;
	}

	return phase;
}

async function normalizePhaseAbility(
	app: App,
	sourcePath: string,
	ability: SoloPhaseAbility,
): Promise<{ name?: string; description: string; image?: ExportPhaseItemEntry["image"] } | undefined> {
	const name = normalizeText(ability.name);
	const description = descLinesToSentence(ability.desc);

	let image: ExportPhaseItemEntry["image"];
	if (ability.image) {
		image = await buildEmbeddedAsset(app, sourcePath, ability.image, {
			maxWidth: ENTRY_IMAGE_MAX_PX,
			maxHeight: ENTRY_IMAGE_MAX_PX,
		});
	}

	if (!name && !description && !image) {
		return undefined;
	}

	return {
		name: name || undefined,
		description,
		image,
	};
}

function buildActionDescription(action: ActionEntry): string {
	const modeSegment = formatActionModeSegment(action.mode, action.modeValue);
	const damageSegment = formatActionDamageSegment(action);
	const saveSegment = formatActionSaveSegment(action.save);
	const onHitSegment = formatActionTriggerSegment("On Hit", action.onHit);
	const onCritSegment = formatActionTriggerSegment("On Crit", action.onCrit);
	const flavorSegment = normalizeActionDescriptionSegment(action.flavor);
	const extraSegments =
		action.extraText
			?.map((segment) => normalizeActionDescriptionSegment(segment))
			.filter((segment): segment is string => Boolean(segment)) ?? [];

	const hasStructuredContent =
		Boolean(modeSegment) ||
		Boolean(damageSegment) ||
		Boolean(saveSegment) ||
		Boolean(onHitSegment) ||
		Boolean(onCritSegment) ||
		Boolean(flavorSegment) ||
		extraSegments.length > 0;

	if (!hasStructuredContent) {
		const fallback = normalizeActionDescriptionSegment(descLinesToSentence(action.desc));
		return fallback ? ensureTrailingPunctuation(fallback) : "";
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

	const descriptionSegments: string[] = [];
	if (mainSegments.length > 0) {
		descriptionSegments.push(ensureTrailingPunctuation(mainSegments.join(", ")));
	}
	if (flavorSegment) {
		descriptionSegments.push(ensureTrailingPunctuation(flavorSegment));
	}

	return descriptionSegments.join(" ");
}

function formatActionModeSegment(
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

function formatActionSaveSegment(save: ActionEntry["save"]): string | undefined {
	if (!save) {
		return undefined;
	}

	const segments: string[] = [`(${formatActionSavePhrase(save)})`];
	if (save.onFail) {
		segments.push(`On Fail: ${save.onFail}`);
	}
	if (save.onSuccess) {
		segments.push(`On Success: ${save.onSuccess}`);
	}
	if (save.effect) {
		segments.push(save.effect);
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

function formatActionDamageSegment(action: ActionEntry): string | undefined {
	const damage = normalizeActionDescriptionSegment(action.damage);
	const damageType = normalizeActionDescriptionSegment(action.damageType);
	if (damage && damageType) {
		return `${damage} ${damageType}`;
	}
	return damage ?? damageType;
}

function normalizeActionDescriptionSegment(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed || undefined;
}

function ensureTrailingPunctuation(value: string): string {
	return /[.!?]$/.test(value) ? value : `${value}.`;
}

function buildDamageRoll(
	damage: string | undefined,
	damageType: string | undefined,
): string | undefined {
	const normalizedDamage = normalizeText(damage);
	if (!normalizedDamage) {
		return undefined;
	}

	const normalizedDamageType = normalizeText(damageType).toLowerCase();
	if (!normalizedDamageType) {
		return normalizedDamage;
	}

	const lowerDamage = normalizedDamage.toLowerCase();
	if (lowerDamage.includes(normalizedDamageType)) {
		return normalizedDamage;
	}

	return `${normalizedDamage} ${normalizedDamageType}`;
}

function buildAttackTarget(action: ActionEntry): { reach?: number; range?: number } | undefined {
	const normalizedModeValue = coerceNumber(action.modeValue);
	if (normalizedModeValue === undefined || normalizedModeValue < 0) {
		return undefined;
	}

	if (action.mode === "reach") {
		return { reach: normalizedModeValue };
	}

	if (action.mode === "range") {
		return { range: normalizedModeValue };
	}

	return undefined;
}

function buildAttackEffects(action: ActionEntry): Record<string, unknown>[] {
	const effects: Record<string, unknown>[] = [];

	const baseSaveEffect = buildSaveEffect(action.save, action);
	if (baseSaveEffect) {
		effects.push(baseSaveEffect);
	}

	const onHitSummary = summarizeTrigger("On hit", action.onHit);
	if (onHitSummary) {
		effects.push({
			type: "note",
			text: onHitSummary,
			noteType: "general",
		});
	}

	const onCritSummary = summarizeTrigger("On critical hit", action.onCrit);
	if (onCritSummary) {
		effects.push({
			type: "note",
			text: onCritSummary,
			noteType: "general",
		});
	}

	for (const line of action.extraText ?? []) {
		const normalized = normalizeText(line);
		if (!normalized) {
			continue;
		}

		effects.push({
			type: "note",
			text: normalized,
			noteType: "general",
		});
	}

	return effects;
}

function buildSaveEffect(
	save: ActionSaveEntry | undefined,
	action: ActionEntry,
): Record<string, unknown> | undefined {
	if (!save) {
		return undefined;
	}

	const importerSaveType = SAVE_TYPE_TO_IMPORTER[save.type];
	const saveEffect: Record<string, unknown> = {
		type: "savingThrow",
		saveType: importerSaveType,
		sharedRolls: [],
	};

	const normalizedDc = coerceNumber(save.dc);
	if (normalizedDc !== undefined) {
		saveEffect.dc = normalizedDc;
	}

	const damageFormula = extractDamageFormula(action.damage);
	if (damageFormula) {
		const sharedRollDamage: Record<string, unknown> = {
			type: "damage",
			formula: damageFormula,
		};
		const normalizedDamageType = normalizeDamageType(action.damageType);
		if (normalizedDamageType) {
			sharedRollDamage.damageType = normalizedDamageType;
		}
		(saveEffect.sharedRolls as Record<string, unknown>[]).push(sharedRollDamage);
	}

	const on: Record<string, Record<string, unknown>[]> = {};
	const failedSaveEffects = buildTextEffects(save.onFail);
	if (failedSaveEffects.length > 0) {
		on.failedSave = failedSaveEffects;
	}

	const passedSaveEffects = buildTextEffects(save.onSuccess);
	if (passedSaveEffects.length > 0) {
		on.passedSave = passedSaveEffects;
	}

	const genericEffect = buildTextEffects(save.effect);
	if (genericEffect.length > 0) {
		on.failedSave = [...(on.failedSave ?? []), ...genericEffect];
	}

	if (Object.keys(on).length > 0) {
		saveEffect.on = on;
	}

	return saveEffect;
}

function buildTextEffects(value: string | undefined): Record<string, unknown>[] {
	const text = normalizeText(value);
	if (!text) {
		return [];
	}

	const damageFormula = extractDamageFormula(text);
	if (!damageFormula) {
		return [
			{
				type: "note",
				text,
				noteType: "general",
			},
		];
	}

	const damageEffect: Record<string, unknown> = {
		type: "damage",
		formula: damageFormula,
	};
	const damageType = extractDamageType(text);
	if (damageType) {
		damageEffect.damageType = damageType;
	}

	return [damageEffect];
}

function summarizeActionSave(save: ActionSaveEntry | undefined): string {
	if (!save) {
		return "";
	}

	const parts: string[] = [];
	const dcText = save.dc !== undefined ? ` DC ${String(save.dc).trim()}` : "";
	parts.push(`Save ${save.type}${dcText}`.trim());

	const onFail = normalizeText(save.onFail);
	if (onFail) {
		parts.push(`On fail: ${onFail}`);
	}

	const onSuccess = normalizeText(save.onSuccess);
	if (onSuccess) {
		parts.push(`On success: ${onSuccess}`);
	}

	const effect = normalizeText(save.effect);
	if (effect) {
		parts.push(effect);
	}

	return parts.join(". ");
}

function summarizeTrigger(prefix: string, trigger: ActionTriggerEffect | undefined): string {
	if (!trigger) {
		return "";
	}

	const parts: string[] = [];
	const triggerText = normalizeText(trigger.text);
	if (triggerText) {
		parts.push(triggerText);
	}

	const saveSummary = summarizeActionSave(trigger.save);
	if (saveSummary) {
		parts.push(saveSummary);
	}

	if (parts.length === 0) {
		return "";
	}

	return `${prefix}: ${parts.join(". ")}`;
}

function normalizeMonsterType(layout: MonsterLayout): ExportMonsterKind {
	if (layout === "legendary") {
		return "solo";
	}
	return layout;
}

function normalizeLevel(level: string): string {
	return normalizeText(level, "1");
}

function normalizeSize(size: string): ExportMonsterSize {
	const normalized = normalizeText(size, "medium").toLowerCase();
	if (VALID_SIZES.has(normalized as ExportMonsterSize)) {
		return normalized as ExportMonsterSize;
	}
	return "medium";
}

function normalizeArmor(
	armorType: string | undefined,
	armorValue: number | string | undefined,
): ExportMonsterArmor {
	const explicitArmorType = normalizeArmorText(armorType);
	if (explicitArmorType) {
		return explicitArmorType;
	}

	const normalizedArmorText = normalizeArmorText(
		typeof armorValue === "string" ? armorValue : undefined,
	);
	if (normalizedArmorText) {
		return normalizedArmorText;
	}

	const numericArmor = coerceNumber(armorValue);
	if (numericArmor === undefined || numericArmor <= 0) {
		return "none";
	}

	return numericArmor >= 16 ? "heavy" : "medium";
}

function normalizeArmorText(value: string | undefined): ExportMonsterArmor | undefined {
	const normalized = normalizeText(value).toLowerCase();
	if (!normalized) {
		return undefined;
	}

	if (VALID_ARMOR_VALUES.has(normalized as ExportMonsterArmor)) {
		return normalized as ExportMonsterArmor;
	}

	if (normalized === "m" || normalized === "med" || normalized === "mediumarmor") {
		return "medium";
	}

	if (normalized === "h" || normalized === "heavyarmor") {
		return "heavy";
	}

	if (normalized === "n" || normalized === "no" || normalized === "noarmor") {
		return "none";
	}

	return undefined;
}

function normalizeHp(statblock: MonsterStatblock): { max: number; value: number; temp: number } {
	const numericHp = coerceNumber(statblock.hp);
	const fallbackFromLevel = coerceNumber(statblock.level);
	const fallbackHp =
		fallbackFromLevel !== undefined && fallbackFromLevel > 0
			? Math.max(1, Math.round(fallbackFromLevel * 8))
			: 1;

	const max = numericHp !== undefined && numericHp > 0 ? Math.round(numericHp) : fallbackHp;
	return {
		max,
		value: max,
		temp: 0,
	};
}

function normalizeSavesForExport(saves: SaveMap | undefined): Partial<Record<ExportSaveKey, number>> {
	const normalized: Partial<Record<ExportSaveKey, number>> = {
		str: 0,
		dex: 0,
		int: 0,
		wil: 0,
	};

	if (!saves) {
		return normalized;
	}

	for (const key of SAVE_KEYS) {
		const raw = saves[key];
		if (typeof raw === "number" && Number.isFinite(raw)) {
			normalized[key] = raw;
		}
	}

	return normalized;
}

function normalizeSpeedForExport(
	speedEntries: SpeedEntry[],
): Record<ExportMovementMode, number> {
	const normalizedSpeed: Record<ExportMovementMode, number> = {
		...MOVEMENT_DEFAULTS,
	};

	for (const speedEntry of speedEntries) {
		const normalizedType = speedEntry.type.trim().toLowerCase();
		if (!isMovementType(normalizedType)) {
			continue;
		}

		const numericValue = coerceNumber(speedEntry.value);
		if (numericValue === undefined || numericValue < 0) {
			continue;
		}

		normalizedSpeed[normalizedType] = numericValue;
	}

	return normalizedSpeed;
}

function isMovementType(value: string): value is ExportMovementMode {
	return value === "walk" || value === "fly" || value === "swim" || value === "climb" || value === "burrow";
}

function descLinesToSentence(lines: AbilityDescLine[]): string {
	const segments: string[] = [];
	for (const line of lines) {
		if (typeof line === "string") {
			const cleaned = normalizeText(line);
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

	return segments.join(" ").trim();
}

function formatDescObjectEntry(key: string, value: string | number | boolean): string {
	const normalized = key.trim().toLowerCase();
	const valueText = normalizeText(String(value));

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

function toTitleCase(value: string): string {
	return value
		.split(/[\s/_-]+/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

function normalizeText(value: unknown, fallback = ""): string {
	if (typeof value !== "string") {
		return fallback;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : fallback;
}

function formatExportEntryName(name: string): string {
	const normalized = normalizeText(name);
	if (!normalized) {
		return normalized;
	}

	return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function coerceNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value !== "string") {
		return undefined;
	}

	const normalized = value.trim();
	if (!normalized) {
		return undefined;
	}

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed)) {
		return undefined;
	}

	return parsed;
}

function extractDamageFormula(value: string | undefined): string | undefined {
	const normalized = normalizeText(value);
	if (!normalized) {
		return undefined;
	}

	const formulaMatch = normalized.match(/([\d]+d[\d]+(?:\s*[+-]\s*[\d]+)?)/i);
	if (!formulaMatch) {
		return undefined;
	}

	return formulaMatch[1]?.replace(/\s+/g, "") ?? undefined;
}

function extractDamageType(value: string | undefined): string | undefined {
	const normalized = normalizeText(value);
	if (!normalized) {
		return undefined;
	}

	const damageTypeMatch = normalized.match(
		/[\d]+d[\d]+(?:\s*[+-]\s*[\d]+)?\s+([a-zA-Z]+)/i,
	);
	if (!damageTypeMatch || !damageTypeMatch[1]) {
		return undefined;
	}

	return normalizeDamageType(damageTypeMatch[1]);
}

function normalizeDamageType(value: string | undefined): string | undefined {
	const normalized = normalizeText(value).toLowerCase();
	return normalized || undefined;
}

function dedupeStrings(values: string[]): string[] {
	const deduped: string[] = [];
	const seen = new Set<string>();

	for (const value of values) {
		const normalized = normalizeText(value);
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		deduped.push(normalized);
	}

	return deduped;
}
