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
			// Sibling checkout of the monorepo (matches tsconfig's
			// `../../polycreator/...`) — never an absolute home path.
			"@polycreator/plugin-sdk": path.resolve(__dirname, "../polycreator/packages/plugin-sdk/src/index.ts"),
		},
	},
};