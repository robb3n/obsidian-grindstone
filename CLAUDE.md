# Obsidian Grindstone - Development Rules

## Vault Read-Only Principle

The plugin treats the Obsidian vault as **read-only** — it must never modify user note files by default. All plugin data (cards, review logs, statistics) is stored in the plugin's own `data.json`.

Any feature that writes to vault files (e.g. star writeback) must have a toggle switch in Settings.

## Deploy

Build and copy artifacts to the user's Obsidian vault after every code change:

```bash
npm run build && cp main.js styles.css ~/Documents/Obsidian/CSNote/.obsidian/plugins/obsidian-grindstone/
```

User reloads Obsidian manually to pick up changes.

## Release

When the user says **"发版"**, execute the full release flow:

1. Bump `version` in **both** `manifest.json` and `package.json` (keep them in sync).
2. Stage changed files, commit with a descriptive message.
3. `git tag <version>` then `git push origin main --tags`.

Version in manifest.json must be updated **before** creating the git tag.

## Documentation

- [UI Design Specification](docs/ui-design.md) — Color system, typography, layout, views, interaction patterns, CSS architecture, theme template roadmap.
