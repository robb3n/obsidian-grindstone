# Grindstone

Inline-tag-driven spaced repetition (SM-2) for Obsidian.

Zero extra syntax. Any line in your notes that contains a trigger tag becomes a review card — the title is the line itself, the answer is everything below it.

**Vault-read-only by default.** Grindstone never modifies your notes unless you opt in. The two features that touch your files (embedded card IDs and star writeback) are off by default and exposed in the first-run welcome modal and Settings.

## How cards are detected

A card **starts** at any line containing a trigger tag (e.g. `#grind` or `#grind/biology/cells`). A card **ends** at whichever comes first:

1. a `---` separator
2. the next trigger-tag line
3. the next heading
4. end of file

- The **question** is the non-tag text on the trigger line.
- The **answer** is the content between the trigger line and the boundary.

### Stable card IDs (opt-in)

By default Grindstone treats your vault as **read-only** and identifies cards by hashing file path + question text. That works as long as you don't rename files or edit card titles.

If you want history that survives renames and edits, opt in to **embedded IDs** in Settings (or pick "Embed IDs" in the first-run welcome modal). The plugin then writes a short HTML comment (`<!-- gs:k7m2x9p1 -->`) once at the end of each trigger line. After that:

- Rename the file → history follows
- Edit the question text → history follows
- Move the block within the file → history follows

## The workspace

`Grindstone: Open Workspace` (or the flame ribbon icon) launches a 4-tab pane:

- **Overview** — today's queue, 7-day forecast, 12-week activity heatmap, maturity / rating breakdowns, top tags
- **Review** — pre-flight queue summary, inline review session, post-session debrief
- **Stats** — KPI strip with period deltas, review trend, accuracy by tag, forgetting curve, study minutes
- **Tags** — full card browser; multi-tag AND-filter, search, sort, expand a row to see the answer inline

Reviews started from the workspace run **inline** in the Review tab. `Grindstone: Start Review` opens the same SRS session as a centered modal — pick whichever you prefer.

## Rating & scheduling

Four ratings, mapped to keys **1 / 2 / 3 / 4**. `Space` reveals the answer; cards whose tags match `autoShowTags` skip the reveal step.

| Key | Rating | Effect |
|-----|--------|--------|
| 1 | Again | Re-queued this session; ease −0.20 |
| 2 | Hard  | Interval × 1.2; ease −0.15 |
| 3 | Good  | Interval × ease (standard SM-2) |
| 4 | Easy  | Interval × ease; ease +0.15 |

### SRS presets

Four built-in parameter sets:

- **默认 SM-2** — classic SM-2
- **Anki 标准** — Anki defaults
- **高频巩固** — shorter intervals, harsher penalties; good for cramming
- **轻松记忆** — longer intervals, lighter penalties

You can save custom presets and assign a different strategy **per deck** (deck = top-level tag). When switching strategies on an existing deck, you choose how to migrate existing cards: gradual, reset ease only, or full reset.

## Star writeback (opt-in)

Off by default. When enabled in Settings, the plugin writes a visual difficulty marker back to the trigger line on every rating:

| Rating | Marker |
|--------|--------|
| Again  | ⭐️⭐️⭐️ |
| Hard   | ⭐️⭐️ |
| Good   | ⭐️ |
| Easy   | (cleared) |

This is one of two features that modify your notes (the other is embedded card IDs); both are off by default and have toggle switches in Settings.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Trigger tags | `#grind` | Lines with these tags become cards. |
| Exclude tags | (empty) | Lines also carrying these tags are skipped. |
| Prefix match | on | `#grind` also matches `#grind/biology/cells`. |
| Embed card IDs | **off** | ⚠ Modifies notes. Inject `<!-- gs:xxxxxxxx -->` for rename-stable identity. |
| Auto-show tags | (empty) | Cards with these tags skip the "show answer" step. |
| Star writeback | **off** | ⚠ Modifies notes. Write ⭐️ markers back to source on rating. |
| SRS strategy | Default SM-2 | Global preset; overridable per deck. |
| Theme | auto | `auto` / `dark` / `light` — independent of Obsidian's theme. Toggle from the workspace sidebar. |

## Custom fonts

Drop `.woff2` / `.ttf` / `.otf` files into the plugin's `fonts-user/` directory; they're registered as the `Grindstone-User` family on next reload.

## Commands

| Command | What it does |
|---------|--------------|
| `Grindstone: Open Workspace` | Open the 4-tab workspace pane. |
| `Grindstone: Start Review` | Start a review session as a centered modal. |

## Install

### Manual

Grab `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/robb3n/obsidian-grindstone/releases/latest), drop them into `.obsidian/plugins/obsidian-grindstone/`, and enable the plugin.

## Build from source

```bash
npm install
npm run build
```

## License

MIT
