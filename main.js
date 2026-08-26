//#region ../openclime/packages/plugin-sdk/src/host.ts
/**
* Canvas lifecycle event names — the string keys passed to
* `app.canvas.on(event, cb)`. The runtime emits these **post-commit** by
* diffing the previous vs current canvas state, so a change from ANY source
* fires: plugin/agent ops, user drag/connect/drop, paste, duplicate,
* undo/redo, and collab sync.
*
* Listener callbacks receive the affected entity:
* - `node:created` → `(node)`
* - `node:updated` → `({ id, before, after })` (any tracked field changed:
*   pos/size/label/description/color/type/icon/layer/data; `before`/`after`
*   are the previous and current node so listeners can compute the delta)
* - `node:deleted` → `(nodeId)`
* - `edge:created` → `(edge)`
* - `edge:updated` → `({ id, before, after })` (any tracked field changed:
*   source/target ports, label, color, style, animated, width; `before`/
*   `after` are the previous and current edge so listeners can compute
*   the delta)
* - `edge:deleted` → `(edgeId)`
* - `layer:created` → `(layer)`
* - `layer:updated` → `({ id, before, after })` (name/visible/locked/color
*   change; `before`/`after` are the previous and current layer)
* - `layer:deleted` → `(layerId)`
* - `viewport:changed` → `({ before, after })` (any pan/zoom change; `after`
*   is the new `{x, y, zoom}`, `before` the previous viewport)
* - `selection:changed` → `(nodeIds: string[])` (fires when the selected
*   node id set changes, including to an empty selection)
* - `graph:changed` → `({ nodes, edges })` (coarse catch-all, fires on any
*   node/edge reference change)
*
* Caveats:
* - Events fire only in the window that owns the canvas (CanvasStudio). Other
*   windows (asset library, agent chat) never wire the canvas host slot.
* - A listener that re-mutates the canvas (e.g. `app.canvas.addNode`) can
*   cause a self-feedback loop — guard with your own state.
* - A board/project switch emits mass `node:deleted` (old board) +
*   `node:created` (new board); semantically correct but potentially noisy.
*/
const CANVAS_EVENTS = {
	nodeCreated: "node:created",
	nodeUpdated: "node:updated",
	nodeDeleted: "node:deleted",
	edgeCreated: "edge:created",
	edgeUpdated: "edge:updated",
	edgeDeleted: "edge:deleted",
	layerCreated: "layer:created",
	layerUpdated: "layer:updated",
	layerDeleted: "layer:deleted",
	viewportChanged: "viewport:changed",
	selectionChanged: "selection:changed",
	graphChanged: "graph:changed"
};
//#endregion
//#region ../openclime/packages/plugin-sdk/src/component.ts
var Component = class {
	/**
	* Whether `load()` has run and `unload()` has not. Protected rather than
	* private because `OpenClimePlugin` is constructed already-live by the loader
	* (there is no separate `load()` call in the plugin lifecycle) and has to
	* set it directly — otherwise `addChild` would refuse to load children.
	*/
	_loaded = false;
	children = [];
	cleanups = [];
	/** Load this component and its children. Idempotent. */
	load() {
		if (this._loaded) return;
		this._loaded = true;
		this.onload();
		for (const child of this.children) child.load();
	}
	/** Override to initialise. Called once by `load()`. */
	onload() {}
	/**
	* Unload this component: `onunload()`, then every registered cleanup and
	* child. Idempotent — teardown clears its own bookkeeping as it goes.
	*/
	unload() {
		if (!this._loaded) return;
		this._loaded = false;
		this.onunload();
		this.teardown();
	}
	/** Override to clean up beyond what `register*` already covers. */
	onunload() {}
	/**
	* Run every registered cleanup + unload every child, WITHOUT calling
	* `onunload()`.
	*
	* Exists because the plugin runtime already calls `instance.onunload()`
	* itself before draining the host cleanup stack (registry.ts `disable`), so
	* a plugin routes its teardown here to avoid running `onunload()` twice.
	* Safe to call repeatedly: both lists are drained, not just iterated.
	*/
	teardown() {
		const cleanups = this.cleanups;
		this.cleanups = [];
		for (let i = cleanups.length - 1; i >= 0; i--) try {
			cleanups[i]?.();
		} catch (err) {
			console.error("[plugin-sdk] cleanup threw during unload:", err);
		}
		const children = this.children;
		this.children = [];
		for (let i = children.length - 1; i >= 0; i--) try {
			children[i]?.unload();
		} catch (err) {
			console.error("[plugin-sdk] child unload threw:", err);
		}
	}
	/** Add a child component, loading it if this component is already loaded. */
	addChild(component) {
		if (this.children.includes(component)) return component;
		this.children.push(component);
		if (this._loaded) component.load();
		return component;
	}
	/** Remove a child component, unloading it. */
	removeChild(component) {
		const i = this.children.indexOf(component);
		if (i !== -1) this.children.splice(i, 1);
		component.unload();
		return component;
	}
	/** Register a callback to run on unload. */
	register(cb) {
		this.cleanups.push(cb);
	}
	/** Register a host subscription handle to be released on unload. */
	registerEvent(unsubscribe) {
		this.register(unsubscribe);
	}
	registerDomEvent(el, type, callback, options) {
		const listener = callback;
		el.addEventListener(type, listener, options);
		this.register(() => el.removeEventListener(type, listener, options));
	}
	/**
	* Register a timer id (from `setInterval`) to be cleared on unload. Returns
	* the id so it can be inlined:
	* `this.registerInterval(setInterval(fn, 1000))`.
	*
	* Clears via the global `clearInterval` rather than `window.clearInterval`
	* — the SDK is bundled into plugins and also type-checked/tested outside a
	* DOM, where `window` is undefined.
	*/
	registerInterval(id) {
		this.register(() => clearInterval(id));
		return id;
	}
};
//#endregion
//#region ../openclime/packages/plugin-sdk/src/base.ts
/**
* OpenClimePlugin — base class third-party plugins extend.
*
* A plugin is a container of typed extension points contributed from `onload()`
* against the injected `app` (PluginHost). Mirrors Obsidian's `Plugin` class:
* `onload()` registers contributions; `onunload()` cleans up (registered
* cleanups also auto-run). Per-plugin storage via `loadData`/`saveData`.
*
* Extends {@link Component}, so a plugin can own child components and register
* DOM listeners / intervals that tear down with it (Obsidian parity —
* `Plugin extends Component`).
*
* Authors build `main.js` (ESM) default-exporting a subclass; the loader
* (`loader.ts`) instantiates it as `new Impl(manifest, host)` then awaits
* `onload()`.
*/
var OpenClimePlugin = class extends Component {
	manifest;
	/** The host API (`app.*`). Injected by the loader before `onload()`. */
	app;
	/**
	* This plugin's settings object. Assign it in `onload()` — normally
	* `this.settings = await this.loadSettings(DEFAULTS)`. `PluginSettingTab`
	* reads and writes it.
	*/
	settings;
	/**
	* Plugin-level version migrations (§41). Declared against the MANIFEST
	* version: the host compares the previously-recorded manifest version with
	* the current one before `onload()`, runs every matching `PluginMigration`
	* in declaration order, then records the new version as the baseline. A
	* plugin whose settings / `app.storage` shape changed between releases
	* declares a migration here so existing users' data is rewritten before
	* the new code reads it.
	*/
	migrations;
	constructor(manifest, app) {
		super();
		this.manifest = manifest;
		this.app = app;
		this._loaded = true;
		this.app.registerCleanup(() => {
			this._loaded = false;
			this.teardown();
		});
	}
	/** Optional cleanup beyond registered callbacks. Called on disable/hot-reload. */
	onunload() {}
	/** Per-plugin persistent data (Obsidian parity). */
	loadData() {
		return this.app.storage.load();
	}
	saveData(data) {
		return this.app.storage.save(data);
	}
	/**
	* Load this plugin's settings, filling in whatever the stored object is
	* missing from `defaults`, and assign the result to `this.settings`.
	*
	* Shallow merge, matching Obsidian's conventional
	* `Object.assign({}, DEFAULTS, await this.loadData())`. Nested objects are
	* replaced wholesale rather than deep-merged — a deep merge would make it
	* impossible for a user to drop a key that exists in a nested default.
	*/
	async loadSettings(defaults) {
		const stored = await this.loadData();
		const merged = {
			...defaults,
			...stored
		};
		this.settings = merged;
		return merged;
	}
	/** Persist `this.settings`. Paired with {@link loadSettings}. */
	saveSettings() {
		return this.saveData(this.settings ?? {});
	}
	/**
	* Register a cleanup callback — auto-run on unload.
	*
	* Overridden to forward to the host instead of `Component`'s own stack: the
	* runtime owns the plugin's cleanup list (it drains that list in `disable`
	* even when the instance is dropped), so it stays the single source of
	* truth. Child components still tear down through `Component`.
	*/
	register(cb) {
		this.app.registerCleanup(cb);
	}
	/**
	* Namespace a contribution id with this plugin's id.
	*
	* `uiRegistry.unregisterPlugin` strips registrations by `<pluginId>:` prefix
	* on disable, so an unprefixed id leaves a zombie entry in the command
	* palette / toolbar / settings sidebar. Doing it here means an author cannot
	* get it wrong (Obsidian prefixes `Plugin.addCommand` ids for the same
	* reason). Already-prefixed ids pass through, so double-prefixing can't
	* happen either.
	*/
	prefixId(id) {
		const prefix = `${this.manifest.id}:`;
		return id.startsWith(prefix) ? id : `${prefix}${id}`;
	}
	/**
	* Register a settings tab. Fills `id` (prefixed) and `label` (the manifest
	* name) when the tab does not set them itself, and primes `settingItems` so
	* the sidebar entry renders on first open without waiting for an update.
	*/
	addSettingTab(tab) {
		tab.id = this.prefixId(tab.id ?? "settings");
		tab.label ??= this.manifest.name;
		tab.update();
		this.app.ui.registerSettingsTab(tab);
		return tab;
	}
	/** Register a command in the palette (Cmd+K). Returns the prefixed command. */
	addCommand(command) {
		const prefixed = {
			...command,
			id: this.prefixId(command.id)
		};
		this.app.ui.registerCommand(prefixed);
		return prefixed;
	}
	/** Add a button to the canvas toolbar. */
	addToolbarButton(button) {
		const prefixed = {
			...button,
			id: this.prefixId(button.id)
		};
		this.app.ui.registerToolbarButton(prefixed);
		return prefixed;
	}
	/** Add a side panel. */
	addPanel(panel) {
		const prefixed = {
			...panel,
			id: this.prefixId(panel.id)
		};
		this.app.ui.registerPanel(prefixed);
		return prefixed;
	}
	/** Add an item to the canvas right-click menu. */
	addContextMenuItem(item) {
		const prefixed = {
			...item,
			id: this.prefixId(item.id)
		};
		this.app.ui.registerContextMenu(prefixed);
		return prefixed;
	}
	/** Register a global keyboard shortcut. */
	addShortcut(shortcut) {
		const prefixed = {
			...shortcut,
			id: this.prefixId(shortcut.id)
		};
		this.app.ui.registerShortcut(prefixed);
		return prefixed;
	}
	/**
	* Register the floating toolbar / prompt bar for one or more node types
	* (Part B). Node types are NOT auto-prefixed — unlike command or panel
	* ids, a node type is the same string you passed to
	* `canvas.registerNodeDef`, and rewriting it here would silently fail to
	* match. Prefix it yourself when you declare the node.
	*
	* Exists so every contribution has one `this.addXxx()` shape; the raw
	* `this.app.registerNodeUI` remains available.
	*/
	addNodeUI(types, contribution) {
		this.app.registerNodeUI(types, contribution);
	}
};
//#endregion
//#region src/main.ts
/**
* Color Tag — example plugin.
*
* Adds a single "color-tag" palette node that, when dragged onto the
* canvas, lets you pick a category color and apply it to the selected
* node(s) in one click. Demonstrates the safe-trust surface: read/write
* canvas, register one palette node, expose a command + context menu.
*/
const COLORS = [
	{
		id: "slate",
		name: "Slate",
		value: "#64748b"
	},
	{
		id: "red",
		name: "Red",
		value: "#ef4444"
	},
	{
		id: "amber",
		name: "Amber",
		value: "#f59e0b"
	},
	{
		id: "emerald",
		name: "Emerald",
		value: "#10b981"
	},
	{
		id: "sky",
		name: "Sky",
		value: "#0ea5e9"
	},
	{
		id: "violet",
		name: "Violet",
		value: "#8b5cf6"
	}
];
const DEFAULT_COLOR = "emerald";
var ColorTagPlugin = class extends OpenClimePlugin {
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
			inputs: [{
				name: "color",
				type: "select",
				label: "Color",
				options: COLORS.map((c) => c.id),
				default: DEFAULT_COLOR
			}],
			outputs: [],
			defaultData: { color: DEFAULT_COLOR }
		});
		const applyColor = (colorId, nodeIds) => {
			const color = COLORS.find((c) => c.id === colorId)?.value;
			if (!color) {
				app.logger.warn(`unknown color id: ${colorId}`);
				return;
			}
			if (nodeIds.length === 0) {
				app.notify("请先选中至少一个节点", "warning");
				return;
			}
			for (const id of nodeIds) app.canvas.updateNode?.(id, { color });
			app.notify(`已将 ${nodeIds.length} 个节点设为 ${colorId}`, "success");
		};
		app.ui.registerCommand({
			id: toolId,
			title: "Apply color tag to selection",
			subtitle: "Color Tag",
			action: () => {
				const selected = app.canvas.getNodes().filter((n) => n.selected).map((n) => n.id);
				applyColor(DEFAULT_COLOR, selected);
			}
		});
		app.ui.registerToolbarButton({
			id: toolId,
			icon: "Tag",
			label: "Tag color",
			onClick: () => {
				const selected = app.canvas.getNodes().filter((n) => n.selected).map((n) => n.id);
				applyColor(DEFAULT_COLOR, selected);
			}
		});
		app.ui.registerContextMenu({
			id: `${pluginId}:context`,
			label: "Tag color (emerald)",
			icon: "Tag",
			action: (selectedIds) => applyColor(DEFAULT_COLOR, selectedIds)
		});
		const off = app.canvas.on(CANVAS_EVENTS.nodeCreated, (node) => {
			if (typeof node.type === "string" && node.type === tagType) app.logger.info(`color-tag node created at (${node.x}, ${node.y})`);
		});
		this.register(off);
		app.logger.info(`Color Tag loaded — ${COLORS.length} colors available`);
	}
};
//#endregion
export { ColorTagPlugin as default };
