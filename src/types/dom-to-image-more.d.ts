declare module "dom-to-image-more" {
	export interface DomToImageOptions {
		width?: number;
		height?: number;
		bgcolor?: string;
		cacheBust?: boolean;
		filter?: (node: unknown) => boolean;
		style?: Record<string, string>;
	}

	const domToImage: {
		toPng(node: Node, options?: DomToImageOptions): Promise<string>;
	};

	export default domToImage;
}
