/**
 * Color Tag — example plugin.
 *
 * Adds a single "color-tag" palette node that, when dragged onto the
 * canvas, lets you pick a category color and apply it to the selected
 * node(s) in one click. Demonstrates the safe-trust surface: read/write
 * canvas, register one palette node, expose a command + context menu.
 */
import {
	PolycreatorPlugin,
	CANVAS_EVENTS,
	type PluginHost,
} from "@polycreator/plugin-sdk";

const COLORS = [
	{ id: "slate", name: "Slate", value: "#64748b" },
	{ id: "red", name: "Red", value: "#ef4444" },
	{ id: "amber", name: "Amber", value: "#f59e0b" },
	{ id: "emerald", name: "Emerald", value: "#10b981" },
	{ id: "sky", name: "Sky", value: "#0ea5e9" },
	{ id: "violet", name: "Violet", value: "#8b5cf6" },
] as const;

const DEFAULT_COLOR = "emerald";

class ColorTagPlugin extends PolycreatorPlugin {
	async onload() {
		const { app } = this;
		const pluginId = this.manifest.id;
		const tagType = `${pluginId}:tag`;
		const toolId = `${pluginId}:apply-color`;

		app.canvas.registerNodeDef({
			type: tagType,
			label: "Color Tag",
			category: "Color Tag",
			icon: "Tag",
			color: "#10b981",
			inputs: [
				{
					name: "color",
					type: "select",
					label: "Color",
					options: COLORS.map((c) => c.id),
					default: DEFAULT_COLOR,
				},
			],
			outputs: [],
			defaultData: { color: DEFAULT_COLOR },
		});

		const applyColor = (colorId: string, nodeIds: string[]) => {
			const color = COLORS.find((c) => c.id === colorId)?.value;
			if (!color) {
				app.logger.warn(`unknown color id: ${colorId}`);
				return;
			}
			if (nodeIds.length === 0) {
				app.notify("请先选中至少一个节点", "warning");
				return;
			}
			for (const id of nodeIds) {
				(app.canvas as any).updateNode?.(id, { color });
			}
			app.notify(`已将 ${nodeIds.length} 个节点设为 ${colorId}`, "success");
		};

		app.ui.registerCommand({
			id: toolId,
			title: "Apply color tag to selection",
			subtitle: "Color Tag",
			action: () => {
				const selected = app.canvas
					.getNodes()
					.filter((n: any) => n.selected)
					.map((n: any) => n.id);
				applyColor(DEFAULT_COLOR, selected);
			},
		});

		app.ui.registerToolbarButton({
			id: toolId,
			icon: "Tag",
			label: "Tag color",
			onClick: () => {
				const selected = app.canvas
					.getNodes()
					.filter((n: any) => n.selected)
					.map((n: any) => n.id);
				applyColor(DEFAULT_COLOR, selected);
			},
		});

		app.ui.registerContextMenu({
			id: `${pluginId}:context`,
			label: "Tag color (emerald)",
			icon: "Tag",
			action: (selectedIds: string[]) => applyColor(DEFAULT_COLOR, selectedIds),
		});

		const off = app.canvas.on(CANVAS_EVENTS.nodeCreated, (node: any) => {
			if (typeof node.type === "string" && node.type === tagType) {
				app.logger.info(`color-tag node created at (${node.x}, ${node.y})`);
			}
		});
		this.register(off);

		app.logger.info(`Color Tag loaded — ${COLORS.length} colors available`);
	}
}

export default ColorTagPlugin;