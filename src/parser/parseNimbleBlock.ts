import { parseYaml } from "obsidian";
import type {
	AbilityDescLine,
	AbilityDescObject,
	AbilityEntry,
	ActionEntry,
	ActionMode,
	ActionSaveEntry,
	ActionTriggerEffect,
	ItemEntry,
	ItemPrice,
	ItemRarity,
	ItemStatblock,
	MonsterLayout,
	MonsterStatblock,
	ParseResult,
	SaveKey,
	SaveMap,
	SoloPhaseAbility,
	SoloPhaseState,
	SpeedEntry,
} from "../types/statblock";

const DEFAULT_LAYOUT: MonsterLayout = "normal";
const DEFAULT_LEVEL = "1";
const DEFAULT_SIZE = "medium";

const VALID_RARITIES: ItemRarity[] = ["uncommon", "rare", "very rare", "legendary", "mythical"];

export function parseNimbleBlock(source: string): ParseResult {
	let parsedSource: unknown;

	try {
		parsedSource = parseYaml(source);
	} catch {
		return {
			error: { message: "Invalid YAML in nimble block." },
		};
	}

	if (!isRecord(parsedSource)) {
		return {
			error: { message: "Nimble block must be a YAML object." },
		};
	}

	const layout = parseLayout(parsedSource.layout);

	if (layout === "item") {
		return parseItemBlock(parsedSource);
	}

	const name = asTrimmedString(parsedSource.name);
	if (!name) {
		return {
			error: { message: "Field 'name' is required." },
		};
	}

	const level = normalizeLevelDisplay(asDisplayValue(parsedSource.level, DEFAULT_LEVEL));
	const size = asDisplayValue(parsedSource.size, DEFAULT_SIZE).toLowerCase();
	const archetype = asOptionalString(
		parsedSource.archetype ?? parsedSource.arch_type ?? parsedSource.archeType,
	);
	const creatureType = asOptionalString(
		parsedSource.creature_type ??
			parsedSource.creatureType ??
			parsedSource.creature ??
			parsedSource.type,
	);
	const subtitle = asOptionalString(
		parsedSource.subtitle ?? parsedSource.sub_title ?? parsedSource.subTitle,
	);
	const description = asOptionalString(parsedSource.description ?? parsedSource.desc);
	const armorType = asOptionalString(parsedSource.armor_type ?? parsedSource.armorType);
	const hp = parseHpValue(parsedSource.hp);
	const armor = asNumberOrString(parsedSource.armor);
	const image = asOptionalLinkString(parsedSource.image);
	const actionsInstructions = asOptionalString(
		parsedSource.actions_instructions ??
			parsedSource.actionsInstructions ??
			parsedSource.action_sequence ??
			parsedSource.actionSequence ??
			parsedSource.attack_sequence ??
			parsedSource.attackSequence,
	);
	const speed = parseSpeed(parsedSource.speed);
	const features = parseAbilityList(parsedSource.features ?? parsedSource.abilities);
	const actions = parseActionList(parsedSource.actions ?? parsedSource.attacks);

	const statblock: MonsterStatblock = {
		name,
		layout,
		level,
		size,
		image,
		speed,
		features,
		actions,
	};

	if (subtitle) {
		statblock.subtitle = subtitle;
	}

	if (archetype) {
		statblock.archetype = archetype;
	}

	if (creatureType) {
		statblock.creatureType = creatureType;
	}

	if (armorType) {
		statblock.armorType = armorType;
	}

	if (description) {
		statblock.description = description;
	}

	if (actionsInstructions) {
		statblock.actionsInstructions = actionsInstructions;
	}

	if (hp !== undefined) {
		statblock.hp = hp;
	}
	if (armor !== undefined) {
		statblock.armor = armor;
	}

	const saves = parseSaves(parsedSource.saves);
	if (saves) {
		statblock.saves = saves;
	}

	const lastStand = asOptionalString(parsedSource.last_stand ?? parsedSource.lastStand);
	if (lastStand) {
		statblock.lastStand = lastStand;
	}

	const bloodied = asOptionalString(parsedSource.bloodied);
	if (bloodied) {
		statblock.bloodied = bloodied;
	}

	const bloodiedState = parseSoloPhaseState(
		parsedSource.bloodied,
		parsedSource.bloodied_hp ??
			parsedSource.bloodiedHp ??
			parsedSource.bloodied_threshold ??
			parsedSource.bloodiedThreshold,
	);
	if (bloodiedState) {
		statblock.bloodiedState = bloodiedState;
	}

	const lastStandState = parseSoloPhaseState(
		parsedSource.last_stand ?? parsedSource.lastStand,
		parsedSource.last_stand_hp ??
			parsedSource.lastStandHp ??
			parsedSource.last_stand_threshold ??
			parsedSource.lastStandThreshold,
	);
	if (lastStandState) {
		statblock.lastStandState = lastStandState;
	}

	return { statblock };
}

function parseLayout(value: unknown): MonsterLayout | "item" {
	if (typeof value !== "string") {
		return DEFAULT_LAYOUT;
	}

	const normalized = value.trim().toLowerCase();
	if (
		normalized === "solo" ||
		normalized === "normal" ||
		normalized === "flunky" ||
		normalized === "minion" ||
		normalized === "legendary" ||
		normalized === "item"
	) {
		return normalized;
	}

	return DEFAULT_LAYOUT;
}

function parseItemBlock(source: Record<string, unknown>): ParseResult {
	const name = asTrimmedString(source.name);
	if (!name) {
		return { error: { message: "Field 'name' is required for item." } };
	}

	const rarity = parseRarity(source.rarity);
	const itemType = asOptionalString(
		source.type ?? source.item_type ?? source.itemType ?? "Unknown",
	) ?? "Unknown";
	const price = parseItemPrice(source.price ?? source.cost);
	const charges = parseItemCharges(source.charges ?? source.maxCharges ?? source.max_charges);
	const image = asOptionalLinkString(source.image);
	const flavor = asOptionalString(source.flavor ?? source.flavor_text ?? source.flavorText);
	const entries = parseItemEntries(source.entries ?? source.effects ?? source.abilities);

	const requirement = parseItemRequirement(
		source.requirement ?? source.requires ?? source.requires_attunement,
	);

	const itemStatblock: ItemStatblock = {
		name,
		layout: "item",
		rarity,
		itemType,
		entries,
	};

	if (requirement) {
		itemStatblock.requirement = requirement;
	}
	if (price) {
		itemStatblock.price = price;
	}
	if (charges) {
		itemStatblock.charges = charges;
	}
	if (image) {
		itemStatblock.image = image;
	}
	if (flavor) {
		itemStatblock.flavor = flavor;
	}

	return { statblock: itemStatblock };
}

function parseItemRequirement(value: unknown): ItemStatblock["requirement"] | undefined {
	if (!value) {
		return undefined;
	}

	if (typeof value === "string") {
		return { name: value, desc: [] };
	}

	if (isRecord(value)) {
		const type = asOptionalString(value.type);
		const reqName = asTrimmedString(value.name ?? value.requirement ?? value.requires);
		if (!reqName) {
			return undefined;
		}
		const descValue = value.desc ?? value.description ?? value.details;
		return {
			type: type ?? "Requires",
			name: reqName,
			desc: parseDescLines(descValue),
		};
	}

	return undefined;
}

function parseItemPrice(value: unknown): ItemPrice | undefined {
	if (!value) {
		return undefined;
	}

	if (
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return { value: String(value), currency: "gp" };
	}

	if (typeof value === "string") {
		const trimmedValue = value.trim();
		return trimmedValue ? { value: trimmedValue, currency: "gp" } : undefined;
	}

	if (isRecord(value)) {
		const rawPriceValue = asNumberOrString(value.value ?? value.amount);
		const priceValue =
			typeof rawPriceValue === "string" ? rawPriceValue.trim() : String(rawPriceValue);
		if (!priceValue) {
			return undefined;
		}
		const currencyStr = asOptionalString(value.currency ?? value.coin);
		let currency: ItemPrice["currency"] = "gp";
		if (currencyStr) {
			const c = currencyStr.toLowerCase();
			if (c === "sp" || c === "cp") {
				currency = c;
			}
		}
		return { value: priceValue, currency };
	}

	return undefined;
}

function parseItemCharges(value: unknown): string | undefined {
	if (typeof value === "number") {
		const normalized = String(value).trim();
		return normalized.length > 0 ? normalized : undefined;
	}

	return asOptionalString(value);
}

function parseRarity(value: unknown): ItemRarity {
	if (typeof value !== "string") {
		return "uncommon";
	}

	const normalized = value.trim().toLowerCase();
	if (VALID_RARITIES.includes(normalized as ItemRarity)) {
		return normalized as ItemRarity;
	}

	return "uncommon";
}

function parseItemEntries(value: unknown): ItemEntry[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const entries: ItemEntry[] = [];
	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		const name = asTrimmedString(item.name ?? item.effect ?? item.ability);
		if (!name) {
			continue;
		}

		const descValue = item.desc ?? item.description ?? item.text ?? item.details;
		const entry: ItemEntry = {
			name,
			desc: parseDescLines(descValue),
		};

		const activation = asOptionalString(item.activation ?? item.cost);
		if (activation) {
			entry.activation = activation;
		}

		const limit = asOptionalString(item.limit ?? item.uses);
		if (limit) {
			entry.limit = limit;
		}

		const recharge = asOptionalString(item.recharge);
		if (recharge) {
			entry.recharge = recharge;
		}

		entries.push(entry);
	}

	return entries;
}

function parseSpeed(value: unknown): SpeedEntry[] {
	if (isRecord(value)) {
		const typedSpeed = parseSpeedFromTypedObject(value);
		if (typedSpeed) {
			return [typedSpeed];
		}
		return parseSpeedFromRecord(value);
	}

	if (!Array.isArray(value)) {
		return [];
	}

	const entries: SpeedEntry[] = [];
	for (const item of value) {
		if (typeof item === "string") {
			const parsed = parseSpeedFromString(item);
			if (parsed) {
				entries.push(parsed);
			}
			continue;
		}

		if (!isRecord(item)) {
			continue;
		}

		const typedSpeed = parseSpeedFromTypedObject(item);
		if (typedSpeed) {
			entries.push(typedSpeed);
			continue;
		}

		const keyedSpeed = parseSpeedFromSingleKeyObject(item);
		if (keyedSpeed) {
			entries.push(keyedSpeed);
		}
	}

	return entries;
}

function parseSpeedFromRecord(value: Record<string, unknown>): SpeedEntry[] {
	const entries: SpeedEntry[] = [];
	for (const [rawType, rawValue] of Object.entries(value)) {
		const normalizedType = rawType.trim().toLowerCase();
		if (
			!normalizedType ||
			normalizedType === "type" ||
			normalizedType === "value"
		) {
			continue;
		}

		const parsedValue = parseNumericDisplayValue(rawValue);
		if (parsedValue === undefined) {
			continue;
		}

		entries.push({
			type: normalizedType,
			value: parsedValue,
		});
	}

	return entries;
}

function parseSpeedFromString(value: string): SpeedEntry | undefined {
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const tokens = trimmed.split(/\s+/);
	if (tokens.length < 2) {
		return undefined;
	}

	const firstToken = tokens[0];
	if (!firstToken) {
		return undefined;
	}
	const type = firstToken.toLowerCase();
	const parsedValue = parseNumericDisplayValue(tokens.slice(1).join(" "));
	if (parsedValue === undefined) {
		return undefined;
	}
	return { type, value: parsedValue };
}

function parseSpeedFromTypedObject(value: Record<string, unknown>): SpeedEntry | undefined {
	const type = asTrimmedString(value.type)?.toLowerCase();
	if (!type) {
		return undefined;
	}

	if (value.value === undefined) {
		return undefined;
	}

	const parsedValue = parseNumericDisplayValue(value.value);
	if (parsedValue === undefined) {
		return undefined;
	}

	return { type, value: parsedValue };
}

function parseSpeedFromSingleKeyObject(value: Record<string, unknown>): SpeedEntry | undefined {
	const entries = Object.entries(value);
	if (entries.length !== 1) {
		return undefined;
	}

	const singleEntry = entries[0];
	if (!singleEntry) {
		return undefined;
	}
	const [type, entryValue] = singleEntry;
	const normalizedType = type.trim().toLowerCase();
	if (!normalizedType) {
		return undefined;
	}

	const parsedValue = parseNumericDisplayValue(entryValue);
	if (parsedValue === undefined) {
		return undefined;
	}
	return {
		type: normalizedType,
		value: parsedValue,
	};
}

function parseAbilityList(value: unknown): AbilityEntry[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const abilities: AbilityEntry[] = [];
	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		const name = asTrimmedString(item.name);
		if (!name) {
			continue;
		}

		const descValue = item.desc ?? item.description ?? item.text;
		const ability: AbilityEntry = {
			name,
			desc: parseDescLines(descValue),
		};

		const image = asOptionalLinkString(item.image);
		if (image) {
			ability.image = image;
		}

		abilities.push(ability);
	}

	return abilities;
}

interface ParsedActionSaveDetails {
	type?: ActionSaveEntry["type"];
	dc?: number | string;
	onFail?: string;
	onSuccess?: string;
	effect?: string;
}

interface ParsedActionTriggerDetails {
	textParts: string[];
	save?: ParsedActionSaveDetails;
}

interface ParsedActionDetails {
	mode?: ActionMode;
	modeValue?: number | string;
	damage?: string;
	damageType?: string;
	flavor?: string;
	save?: ParsedActionSaveDetails;
	onHit?: ParsedActionTriggerDetails;
	onCrit?: ParsedActionTriggerDetails;
	extraText: string[];
}

function parseActionList(value: unknown): ActionEntry[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const actions: ActionEntry[] = [];
	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		const name = asTrimmedString(item.name);
		if (!name) {
			continue;
		}

		const descValue = item.desc ?? item.description ?? item.text;
		const action: ActionEntry = {
			name,
			desc: parseDescLines(descValue),
		};

		const details = parseActionDetails(item, descValue);
		if (details.mode && details.modeValue !== undefined) {
			action.mode = details.mode;
			action.modeValue = details.modeValue;
		}
		if (details.damage) {
			action.damage = details.damage;
		}
		if (details.damageType) {
			action.damageType = details.damageType;
		}
		if (details.flavor) {
			action.flavor = details.flavor;
		}

		const finalizedSave = finalizeParsedActionSave(details.save);
		if (finalizedSave) {
			action.save = finalizedSave;
		}

		const finalizedOnHit = finalizeParsedActionTrigger(details.onHit);
		if (finalizedOnHit) {
			action.onHit = finalizedOnHit;
		}

		const finalizedOnCrit = finalizeParsedActionTrigger(details.onCrit);
		if (finalizedOnCrit) {
			action.onCrit = finalizedOnCrit;
		}

		if (details.extraText.length > 0) {
			action.extraText = details.extraText;
		}

		const image = asOptionalLinkString(item.image);
		if (image) {
			action.image = image;
		}

		actions.push(action);
	}

	return actions;
}

function parseActionDetails(
	source: Record<string, unknown>,
	descValue: unknown,
): ParsedActionDetails {
	const details: ParsedActionDetails = {
		extraText: [],
	};

	applyActionDescDetails(details, descValue);
	applyActionRecordDetails(details, source, true);

	if (!details.damage && details.extraText.length > 0) {
		const firstExtra = details.extraText[0];
		if (firstExtra && looksLikeDamageExpression(firstExtra)) {
			details.damage = firstExtra;
			details.extraText.shift();
		}
	}

	if (details.mode === "reach" && isDefaultReach(details.modeValue)) {
		details.mode = undefined;
		details.modeValue = undefined;
	}

	if (details.damage && !details.damageType) {
		details.damageType = "Bludgeoning";
	}

	if (details.save && !details.save.type) {
		if (details.save.onFail) {
			pushUniqueActionExtra(details.extraText, `On fail: ${details.save.onFail}`);
		}
		if (details.save.onSuccess) {
			pushUniqueActionExtra(details.extraText, `On success: ${details.save.onSuccess}`);
		}
		if (details.save.effect) {
			pushUniqueActionExtra(details.extraText, details.save.effect);
		}
		details.save = undefined;
	}

	normalizeActionTriggerFallback(details, "onHit");
	normalizeActionTriggerFallback(details, "onCrit");

	return details;
}

function applyActionDescDetails(details: ParsedActionDetails, descValue: unknown): void {
	if (descValue === undefined || descValue === null) {
		return;
	}

	if (typeof descValue === "string") {
		pushUniqueActionExtra(details.extraText, descValue.trim());
		return;
	}

	if (isRecord(descValue)) {
		for (const [key, value] of Object.entries(descValue)) {
			applyActionDetailEntry(details, key, value);
		}
		return;
	}

	if (!Array.isArray(descValue)) {
		return;
	}

	for (const line of descValue) {
		if (typeof line === "string") {
			pushUniqueActionExtra(details.extraText, line.trim());
			continue;
		}
		if (!isRecord(line)) {
			continue;
		}
		for (const [key, value] of Object.entries(line)) {
			applyActionDetailEntry(details, key, value);
		}
	}
}

function applyActionRecordDetails(
	details: ParsedActionDetails,
	source: Record<string, unknown>,
	skipStandardKeys: boolean,
): void {
	for (const [key, value] of Object.entries(source)) {
		const normalizedKey = key.trim().toLowerCase();
		if (
			skipStandardKeys &&
			(
				normalizedKey === "name" ||
				normalizedKey === "desc" ||
				normalizedKey === "description" ||
				normalizedKey === "text" ||
				normalizedKey === "image"
			)
		) {
			continue;
		}
		applyActionDetailEntry(details, key, value);
	}
}

function parseHpValue(value: unknown): number | string | undefined {
	const directValue = asNumberOrString(value);
	if (directValue !== undefined) {
		return directValue;
	}

	if (!isRecord(value)) {
		return undefined;
	}

	return asNumberOrString(
		value.max ?? value.value ?? value.current ?? value.hp,
	);
}

function applyActionDetailEntry(
	details: ParsedActionDetails,
	rawKey: string,
	value: unknown,
): void {
	const normalizedKey = normalizeActionKey(rawKey);
	if (!normalizedKey) {
		return;
	}

	if (normalizedKey === "reach") {
		const modeValue = parseActionModeValue(value);
		if (modeValue !== undefined) {
			details.mode = "reach";
			details.modeValue = modeValue;
		}
		return;
	}

	if (normalizedKey === "range") {
		const modeValue = parseActionModeValue(value);
		if (modeValue !== undefined) {
			details.mode = "range";
			details.modeValue = modeValue;
		}
		return;
	}

	if (normalizedKey === "rangereach") {
		const parsedRangeReach = parseRangeReachEntry(value);
		if (parsedRangeReach) {
			details.mode = parsedRangeReach.mode;
			details.modeValue = parsedRangeReach.value;
		}
		return;
	}

	if (normalizedKey === "damage") {
		const damage = normalizeActionDisplayValue(value);
		if (damage) {
			details.damage = damage;
		}
		return;
	}

	if (
		normalizedKey === "damagetype" ||
		normalizedKey === "type"
	) {
		const damageType = normalizeActionDisplayValue(value);
		if (damageType) {
			details.damageType = damageType;
		}
		return;
	}

	if (
		normalizedKey === "flavor" ||
		normalizedKey === "flavour" ||
		normalizedKey === "description" ||
		normalizedKey === "text"
	) {
		const flavor = normalizeActionDisplayValue(value);
		if (flavor) {
			details.flavor = flavor;
		}
		return;
	}

	if (
		normalizedKey === "save" ||
		normalizedKey === "savingthrow" ||
		normalizedKey === "savingthrowtype" ||
		normalizedKey === "savetype"
	) {
		const parsedSave = parseActionSaveDetails(value);
		mergeActionSave(details, parsedSave);
		return;
	}

	if (normalizedKey === "onhit") {
		const parsedTrigger = parseActionTriggerDetails(value);
		mergeActionTrigger(details, "onHit", parsedTrigger);
		return;
	}

	if (
		normalizedKey === "oncrit" ||
		normalizedKey === "crit" ||
		normalizedKey === "critical" ||
		normalizedKey === "oncritical"
	) {
		const parsedTrigger = parseActionTriggerDetails(value);
		mergeActionTrigger(details, "onCrit", parsedTrigger);
		return;
	}

	if (
		normalizedKey === "onfail" ||
		normalizedKey === "fail" ||
		normalizedKey === "failure" ||
		normalizedKey === "condition"
	) {
		const onFailText = normalizeActionDisplayValue(value);
		if (onFailText) {
			const save = getOrCreateActionSave(details);
			save.onFail = onFailText;
		}
		return;
	}

	if (
		normalizedKey === "onsuccess" ||
		normalizedKey === "success"
	) {
		const onSuccessText = normalizeActionDisplayValue(value);
		if (onSuccessText) {
			const save = getOrCreateActionSave(details);
			save.onSuccess = onSuccessText;
		}
		return;
	}

	if (
		normalizedKey === "effect" ||
		normalizedKey === "extradamage" ||
		normalizedKey === "additionaldamage"
	) {
		const effectText = normalizeActionDisplayValue(value);
		if (effectText) {
			const save = getOrCreateActionSave(details);
			save.effect = effectText;
		}
		return;
	}

	const fallbackValue = normalizeActionDisplayValue(value);
	if (!fallbackValue) {
		return;
	}
	pushUniqueActionExtra(
		details.extraText,
		`${toDisplayLabel(rawKey)}: ${fallbackValue}`,
	);
}

function parseActionModeValue(value: unknown): number | string | undefined {
	const parsedValue = parseNumericDisplayValue(value);
	if (parsedValue === undefined) {
		return undefined;
	}
	if (typeof parsedValue === "string") {
		const trimmed = parsedValue.trim();
		return trimmed ? trimmed : undefined;
	}
	return parsedValue;
}

function parseActionDcValue(value: unknown): number | string | undefined {
	const parsedValue = parseNumericDisplayValue(value);
	if (parsedValue === undefined) {
		return undefined;
	}
	if (typeof parsedValue === "string") {
		const trimmed = parsedValue.trim();
		return trimmed ? trimmed : undefined;
	}
	return parsedValue;
}

function parseRangeReachEntry(
	value: unknown,
): { mode: ActionMode; value: number | string } | undefined {
	const parsedText = normalizeActionDisplayValue(value);
	if (!parsedText) {
		return undefined;
	}

	const normalizedText = parsedText.trim().toLowerCase();
	if (normalizedText.startsWith("range")) {
		const remainder = parsedText.slice(5).trim();
		const modeValue = parseActionModeValue(remainder);
		return modeValue === undefined
			? undefined
			: { mode: "range", value: modeValue };
	}

	if (normalizedText.startsWith("reach")) {
		const remainder = parsedText.slice(5).trim();
		const modeValue = parseActionModeValue(remainder);
		return modeValue === undefined
			? undefined
			: { mode: "reach", value: modeValue };
	}

	const modeValue = parseActionModeValue(parsedText);
	return modeValue === undefined
		? undefined
		: { mode: "reach", value: modeValue };
}

function parseActionSaveDetails(value: unknown): ParsedActionSaveDetails | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		const saveType = parseActionSaveType(String(value));
		return saveType ? { type: saveType } : undefined;
	}

	if (Array.isArray(value)) {
		const parsedSave: ParsedActionSaveDetails = {};
		for (const item of value) {
			const itemSave = parseActionSaveDetails(item);
			mergeParsedActionSave(parsedSave, itemSave);
		}
		return hasParsedActionSaveData(parsedSave) ? parsedSave : undefined;
	}

	if (!isRecord(value)) {
		return undefined;
	}

	const parsedSave: ParsedActionSaveDetails = {};
	for (const [rawKey, entryValue] of Object.entries(value)) {
		const normalizedKey = normalizeActionKey(rawKey);
		if (!normalizedKey) {
			continue;
		}

			if (
				normalizedKey === "type" ||
				normalizedKey === "ability" ||
				normalizedKey === "save" ||
				normalizedKey === "stat"
			) {
				const saveType = parseActionSaveType(
					normalizeActionDisplayValue(entryValue),
				);
				if (saveType) {
					parsedSave.type = saveType;
				}
				continue;
			}

			if (
				normalizedKey === "dc" ||
				normalizedKey === "savedc" ||
				normalizedKey === "difficultyclass"
			) {
				const dcValue = parseActionDcValue(entryValue);
				if (dcValue !== undefined) {
					parsedSave.dc = dcValue;
				}
				continue;
			}

		const keyedSaveType = parseActionSaveType(rawKey);
		if (keyedSaveType) {
			parsedSave.type = keyedSaveType;
			const nestedSave = parseActionSaveDetails(entryValue);
			mergeParsedActionSave(parsedSave, nestedSave);
			if (!nestedSave) {
				const nestedText = normalizeActionDisplayValue(entryValue);
				if (nestedText) {
					parsedSave.onFail = nestedText;
				}
			}
			continue;
		}

		if (
			normalizedKey === "onfail" ||
			normalizedKey === "fail" ||
			normalizedKey === "failure" ||
			normalizedKey === "condition"
		) {
			const onFailText = normalizeActionDisplayValue(entryValue);
			if (onFailText) {
				parsedSave.onFail = onFailText;
			}
			continue;
		}

		if (
			normalizedKey === "onsuccess" ||
			normalizedKey === "success"
		) {
			const onSuccessText = normalizeActionDisplayValue(entryValue);
			if (onSuccessText) {
				parsedSave.onSuccess = onSuccessText;
			}
			continue;
		}

		if (
			normalizedKey === "effect" ||
			normalizedKey === "extradamage" ||
			normalizedKey === "additionaldamage"
		) {
			const effectText = normalizeActionDisplayValue(entryValue);
			if (effectText) {
				parsedSave.effect = effectText;
			}
		}
	}

	return hasParsedActionSaveData(parsedSave) ? parsedSave : undefined;
}

function mergeActionSave(
	details: ParsedActionDetails,
	parsedSave: ParsedActionSaveDetails | undefined,
): void {
	if (!parsedSave) {
		return;
	}
	const save = getOrCreateActionSave(details);
	mergeParsedActionSave(save, parsedSave);
}

function getOrCreateActionSave(details: ParsedActionDetails): ParsedActionSaveDetails {
	if (!details.save) {
		details.save = {};
	}
	return details.save;
}

function mergeActionTrigger(
	details: ParsedActionDetails,
	triggerKey: "onHit" | "onCrit",
	incoming: ParsedActionTriggerDetails | undefined,
): void {
	if (!incoming) {
		return;
	}
	const trigger = getOrCreateActionTrigger(details, triggerKey);
	mergeParsedActionTrigger(trigger, incoming);
}

function getOrCreateActionTrigger(
	details: ParsedActionDetails,
	triggerKey: "onHit" | "onCrit",
): ParsedActionTriggerDetails {
	const existing = details[triggerKey];
	if (existing) {
		return existing;
	}
	const created: ParsedActionTriggerDetails = { textParts: [] };
	details[triggerKey] = created;
	return created;
}

function parseActionTriggerDetails(
	value: unknown,
): ParsedActionTriggerDetails | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		const text = normalizeActionDisplayValue(value);
		if (!text) {
			return undefined;
		}
		return {
			textParts: [text],
		};
	}

	if (Array.isArray(value)) {
		const parsedTrigger: ParsedActionTriggerDetails = { textParts: [] };
		for (const entry of value) {
			const parsedEntry = parseActionTriggerDetails(entry);
			mergeParsedActionTrigger(parsedTrigger, parsedEntry);
		}
		return hasParsedActionTriggerData(parsedTrigger) ? parsedTrigger : undefined;
	}

	if (!isRecord(value)) {
		return undefined;
	}

	const parsedTrigger: ParsedActionTriggerDetails = { textParts: [] };
	for (const [rawKey, entryValue] of Object.entries(value)) {
		const normalizedKey = normalizeActionKey(rawKey);
		if (!normalizedKey) {
			continue;
		}

		if (
			normalizedKey === "condition" ||
			normalizedKey === "status" ||
			normalizedKey === "text" ||
			normalizedKey === "effect" ||
			normalizedKey === "flavor" ||
			normalizedKey === "flavour"
		) {
			const textValue = normalizeActionDisplayValue(entryValue);
			if (textValue) {
				pushUniqueTriggerText(parsedTrigger.textParts, textValue);
			}
			continue;
		}

		if (
			normalizedKey === "save" ||
			normalizedKey === "savingthrow" ||
			normalizedKey === "savingthrowtype" ||
			normalizedKey === "savetype"
		) {
			const parsedSave = parseActionSaveDetails(entryValue);
			mergeParsedActionSaveIntoTrigger(parsedTrigger, parsedSave);
			continue;
		}

		if (
			normalizedKey === "dc" ||
			normalizedKey === "savedc" ||
			normalizedKey === "difficultyclass"
		) {
			const dcValue = parseActionDcValue(entryValue);
			if (dcValue !== undefined) {
				const save = getOrCreateTriggerSave(parsedTrigger);
				save.dc = dcValue;
			}
			continue;
		}

		if (
			normalizedKey === "onfail" ||
			normalizedKey === "fail" ||
			normalizedKey === "failure"
		) {
			const onFailText = normalizeActionDisplayValue(entryValue);
			if (onFailText) {
				const save = getOrCreateTriggerSave(parsedTrigger);
				save.onFail = onFailText;
			}
			continue;
		}

		if (
			normalizedKey === "onsuccess" ||
			normalizedKey === "success"
		) {
			const onSuccessText = normalizeActionDisplayValue(entryValue);
			if (onSuccessText) {
				const save = getOrCreateTriggerSave(parsedTrigger);
				save.onSuccess = onSuccessText;
			}
			continue;
		}

		if (
			normalizedKey === "additionaldamage" ||
			normalizedKey === "extradamage"
		) {
			const effectText = normalizeActionDisplayValue(entryValue);
			if (effectText) {
				const save = getOrCreateTriggerSave(parsedTrigger);
				save.effect = effectText;
			}
			continue;
		}

		if (
			normalizedKey === "type" ||
			normalizedKey === "ability" ||
			normalizedKey === "stat"
		) {
			const saveType = parseActionSaveType(
				normalizeActionDisplayValue(entryValue),
			);
			if (saveType) {
				const save = getOrCreateTriggerSave(parsedTrigger);
				save.type = saveType;
				continue;
			}

			const textValue = normalizeActionDisplayValue(entryValue);
			if (textValue) {
				pushUniqueTriggerText(parsedTrigger.textParts, textValue);
			}
			continue;
		}

		const keyedSaveType = parseActionSaveType(rawKey);
		if (keyedSaveType) {
			const save = getOrCreateTriggerSave(parsedTrigger);
			save.type = keyedSaveType;
			const nestedSave = parseActionSaveDetails(entryValue);
			mergeParsedActionSave(save, nestedSave);
			if (!nestedSave) {
				const nestedText = normalizeActionDisplayValue(entryValue);
				if (nestedText) {
					save.onFail = nestedText;
				}
			}
			continue;
		}

		const fallbackValue = normalizeActionDisplayValue(entryValue);
		if (!fallbackValue) {
			continue;
		}
		pushUniqueTriggerText(
			parsedTrigger.textParts,
			`${toDisplayLabel(rawKey)}: ${fallbackValue}`,
		);
	}

	return hasParsedActionTriggerData(parsedTrigger) ? parsedTrigger : undefined;
}

function mergeParsedActionTrigger(
	target: ParsedActionTriggerDetails,
	incoming: ParsedActionTriggerDetails | undefined,
): void {
	if (!incoming) {
		return;
	}

	for (const textPart of incoming.textParts) {
		pushUniqueTriggerText(target.textParts, textPart);
	}

	if (incoming.save) {
		mergeParsedActionSaveIntoTrigger(target, incoming.save);
	}
}

function mergeParsedActionSaveIntoTrigger(
	target: ParsedActionTriggerDetails,
	incoming: ParsedActionSaveDetails | undefined,
): void {
	if (!incoming) {
		return;
	}
	const save = getOrCreateTriggerSave(target);
	mergeParsedActionSave(save, incoming);
}

function getOrCreateTriggerSave(
	target: ParsedActionTriggerDetails,
): ParsedActionSaveDetails {
	if (!target.save) {
		target.save = {};
	}
	return target.save;
}

function pushUniqueTriggerText(target: string[], text: string): void {
	const normalized = text.trim();
	if (!normalized) {
		return;
	}
	if (!target.includes(normalized)) {
		target.push(normalized);
	}
}

function hasParsedActionTriggerData(value: ParsedActionTriggerDetails): boolean {
	return value.textParts.length > 0 || Boolean(value.save);
}

function normalizeActionTriggerFallback(
	details: ParsedActionDetails,
	triggerKey: "onHit" | "onCrit",
): void {
	const trigger = details[triggerKey];
	if (!trigger) {
		return;
	}

	if (trigger.save && !trigger.save.type) {
		if (trigger.save.dc !== undefined) {
			pushUniqueTriggerText(trigger.textParts, `DC ${trigger.save.dc}`);
		}
		if (trigger.save.onFail) {
			pushUniqueTriggerText(trigger.textParts, `On fail: ${trigger.save.onFail}`);
		}
		if (trigger.save.onSuccess) {
			pushUniqueTriggerText(trigger.textParts, `On success: ${trigger.save.onSuccess}`);
		}
		if (trigger.save.effect) {
			pushUniqueTriggerText(trigger.textParts, trigger.save.effect);
		}
		trigger.save = undefined;
	}

	if (!hasParsedActionTriggerData(trigger)) {
		details[triggerKey] = undefined;
	}
}

function mergeParsedActionSave(
	target: ParsedActionSaveDetails,
	incoming: ParsedActionSaveDetails | undefined,
): void {
	if (!incoming) {
		return;
	}
	if (incoming.type) {
		target.type = incoming.type;
	}
	if (incoming.dc !== undefined) {
		target.dc = incoming.dc;
	}
	if (incoming.onFail) {
		target.onFail = incoming.onFail;
	}
	if (incoming.onSuccess) {
		target.onSuccess = incoming.onSuccess;
	}
	if (incoming.effect) {
		target.effect = incoming.effect;
	}
}

function hasParsedActionSaveData(value: ParsedActionSaveDetails): boolean {
	return (
		value.type !== undefined ||
		value.dc !== undefined ||
		value.onFail !== undefined ||
		value.onSuccess !== undefined ||
		value.effect !== undefined
	);
}

function finalizeParsedActionSave(
	value: ParsedActionSaveDetails | undefined,
): ActionSaveEntry | undefined {
	if (!value) {
		return undefined;
	}
	if (!value.type) {
		return undefined;
	}

	const save: ActionSaveEntry = {
		type: value.type,
	};
	if (value.dc !== undefined) {
		save.dc = value.dc;
	}
	if (value.onFail) {
		save.onFail = value.onFail;
	}
	if (value.onSuccess) {
		save.onSuccess = value.onSuccess;
	}
	if (value.effect) {
		save.effect = value.effect;
	}
	return save;
}

function finalizeParsedActionTrigger(
	value: ParsedActionTriggerDetails | undefined,
): ActionTriggerEffect | undefined {
	if (!value) {
		return undefined;
	}

	const text = value.textParts.join("; ").trim();
	const save = finalizeParsedActionSave(value.save);
	if (!text && !save) {
		return undefined;
	}

	const trigger: ActionTriggerEffect = {};
	if (text) {
		trigger.text = text;
	}
	if (save) {
		trigger.save = save;
	}
	return trigger;
}

function parseActionSaveType(value: string | undefined): ActionSaveEntry["type"] | undefined {
	if (!value) {
		return undefined;
	}

	const candidates = value
		.split(/[\s,;:()/-]+/)
		.map((part) => part.trim())
		.filter(Boolean);

	for (const candidate of candidates) {
		const saveKey = normalizeSaveKey(candidate);
		if (!saveKey) {
			continue;
		}
		if (saveKey === "dex") {
			return "DEX";
		}
		if (saveKey === "wil") {
			return "WIL";
		}
		if (saveKey === "str") {
			return "STR";
		}
		return "INT";
	}

	return undefined;
}

function normalizeActionDisplayValue(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		const text = String(value).trim();
		return text || undefined;
	}

	if (Array.isArray(value)) {
		const parts = value
			.map((entry) => normalizeActionDisplayValue(entry))
			.filter((entry): entry is string => Boolean(entry));
		return parts.length > 0 ? parts.join("; ") : undefined;
	}

	if (isRecord(value)) {
		const asJson = JSON.stringify(value);
		return asJson && asJson !== "{}" ? asJson : undefined;
	}

	return undefined;
}

function normalizeActionKey(value: string): string {
	return value.trim().toLowerCase().replace(/[\s/_-]+/g, "");
}

function toDisplayLabel(value: string): string {
	return value
		.split(/[\s/_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function pushUniqueActionExtra(target: string[], value: string): void {
	const trimmed = value.trim();
	if (!trimmed) {
		return;
	}
	if (!target.includes(trimmed)) {
		target.push(trimmed);
	}
}

function looksLikeDamageExpression(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (!normalized) {
		return false;
	}
	return /\d+d\d+/.test(normalized) || /[+-]\s*\d+/.test(normalized);
}

function isDefaultReach(value: number | string | undefined): boolean {
	if (value === undefined) {
		return true;
	}
	if (typeof value === "number") {
		return value === 1;
	}
	const parsedNumber = Number(value.trim());
	return !Number.isNaN(parsedNumber) && parsedNumber === 1;
}

function parseDescLines(value: unknown): AbilityDescLine[] {
	if (value === undefined || value === null) {
		return [];
	}

	if (typeof value === "string") {
		return [value];
	}

	if (isRecord(value)) {
		const objectLine = parseDescObject(value);
		return objectLine ? [objectLine] : [];
	}

	if (!Array.isArray(value)) {
		return [];
	}

	const lines: AbilityDescLine[] = [];
	for (const line of value) {
		if (typeof line === "string") {
			lines.push(line);
			continue;
		}

		if (!isRecord(line)) {
			continue;
		}

		const objectLine = parseDescObject(line);
		if (objectLine) {
			lines.push(objectLine);
		}
	}

	return lines;
}

function parseDescObject(value: Record<string, unknown>): AbilityDescObject | undefined {
	const parsedObject: AbilityDescObject = {};
	for (const [key, entryValue] of Object.entries(value)) {
		if (entryValue === undefined || entryValue === null) {
			continue;
		}

		if (
			typeof entryValue === "string" ||
			typeof entryValue === "number" ||
			typeof entryValue === "boolean"
		) {
			parsedObject[key] = entryValue;
			continue;
		}

		if (Array.isArray(entryValue)) {
			const flattened = entryValue
				.filter(
					(item): item is string | number | boolean =>
						typeof item === "string" ||
						typeof item === "number" ||
						typeof item === "boolean",
				)
				.map((item) => String(item))
				.join(", ");
			if (flattened) {
				parsedObject[key] = flattened;
			}
			continue;
		}

		parsedObject[key] = JSON.stringify(entryValue);
	}

	return Object.keys(parsedObject).length > 0 ? parsedObject : undefined;
}

function parseSaves(value: unknown): SaveMap | undefined {
	const saveMap: SaveMap = {};

	if (Array.isArray(value)) {
		for (const entry of value) {
			if (!isRecord(entry)) {
				continue;
			}
			writeSaveEntries(saveMap, entry);
		}
	}

	if (isRecord(value)) {
		writeSaveEntries(saveMap, value);
	}

	return Object.keys(saveMap).length > 0 ? saveMap : undefined;
}

function parseSoloPhaseState(
	value: unknown,
	explicitThresholdValue: unknown,
): SoloPhaseState | undefined {
	const abilities = parseSoloPhaseAbilities(value);
	let hpThreshold = asNumberOrString(explicitThresholdValue);

	if (isRecord(value)) {
		const objectThreshold = parseSoloPhaseThreshold(value);
		if (objectThreshold !== undefined) {
			hpThreshold = objectThreshold;
		}
	}

	if (abilities.length === 0 && hpThreshold === undefined) {
		return undefined;
	}

	const phaseState: SoloPhaseState = { abilities };
	if (hpThreshold !== undefined) {
		phaseState.hpThreshold = hpThreshold;
	}
	return phaseState;
}

function parseSoloPhaseThreshold(
	value: Record<string, unknown>,
): number | string | undefined {
	const thresholdCandidates = [
		value.hp,
		value.threshold,
		value.hp_threshold,
		value.hpThreshold,
		value.trigger_hp,
		value.triggerHp,
	];

	for (const candidate of thresholdCandidates) {
		const parsed = asNumberOrString(candidate);
		if (parsed !== undefined) {
			return parsed;
		}
	}

	return undefined;
}

function parseSoloPhaseAbilities(value: unknown): SoloPhaseAbility[] {
	if (value === undefined || value === null) {
		return [];
	}

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		const text = String(value).trim();
		return text
			? [
				{
					desc: [text],
				},
			]
			: [];
	}

	if (Array.isArray(value)) {
		const abilities: SoloPhaseAbility[] = [];
		for (const entry of value) {
			appendUniquePhaseAbilities(abilities, parseSoloPhaseAbilities(entry));
		}
		return abilities;
	}

	if (!isRecord(value)) {
		return [];
	}

	return parseSoloPhaseAbilitiesFromRecord(value);
}

function parseSoloPhaseAbilitiesFromRecord(value: Record<string, unknown>): SoloPhaseAbility[] {
	const directAbility = parseDirectSoloPhaseAbility(value);
	if (directAbility) {
		return [directAbility];
	}

	const abilities: SoloPhaseAbility[] = [];

	const abilityContainers = [
		value.abilities,
		value.abiltities,
		value.effects,
		value.entries,
		value.list,
		value.items,
	];
	for (const container of abilityContainers) {
		appendUniquePhaseAbilities(abilities, parseSoloPhaseAbilities(container));
	}

	const directTextSources = [
		value.ability,
		value.effect,
		value.entry,
		value.text,
		value.description,
		value.desc,
	];
	if (abilities.length === 0) {
		for (const source of directTextSources) {
			appendUniquePhaseAbilities(abilities, parseSoloPhaseAbilities(source));
		}
	}

	if (abilities.length > 0) {
		return abilities;
	}

	for (const [rawKey, rawValue] of Object.entries(value)) {
		const normalizedKey = rawKey.trim().toLowerCase();
		if (
			normalizedKey === "hp" ||
			normalizedKey === "threshold" ||
			normalizedKey === "hp_threshold" ||
			normalizedKey === "hpthreshold" ||
			normalizedKey === "trigger_hp" ||
			normalizedKey === "triggerhp"
		) {
			continue;
		}

		if (
			typeof rawValue === "string" ||
			typeof rawValue === "number" ||
			typeof rawValue === "boolean"
		) {
			const text = String(rawValue).trim();
			if (!text) {
				continue;
			}
			abilities.push({
				name: toDisplayLabel(rawKey),
				desc: [text],
			});
		}
	}

	return abilities;
}

function parseDirectSoloPhaseAbility(
	value: Record<string, unknown>,
): SoloPhaseAbility | undefined {
	const name = asOptionalString(value.name ?? value.title ?? value.label);
	const descValue =
		value.desc ??
		value.description ??
		value.text ??
		value.effect ??
		value.ability ??
		value.entry;
	const desc = parseDescLines(descValue);
	const image = asOptionalLinkString(value.image);

	if (!name && desc.length === 0 && !image) {
		return undefined;
	}

	const ability: SoloPhaseAbility = {
		desc,
	};
	if (name) {
		ability.name = name;
	}
	if (image) {
		ability.image = image;
	}
	return ability;
}

function appendUniquePhaseAbilities(
	target: SoloPhaseAbility[],
	values: SoloPhaseAbility[],
): void {
	for (const value of values) {
		if (!hasPhaseAbility(target, value)) {
			target.push(value);
		}
	}
}

function hasPhaseAbility(
	values: SoloPhaseAbility[],
	candidate: SoloPhaseAbility,
): boolean {
	const candidateSignature = phaseAbilitySignature(candidate);
	return values.some((entry) => phaseAbilitySignature(entry) === candidateSignature);
}

function phaseAbilitySignature(entry: SoloPhaseAbility): string {
	const name = entry.name?.trim() ?? "";
	const image = entry.image?.trim() ?? "";
	const desc = entry.desc
		.map((line) => (typeof line === "string" ? line.trim() : JSON.stringify(line)))
		.join("|");
	return `${name}::${desc}::${image}`;
}

function writeSaveEntries(saveMap: SaveMap, source: Record<string, unknown>): void {
	for (const [rawKey, rawValue] of Object.entries(source)) {
		const saveKey = normalizeSaveKey(rawKey);
		if (!saveKey) {
			continue;
		}

		const numericValue = parseNumber(rawValue);
		if (numericValue === undefined) {
			continue;
		}

		saveMap[saveKey] = numericValue;
	}
}

function normalizeSaveKey(rawKey: string): SaveKey | undefined {
	const normalized = rawKey.trim().toLowerCase();
	if (normalized === "dex" || normalized === "dexterity") {
		return "dex";
	}
	if (normalized === "wil" || normalized === "will" || normalized === "willpower") {
		return "wil";
	}
	if (normalized === "str" || normalized === "strength") {
		return "str";
	}
	if (normalized === "int" || normalized === "intelligence") {
		return "int";
	}
	return undefined;
}

function asTrimmedString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function asOptionalString(value: unknown): string | undefined {
	return asTrimmedString(value);
}

function asOptionalLinkString(value: unknown): string | undefined {
	const directValue = asTrimmedString(value);
	if (directValue) {
		return directValue;
	}

	return resolveNestedLinkToken(value);
}

function resolveNestedLinkToken(value: unknown): string | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	for (const entry of value) {
		const stringEntry = asTrimmedString(entry);
		if (stringEntry) {
			return stringEntry;
		}

		const nestedEntry = resolveNestedLinkToken(entry);
		if (nestedEntry) {
			return nestedEntry;
		}
	}

	return undefined;
}

function asDisplayValue(value: unknown, fallback: string): string {
	if (value === undefined || value === null) {
		return fallback;
	}
	if (typeof value === "string" || typeof value === "number") {
		return String(value).trim() || fallback;
	}
	return fallback;
}

function normalizeLevelDisplay(value: string): string {
	const compact = value.replace(/\s+/g, "");
	if (compact === "1/4") {
		return "¼";
	}
	if (compact === "1/3") {
		return "⅓";
	}
	if (compact === "1/2") {
		return "½";
	}
	return value;
}

function asNumberOrString(value: unknown): number | string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) {
			return undefined;
		}

		const parsed = Number(trimmed);
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
			return parsed;
		}
		return trimmed;
	}

	return undefined;
}

function parseNumericDisplayValue(value: unknown): number | string | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "boolean") {
		return String(value);
	}

	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const parsed = Number(trimmed);
	if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
		return parsed;
	}
	return trimmed;
}

function parseNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
