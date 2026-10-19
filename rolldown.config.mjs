import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
	input: "src/main.ts",
	output: {
		dir: ".",
		entryFileNames: "main.js",
		format: "esm",
	},
	resolve: {
		alias: {
			"@polycreator/plugin-sdk": "~/Projects/polycreator/packages/plugin-sdk/src/index.ts",
		},
	},
};