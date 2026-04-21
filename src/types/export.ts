export interface EmbeddedAsset {
	fileName?: string;
	base64: string;
}

export type ExportMonsterKind = "normal" | "solo" | "flunky" | "minion";
export type ExportMonsterSize =
	| "tiny"
	| "small"
	| "medium"
	| "large"
	| "huge"
	| "gargantuan";
export type ExportMonsterArmor = "none" | "medium" | "heavy";
export type ExportMovementMode = "walk" | "fly" | "swim" | "climb" | "burrow";
export type ExportSaveKey = "str" | "dex" | "int" | "wil";

export interface ExportAbilityEntry {
	name: string;
	description: string;
	image?: EmbeddedAsset;
}

export interface ExportAttackEntry {
	name: string;
	description: string;
	damage?: {
		roll: string;
	};
	target?: {
		reach?: number;
		range?: number;
	};
	effects?: Record<string, unknown>[];
	image?: EmbeddedAsset;
}

export interface ExportPhaseItemEntry {
	name: string;
	description: string;
	image?: EmbeddedAsset;
}

export interface ExportPhaseEntry {
	description: string;
	image?: EmbeddedAsset;
	items?: ExportPhaseItemEntry[];
}

export interface ExportMonsterStatblock {
	name: string;
	monsterType: ExportMonsterKind;
	level: string;
	creatureType: string;
	description: string;
	size: ExportMonsterSize;
	armor: ExportMonsterArmor;
	hp: {
		max: number;
		value: number;
		temp: number;
	};
	speed: Record<ExportMovementMode, number>;
	saves: Partial<Record<ExportSaveKey, number>>;
	image?: EmbeddedAsset;
	abilities: ExportAbilityEntry[];
	attacks: ExportAttackEntry[];
	actionsInstructions?: string;
	bloodied?: ExportPhaseEntry;
	lastStand?: ExportPhaseEntry;
}

export interface NimbleMonsterExportDocument {
	schemaVersion: "1.0";
	imports: Array<{
		kind: "monster";
		data: ExportMonsterStatblock;
	}>;
}
