import domToImage from "dom-to-image-more";
import { sanitizeFileName, writeBytesToDownloads } from "../utils/downloads";

const EXPORT_SCALE = 2;

export async function exportElementAsPng(
	element: HTMLElement,
	baseFileName: string,
): Promise<string> {
	return exportAsPngInternal(element, baseFileName, false);
}

export async function exportElementAsPrintFriendlyPng(
	element: HTMLElement,
	baseFileName: string,
): Promise<string> {
	return exportAsPngInternal(element, baseFileName, true);
}

async function exportAsPngInternal(
	element: HTMLElement,
	baseFileName: string,
	printFriendly: boolean,
): Promise<string> {
	if (document.fonts) {
		await document.fonts.ready;
	}

	const pngDataUrl = await renderElementToPngDataUrl(element, printFriendly);
	const pngBytes = dataUrlToBytes(pngDataUrl);
	const fileName = printFriendly
		? `${sanitizeFileName(baseFileName)}-print.png`
		: `${sanitizeFileName(baseFileName)}.png`;
	return writeBytesToDownloads(fileName, pngBytes);
}

async function renderElementToPngDataUrl(
	element: HTMLElement,
	printFriendly: boolean,
): Promise<string> {
	const bounds = element.getBoundingClientRect();
	const width = Math.max(1, Math.ceil(bounds.width));
	const height = Math.max(1, Math.ceil(bounds.height));

	let targetEl = element;
	if (printFriendly) {
		targetEl = element.cloneNode(true) as HTMLElement;
		applyPrintFriendlyStyles(targetEl);
		targetEl.style.position = "fixed";
		targetEl.style.left = "-20000px";
		targetEl.style.top = "-20000px";
		targetEl.style.pointerEvents = "none";
		targetEl.style.opacity = "1";
		document.body.appendChild(targetEl);
	}

	try {
		return await domToImage.toPng(targetEl, {
			width,
			height,
			cacheBust: true,
			style: {
				transform: "scale(1)",
				transformOrigin: "top left",
			},
		});
	} catch (error) {
		if (!isTaintedCanvasError(error)) {
			throw error;
		}
		return renderElementWithoutImages(targetEl, width, height, printFriendly);
	} finally {
		if (printFriendly && targetEl !== element) {
			targetEl.remove();
		}
	}
}

function applyPrintFriendlyStyles(element: HTMLElement): void {
	element.classList.add("nimble-print-friendly");
}

async function renderElementWithoutImages(
	element: HTMLElement,
	width: number,
	height: number,
	printFriendly: boolean,
): Promise<string> {
	const clone = element.cloneNode(true) as HTMLElement;

	for (const image of Array.from(clone.querySelectorAll("img"))) {
		image.removeAttribute("src");
		image.removeAttribute("srcset");
		image.removeAttribute("sizes");
		image.style.display = "none";
	}

	if (printFriendly) {
		applyPrintFriendlyStyles(clone);
	}

	clone.style.position = "fixed";
	clone.style.left = "-20000px";
	clone.style.top = "-20000px";
	clone.style.pointerEvents = "none";
	clone.style.opacity = "1";

	document.body.appendChild(clone);

	try {
		return await domToImage.toPng(clone, {
			width,
			height,
			cacheBust: true,
		});
	} finally {
		clone.remove();
	}
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
	const separatorIndex = dataUrl.indexOf(",");
	if (separatorIndex < 0) {
		throw new Error("Invalid PNG data URL.");
	}

	const base64Payload = dataUrl.slice(separatorIndex + 1);
	const binary = atob(base64Payload);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function isTaintedCanvasError(error: unknown): boolean {
	const message = getErrorMessage(error).toLowerCase();
	return message.includes("tainted canvases may not be exported");
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") {
			return message;
		}
	}
	return "Unknown error";
}