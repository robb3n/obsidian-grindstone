# Grindstone

Inline-tag-driven spaced repetition (SM-2) for Obsidian.

Zero extra syntax. Works with your existing inline tags.

## How it works

Any line containing a **trigger tag** (e.g. `#考研数学/高数/极限`) becomes a review card.

- **Card title** = the non-tag text on that line
- **Card content** = everything from that line to the next `---`, heading, or trigger-tag line
- **SM-2 scheduling** with Hard / Good / Easy ratings

### Star writeback (optional)

After rating, the plugin writes a visual difficulty marker back to your note:

| Rating | Marker |
|--------|--------|
| Hard   | ⭐️⭐️ |
| Good   | ⭐️   |
| Easy   | (none) |

## Review modes

- **Modal** (Command palette: `Grindstone: Start Review` or ribbon icon) - focused, full-screen review
- **Sidebar** (Command palette: `Grindstone: Open Review Sidebar`) - review alongside your notes

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Trigger tags | `#考研数学`, `#408` | Lines with these tags become cards. Supports prefix matching. |
| Exclude tags | (empty) | Lines with these tags are skipped. |
| Prefix match | on | `#考研数学` also matches `#考研数学/高数/极限`. |
| Star writeback | on | Write star markers back to source files on review. |

## Install

### Manual

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/robb3n/obsidian-grindstone/releases/latest), place them in `.obsidian/plugins/obsidian-grindstone/`, and enable the plugin in Settings.

## Build from source

```bash
npm install
npm run build
```

## License

MIT
