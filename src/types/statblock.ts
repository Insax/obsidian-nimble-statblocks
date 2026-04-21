export type MonsterLayout = "normal" | "solo" | "flunky" | "minion" | "legendary";
export type ItemRarity = "uncommon" | "rare" | "very rare" | "legendary" | "mythical";
export type MonsterSize = string;

export interface SpeedEntry {
	type: string;
	value: number | string;
}

export type AbilityDescValue = string | number | boolean;
export type AbilityDescObject = Record<string, AbilityDescValue>;
export type AbilityDescLine = string | AbilityDescObject;

export interface AbilityEntry {
	name: string;
	desc: AbilityDescLine[];
	image?: string;
}

export type ActionMode = "reach" | "range";
export type ActionSaveType = "DEX" | "WIL" | "STR" | "INT";

export interface ActionSaveEntry {
	type: ActionSaveType;
	dc?: number | string;
	onFail?: string;
	onSuccess?: string;
	effect?: string;
}

export interface ActionTriggerEffect {
	text?: string;
	save?: ActionSaveEntry;
}

export interface ActionEntry extends AbilityEntry {
	mode?: ActionMode;
	modeValue?: number | string;
	damage?: string;
	damageType?: string;
	flavor?: string;
	save?: ActionSaveEntry;
	onHit?: ActionTriggerEffect;
	onCrit?: ActionTriggerEffect;
	extraText?: string[];
}

export type SaveKey = "dex" | "wil" | "str" | "int";
export type SaveMap = Partial<Record<SaveKey, number>>;

export interface SoloPhaseAbility {
	name?: string;
	desc: AbilityDescLine[];
	image?: string;
}

export interface SoloPhaseState {
	hpThreshold?: number | string;
	abilities: SoloPhaseAbility[];
}

export interface MonsterStatblock {
	name: string;
	layout: MonsterLayout;
	level: string;
	size: MonsterSize;
	archetype?: string;
	creatureType?: string;
	subtitle?: string;
	description?: string;
	armorType?: string;
	hp?: number | string;
	armor?: number | string;
	image?: string;
	speed: SpeedEntry[];
	features: AbilityEntry[];
	actions: ActionEntry[];
	actionsInstructions?: string;
	saves?: SaveMap;
	lastStand?: string;
	bloodied?: string;
	lastStandState?: SoloPhaseState;
	bloodiedState?: SoloPhaseState;
}

export interface ItemEntry {
	name: string;
	desc: AbilityDescLine[];
}

export interface ItemStatblock {
	name: string;
	layout: "item";
	rarity: ItemRarity;
	itemType: string;
	requirements?: string;
	price?: string;
	image?: string;
	flavor?: string;
	entries: ItemEntry[];
}

export type Statblock = MonsterStatblock | ItemStatblock;

export interface ParseError {
	message: string;
}

export interface ParseResult {
	statblock?: Statblock;
	error?: ParseError;
}
