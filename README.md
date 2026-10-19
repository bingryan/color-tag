# Color Tag

A minimal PolyCreator example plugin — tag selected canvas nodes with a
category color so groups stand out at a glance.

## What it does

Adds three ways to recolor the currently selected nodes on the canvas with
the **Emerald** color:

1. **Toolbar button** — "Tag color" in the canvas toolbar
2. **Command palette** — `Cmd/Ctrl+K` → "Apply color tag to selection"
3. **Canvas right-click menu** — "Tag color (emerald)" on selected nodes

It also registers a `Color Tag` palette node (`example.color-tag:tag`) you
can drop on the canvas to mark a position with the same color.

## Install

The plugin is distributed via the
[PolyCreator plugin marketplace](https://polycreator.si/plugins/example.color-tag).
Open the page on a machine with the PolyCreator desktop app and click
**Install to PolyCreator** — the deep-link hands off to the desktop and
runs the shared install gates (permissions confirm, SHA-256 pin, dependency
check).

To install manually, open **Plugins → Install from URL** in the desktop app
and paste:

```
https://github.com/bingryan/color-tag/releases/latest/download/example.color-tag.zip
```

## Permissions declared

- `canvas.registerNodeDef` — only; runs in **safe** trust.

## Notes

- The example is intentionally minimal: every action hard-codes the
  Emerald color regardless of the palette node's `Color` selector. The
  selector exists so the node renders as a real, configurable node — but
  the three actions above all use the default. Branch off this repo if
  you want per-node coloring wired through to the toolbar / command.
- This plugin is part of the
  [PolyCreator plugin examples](https://github.com/bingryan/plugins) and
  ships as a reference for `safe`-trust authors.

## Categories

`node`

## License

MIT