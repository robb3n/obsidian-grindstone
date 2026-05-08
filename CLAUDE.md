# Obsidian Grindstone - Development Rules

## Vault Read-Only Principle

The plugin treats the Obsidian vault as **read-only** — it must never modify user note files by default. All plugin data (cards, review logs, statistics) is stored in the plugin's own `data.json`.

Any feature that writes to vault files (e.g. star writeback) must have a toggle switch in Settings.

## Documentation

- [UI Design Specification](docs/ui-design.md) — Color system, typography, layout, views, interaction patterns, CSS architecture, theme template roadmap.
