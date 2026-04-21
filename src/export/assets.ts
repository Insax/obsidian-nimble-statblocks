import { App, TFile } from "obsidian";
import type { EmbeddedAsset } from "../types/export";

interface EmbeddedAssetOptions {
	maxWidth?: number;
	maxHeight?: number;
}

export async function buildEmbeddedAsset(
	app: App,
	sourcePath: string,
	rawLink: string,
	options?: EmbeddedAssetOptions,
): Promise<EmbeddedAsset | undefined> {
	const linkedFile = resolveLinkedFile(app, sourcePath, rawLink);
	if (!linkedFile) {
		return undefined;
	}

	const mimeType = getMimeType(linkedFile.path);
	const fileData = await app.vault.readBinary(linkedFile);
	const preparedAsset = await prepareEmbeddedAsset(fileData, mimeType, options);
	const encoded = arrayBufferToBase64(preparedAsset.fileData);
	return {
		fileName: linkedFile.name,
		base64: toDataUri(preparedAsset.mimeType, encoded),
	};
}

export function resolveLinkedFile(
	app: App,
	sourcePath: string,
	rawLink: string,
): TFile | undefined {
	const linkPath = normalizeWikiLink(rawLink);
	if (!linkPath) {
		return undefined;
	}

	const candidates = buildLinkCandidates(linkPath);
	for (const candidate of candidates) {
		const linkedFile = asTFile(
			app.metadataCache.getFirstLinkpathDest(candidate, sourcePath),
		);
		if (linkedFile) {
			return linkedFile;
		}

		const directPathFile = asTFile(app.vault.getAbstractFileByPath(candidate));
		if (directPathFile) {
			return directPathFile;
		}
	}

	return findLooseFileMatch(app, sourcePath, candidates);
}

export function normalizeWikiLink(rawLink: string): string {
	let linkPath = rawLink.trim();
	if (!linkPath) {
		return "";
	}

	if (linkPath.startsWith("!")) {
		linkPath = linkPath.slice(1).trim();
	}

	if (linkPath.startsWith("[[") && linkPath.endsWith("]]")) {
		linkPath = linkPath.slice(2, -2).trim();
	}

	const aliasSeparator = linkPath.indexOf("|");
	if (aliasSeparator >= 0) {
		linkPath = linkPath.slice(0, aliasSeparator).trim();
	}

	return stripLinkDecorators(linkPath);
}

function buildLinkCandidates(linkPath: string): string[] {
	const candidates = new Set<string>();
	addCandidate(candidates, linkPath);
	addCandidate(candidates, decodeLinkPath(linkPath));

	const prefixed = linkPath.startsWith("/") ? linkPath.slice(1) : undefined;
	addCandidate(candidates, prefixed);
	addCandidate(candidates, decodeLinkPath(prefixed));

	return Array.from(candidates);
}

function addCandidate(candidates: Set<string>, value: string | undefined): void {
	const normalized = stripLinkDecorators(value ?? "");
	if (normalized) {
		candidates.add(normalized);
	}
}

function decodeLinkPath(linkPath: string | undefined): string | undefined {
	if (!linkPath) {
		return undefined;
	}

	try {
		return decodeURIComponent(linkPath);
	} catch {
		return undefined;
	}
}

function stripLinkDecorators(linkPath: string): string {
	let normalized = linkPath.trim().replace(/\\/g, "/");
	const headingSeparator = normalized.indexOf("#");
	if (headingSeparator >= 0) {
		normalized = normalized.slice(0, headingSeparator).trim();
	}

	const querySeparator = normalized.indexOf("?");
	if (querySeparator >= 0) {
		normalized = normalized.slice(0, querySeparator).trim();
	}

	if (
		(normalized.startsWith('"') && normalized.endsWith('"')) ||
		(normalized.startsWith("'") && normalized.endsWith("'"))
	) {
		normalized = normalized.slice(1, -1).trim();
	}

	return normalized;
}

function asTFile(value: unknown): TFile | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	const maybeFile = value as TFile;
	if (typeof maybeFile.path !== "string" || typeof maybeFile.extension !== "string") {
		return undefined;
	}

	return maybeFile;
}

function findLooseFileMatch(
	app: App,
	sourcePath: string,
	candidates: string[],
): TFile | undefined {
	const vaultFiles = app.vault.getFiles();

	for (const candidate of candidates) {
		const normalizedCandidate = candidate.toLowerCase();
		const exactMatch = vaultFiles.find(
			(file) => file.path.toLowerCase() === normalizedCandidate,
		);
		if (exactMatch) {
			return exactMatch;
		}
	}

	for (const candidate of candidates) {
		const normalizedCandidate = candidate.toLowerCase();
		const suffixMatches = vaultFiles.filter((file) =>
			file.path.toLowerCase().endsWith(`/${normalizedCandidate}`),
		);
		const suffixMatch = pickClosestFile(suffixMatches, sourcePath);
		if (suffixMatch) {
			return suffixMatch;
		}

		const candidateName = normalizedCandidate.split("/").pop();
		if (!candidateName) {
			continue;
		}

		const nameMatches = vaultFiles.filter(
			(file) => file.name.toLowerCase() === candidateName,
		);
		const nameMatch = pickClosestFile(nameMatches, sourcePath);
		if (nameMatch) {
			return nameMatch;
		}
	}

	return undefined;
}

function pickClosestFile(files: TFile[], sourcePath: string): TFile | undefined {
	if (files.length === 0) {
		return undefined;
	}
	if (files.length === 1) {
		return files[0];
	}

	const sourceDir = directoryOf(sourcePath).toLowerCase();
	if (sourceDir) {
		const sameDirFile = files.find(
			(file) => directoryOf(file.path).toLowerCase() === sourceDir,
		);
		if (sameDirFile) {
			return sameDirFile;
		}
	}

	return [...files].sort((a, b) => a.path.localeCompare(b.path))[0];
}

function directoryOf(filePath: string): string {
	const lastSeparator = filePath.lastIndexOf("/");
	return lastSeparator >= 0 ? filePath.slice(0, lastSeparator) : "";
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
	const bytes = new Uint8Array(arrayBuffer);
	let binary = "";
	const chunkSize = 0x8000;

	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}

	return btoa(binary);
}

function toDataUri(mimeType: string, encoded: string): string {
	const normalizedMimeType = mimeType.trim() || "application/octet-stream";
	return `data:${normalizedMimeType};base64,${encoded}`;
}

async function prepareEmbeddedAsset(
	fileData: ArrayBuffer,
	mimeType: string,
	options?: EmbeddedAssetOptions,
): Promise<{ fileData: ArrayBuffer; mimeType: string }> {
	const maxWidth = options?.maxWidth ?? 0;
	const maxHeight = options?.maxHeight ?? 0;
	if (
		maxWidth <= 0 ||
		maxHeight <= 0 ||
		!mimeType.startsWith("image/") ||
		typeof document === "undefined"
	) {
		return { fileData, mimeType };
	}

	try {
		const sourceBlob = new Blob([fileData], { type: mimeType });
		const sourceImage = await loadImage(sourceBlob);
		const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
		const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
		if (sourceWidth <= 0 || sourceHeight <= 0) {
			return { fileData, mimeType };
		}

		const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
		if (scale >= 1) {
			return { fileData, mimeType };
		}

		const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
		const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
		const canvas = document.createElement("canvas");
		canvas.width = targetWidth;
		canvas.height = targetHeight;

		const context = canvas.getContext("2d");
		if (!context) {
			return { fileData, mimeType };
		}

		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";
		context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

		const outputMimeType = normalizeCanvasMimeType(mimeType);
		const resizedBlob = await canvasToBlob(canvas, outputMimeType);
		if (!resizedBlob) {
			return { fileData, mimeType };
		}

		return {
			fileData: await resizedBlob.arrayBuffer(),
			mimeType: outputMimeType,
		};
	} catch {
		return { fileData, mimeType };
	}
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const objectUrl = URL.createObjectURL(blob);
		const image = new Image();

		image.onload = () => {
			URL.revokeObjectURL(objectUrl);
			resolve(image);
		};

		image.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new Error("Unable to decode image."));
		};

		image.src = objectUrl;
	});
}

function normalizeCanvasMimeType(mimeType: string): string {
	switch (mimeType) {
		case "image/png":
		case "image/jpeg":
		case "image/webp":
			return mimeType;
		default:
			return "image/png";
	}
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob | undefined> {
	return new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob ?? undefined), mimeType, 0.92);
	});
}

function getMimeType(filePath: string): string {
	const extension = filePath.split(".").pop()?.toLowerCase();
	switch (extension) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		case "svg":
			return "image/svg+xml";
		default:
			return "application/octet-stream";
	}
}
