import { TabId } from './WorkspaceView';

interface NavItem {
  id: TabId;
  zh: string;
  en: string;
  iconPath: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', zh: '概览', en: 'Overview',
    iconPath: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { id: 'decks', zh: '卡组', en: 'Decks',
    iconPath: 'M3 6a2 2 0 012-2h14a2 2 0 012 2v13H3V6zM3 10h18M9 14h6' },
  { id: 'review', zh: '复习', en: 'Review',
    iconPath: 'M21 12a9 9 0 11-3-6.7M21 4v5h-5' },
  { id: 'stats', zh: '统计', en: 'Stats',
    iconPath: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'tags', zh: '标签', en: 'Tags',
    iconPath: 'M20 12L12 20l-9-9V3h8zM7 7h.01' },
];

export interface SidebarOptions {
  activeTab: TabId;
  onNavigate: (tab: TabId) => void;
  dueCount: number;
  streak: number;
  onToggleTheme: () => void;
  themeMode: 'light' | 'dark' | undefined;
  isDark: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function renderSidebar(el: HTMLElement, opts: SidebarOptions): void {
  if (opts.collapsed) {
    renderCollapsed(el, opts);
  } else {
    renderExpanded(el, opts);
  }
}

/* ── Expanded (default) ──────────────────────────── */

function renderExpanded(el: HTMLElement, opts: SidebarOptions): void {
  // Logo + collapse button
  const logo = el.createDiv({ cls: 'gs-rail-logo' });
  const mark = logo.createDiv({ cls: 'gs-rail-mark', text: '磨' });
  mark.style.cursor = 'pointer';
  mark.addEventListener('click', () => opts.onToggleCollapse());
  const logoText = logo.createDiv();
  logoText.createDiv({ cls: 'gs-rail-zh', text: '磨刀石' });
  logoText.createDiv({ cls: 'gs-rail-en gs-en', text: 'GRINDSTONE' });

  const collapseBtn = logo.createEl('button', { cls: 'gs-rail-collapse-btn', text: '«' });
  collapseBtn.setAttribute('aria-label', '收起侧栏');
  collapseBtn.addEventListener('click', () => opts.onToggleCollapse());

  // Navigation
  const navSection = el.createDiv();
  navSection.createDiv({ cls: 'gs-rail-section gs-en', text: 'WORKSPACE' });
  const nav = navSection.createEl('nav', { cls: 'gs-rail-nav' });

  for (const item of NAV_ITEMS) {
    const btn = nav.createEl('button', {
      cls: `gs-rail-item${opts.activeTab === item.id ? ' gs-rail-item-on' : ''}`,
    });
    btn.addEventListener('click', () => opts.onNavigate(item.id));

    const svg = createSvgIcon(item.iconPath);
    btn.appendChild(svg);

    btn.createSpan({ text: item.zh });

    if (item.id === 'review' && opts.dueCount > 0) {
      btn.createSpan({ cls: 'gs-rail-item-badge', text: String(opts.dueCount) });
    }
  }

  // Footer: streak + theme toggle
  const foot = el.createDiv({ cls: 'gs-rail-foot' });

  const streak = foot.createDiv({ cls: 'gs-rail-streak' });
  streak.createSpan({ cls: 'gs-rail-streak-flame', text: '\uD83D\uDD25' });
  const streakText = streak.createDiv();
  streakText.createDiv({ cls: 'gs-rail-streak-num', text: String(opts.streak) });
  streakText.createDiv({ cls: 'gs-rail-streak-cap', text: '连续打卡 \u00B7 day streak' });

  renderThemeToggle(foot, opts, false);
}

/* ── Collapsed (icon-only) ───────────────────────── */

function renderCollapsed(el: HTMLElement, opts: SidebarOptions): void {
  // Logo mark only — click to expand
  const logo = el.createDiv({ cls: 'gs-rail-logo' });
  const mark = logo.createDiv({ cls: 'gs-rail-mark', text: '磨' });
  mark.style.cursor = 'pointer';
  mark.setAttribute('aria-label', '展开侧栏');
  mark.addEventListener('click', () => opts.onToggleCollapse());

  // Navigation icons only
  const nav = el.createEl('nav', { cls: 'gs-rail-nav' });

  for (const item of NAV_ITEMS) {
    const tooltip = item.id === 'review' && opts.dueCount > 0
      ? `${item.zh} (${opts.dueCount})`
      : item.zh;
    const btn = nav.createEl('button', {
      cls: `gs-rail-item${opts.activeTab === item.id ? ' gs-rail-item-on' : ''}`,
      attr: { 'aria-label': tooltip, title: tooltip },
    });
    btn.addEventListener('click', () => opts.onNavigate(item.id));

    const svg = createSvgIcon(item.iconPath);
    btn.appendChild(svg);

    // Dot indicator for review in collapsed mode
    if (item.id === 'review' && opts.dueCount > 0) {
      btn.createSpan({ cls: 'gs-rail-item-dot' });
    }
  }

  // Footer: compact streak + theme icon
  const foot = el.createDiv({ cls: 'gs-rail-foot' });

  const streak = foot.createDiv({ cls: 'gs-rail-streak' });
  streak.createSpan({ cls: 'gs-rail-streak-flame', text: '\uD83D\uDD25' });
  streak.createSpan({ cls: 'gs-rail-streak-num', text: String(opts.streak) });

  renderThemeToggle(foot, opts, true);
}

/* ── Shared: theme toggle ────────────────────────── */

function renderThemeToggle(parent: HTMLElement, opts: SidebarOptions, iconOnly: boolean): void {
  const toggle = parent.createEl('button', { cls: 'gs-themetoggle' });
  toggle.addEventListener('click', () => opts.onToggleTheme());

  const label = !opts.themeMode ? 'Auto' : opts.themeMode === 'dark' ? 'Dark' : 'Light';
  if (iconOnly) {
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
  }

  if (!opts.themeMode) {
    // Half sun / half moon circle — represents "auto / follow system"
    toggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor"/></svg>`;
    if (!iconOnly) toggle.createSpan({ text: 'Auto' });
  } else if (opts.themeMode === 'dark') {
    toggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    if (!iconOnly) toggle.createSpan({ text: 'Dark' });
  } else {
    toggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
    if (!iconOnly) toggle.createSpan({ text: 'Light' });
  }
}

/* ── SVG helper ──────────────────────────────────── */

function createSvgIcon(pathData: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('stroke-linecap', 'round');

  const segments = pathData.split(/(?=M)/);
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', trimmed);
    svg.appendChild(path);
  }

  return svg;
}
