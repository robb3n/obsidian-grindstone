# Grindstone UI Design Specification

## Design Direction

The plugin adopts an **S3 Chinese aesthetic** — structured, restrained, and rooted in traditional Chinese visual language. Not decorative for its own sake; every choice serves readability and focus.

### Color System

Two sets of CSS variables for dark/light theme adaptation.

| Role | Dark | Light | Obsidian Var |
|------|------|-------|-------------|
| Vermilion (accent, due, hard) | `#b83420` solid | `rgba(184,52,32,0.25)` wash | `--gs-vermilion` |
| Ink Wash (secondary, good) | `#4a6880` | `rgba(74,104,128,0.35)` | `--gs-ink-wash` |
| Gold (mature, tags) | `#8a7030` | `rgba(138,112,48,0.35)` | `--gs-gold` |
| Jade (easy) | `#3a7a50` | `rgba(58,122,80,0.3)` | `--gs-jade` |

All other colors (background, text, borders) use Obsidian's native CSS variables (`--background-secondary`, `--text-normal`, `--text-muted`, `--text-faint`, `--background-modifier-border`, etc.) for automatic theme adaptation.

### Typography

**Current implementation**: Uses Obsidian's default fonts (inherited from user's theme settings). No custom font loading.

**Design intent** (for future theming system):

| Role | Font | Usage |
|------|------|-------|
| Display/title | Ma Shan Zheng (马善政) | "磨石" header, large numbers |
| Body/labels | LXGW WenKai TC (霞鹜文楷) | Section labels, buttons, stat labels, tag leaves |
| Serif | Noto Serif SC | General text, tooltips |

**Blocker**: Obsidian plugin CSS cannot reliably load external fonts via `@import`. Injecting `<link>` tags in `onload()` causes side effects. Solutions to explore:
- Bundle font subsets as plugin assets
- Use `@font-face` with local font detection (`local()`)
- Defer to a future theming/template system

### Layout Principles

- **Max width**: 800px, centered
- **Spacing**: Compact — panels use 18-20px padding, 10-12px gaps between grid items
- **No card borders in S5 variant** (borderless, section dividers only); **S3 uses bordered panels**
- **Grid**: 2×2 for data panels, full-width for today banner and tag list

## Views

### Overview (`overview-view.ts`)

Registered as `grindstone-overview` ItemView, opens in main editor area.

**Sections (top to bottom):**

1. **Header** — "磨石" + "GRINDSTONE" subtitle, decorative gradient divider
2. **Today Banner** — Three key metrics (到期/已复习/剩余) + "开始复习" button. Vermilion top-border accent.
3. **Data Grid (2×2)**:
   - Next 7 days due — bar chart, vermilion bars, hover reveals count
   - Card maturity — three-segment progress bar (new/learning/mature) + legend
   - Rating distribution — horizontal bars for Hard/Good/Easy with percentages
   - Daily study time — bar chart, ink-wash blue bars, hover reveals minutes
4. **Tag Overview** — List of trigger tags with micro bar + count. Click triggers Obsidian global search (`tag:xxx`).
5. **Colophon** — "磨刀不误砍柴工"

**Data sources**: All data comes from `DataStore` methods (`getStats`, `getUpcomingDue`, `getMaturityDistribution`, `getRatingDistribution`, `getDailyStudyTime`, `getAllCards`).

### Review Modal (`review-modal.ts`)

Standard Obsidian Modal. Card front → show/hide content → rate.

### Review Sidebar (`sidebar-view.ts`)

Registered as `grindstone-sidebar` ItemView, opens in right leaf. Same card rendering as modal but persistent.

### Settings Tab (`settings-tab.ts`)

Standard Obsidian PluginSettingTab. Controls: trigger tags, exclude tags, prefix match toggle, star writeback toggle.

## Interaction Patterns

| Element | Interaction |
|---------|------------|
| Bar chart column | Hover → show count/time tooltip above bar |
| File path (review card) | Click → toggle between filename and full path |
| Tag badges (review card) | Click → toggle between short (`#高数`) and full (`#考研数学/高数`) |
| Tag row (overview) | Click → trigger Obsidian global search for that tag |
| "开始复习" button | Opens Review Modal with today's due queue |
| "跳到原文" button | Opens source note in new tab, cursor at block line |

## CSS Architecture

All overview styles prefixed with `gs-` to avoid collision with Obsidian and other plugins.

Theme adaptation pattern:
```css
.gs-overview {
  --gs-vermilion: #b83420;  /* base color, same for both themes */
}
.theme-light .gs-overview {
  --gs-vermilion-bg: rgba(184,52,32,0.15);  /* light-specific wash */
}
.theme-dark .gs-overview {
  --gs-vermilion-bg: #6a2820;  /* dark-specific solid */
}
```

## Design Mockups

Static HTML mockups in `mockup/` directory for visual reference:

| File | Description |
|------|-------------|
| `overview.html` | S1 — Industrial/forge aesthetic |
| `overview-s2.html` | S2 — Extreme minimal |
| `overview-s3.html` | S3 — Chinese structured (dark) — **CHOSEN** |
| `overview-s3-light.html` | S3 — Chinese structured (light) |
| `overview-s4.html` | S4 — Blog-matched (robb3n.site style) |

## Future: Theme Templates

The overview design should eventually support **swappable theme templates**. Each template defines:
- Color palette (CSS custom properties)
- Typography stack
- Layout variant (bordered panels vs borderless sections)
- Chart style (solid bars vs gradient ink-wash)

Templates are CSS-only — the DOM structure and data binding remain constant. Switching templates = swapping a CSS class on the root container.
