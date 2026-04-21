import { mkdir, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";

export function sanitizeFileName(input: string): string {
	const normalized = input.trim().toLowerCase().replace(/\s+/g, "-");
	const safe = normalized.replace(/[^a-z0-9._-]/g, "");
	return safe || "nimble-statblock";
}

export async function writeTextToDownloads(
	fileName: string,
	content: string,
): Promise<string> {
	const outputPath = await getOutputPath(fileName);
	await writeFile(outputPath, content, "utf8");
	return outputPath;
}

export async function writeBytesToDownloads(
	fileName: string,
	content: Uint8Array,
): Promise<string> {
	const outputPath = await getOutputPath(fileName);
	await writeFile(outputPath, content);
	return outputPath;
}

async function getOutputPath(fileName: string): Promise<string> {
	const downloadsPath = path.join(os.homedir(), "Downloads");
	await mkdir(downloadsPath, { recursive: true });
	return path.join(downloadsPath, fileName);
}
