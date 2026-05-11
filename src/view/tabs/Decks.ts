import { App, Modal } from 'obsidian';
import { DeckNode, GrindstoneStore } from '../../store/GrindstoneStore';
import { BUILTIN_PRESETS, SrsPreset, DeckResetMode, SrsParams } from '../../card/types';
import { TabContext } from './types';

export function renderDecks(container: HTMLElement, ctx: TabContext): void {
  const tree = ctx.store.getDeckTree();
  const totalCards = tree.reduce((a, d) => a + d.count, 0);
  const totalDue = tree.reduce((a, d) => a + d.due, 0);

  // ── Page Head ──
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  headL.createDiv({ cls: 'gs-pagehead-eyebrow gs-en', text: 'WORKSPACE \u00B7 DECKS' });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: '卡组' });

  const headR = head.createDiv({ cls: 'gs-pagehead-r' });
  headR.createSpan({ cls: 'gs-pill', text: `${totalCards} 张` });
  headR.createSpan({ cls: 'gs-pill gs-pill-clay', text: `${totalDue} 待复习` });

  // ── Page Body ──
  renderDeckTable(container, ctx);
}

export function renderDeckTable(container: HTMLElement, ctx: TabContext): void {
  const tree = ctx.store.getDeckTree();
  const page = container.createDiv({ cls: 'gs-page dk-page' });

  // Table header
  const tableHead = page.createDiv({ cls: 'dk-tableHead' });
  tableHead.createSpan({ cls: 'dk-col-name gs-en', text: 'DECK' });
  tableHead.createSpan({ cls: 'dk-col-mode gs-en', text: 'STRATEGY' });
  tableHead.createSpan({ cls: 'dk-col-source gs-en', text: 'SOURCE' });
  tableHead.createSpan({ cls: 'dk-col-progress gs-en', text: 'PROGRESS' });
  tableHead.createSpan({ cls: 'dk-col-num gs-en', text: 'NEW' });
  tableHead.createSpan({ cls: 'dk-col-num gs-en', text: 'DUE' });
  tableHead.createSpan({ cls: 'dk-col-num gs-en', text: 'TOTAL' });
  tableHead.createSpan({ cls: 'dk-col-actions' });

  // Deck list
  const list = page.createDiv({ cls: 'dk-list' });
  const expanded: Record<string, boolean> = {};
  // Auto-expand top-level decks
  for (const deck of tree) {
    expanded[deck.id] = true;
  }

  const renderAll = () => {
    list.empty();
    if (tree.length === 0) {
      const empty = list.createDiv({ cls: 'dk-empty' });
      empty.createDiv({ cls: 'dk-empty-zh', text: '暂无卡组' });
      empty.createDiv({ cls: 'dk-empty-en gs-en', text: 'No decks yet. Add trigger tags to your notes.' });
      return;
    }
    for (const deck of tree) {
      renderDeckRow(list, deck, 0, expanded, renderAll, ctx);
    }
  };
  renderAll();
}

function renderDeckRow(
  parent: HTMLElement,
  deck: DeckNode,
  level: number,
  expanded: Record<string, boolean>,
  rerender: () => void,
  ctx: TabContext,
): void {
  const hasChildren = deck.children.length > 0;
  const isOpen = expanded[deck.id] ?? false;
  const progress = deck.count === 0 ? 0 : Math.round((1 - deck.due / deck.count) * 100);

  const row = parent.createDiv({ cls: `dk-row dk-level-${level}` });
  row.style.paddingLeft = `${12 + level * 22}px`;

  // Name column
  const nameCol = row.createDiv({ cls: 'dk-col-name' });

  // Caret
  const caret = nameCol.createEl('button', {
    cls: `dk-caret${hasChildren ? '' : ' dk-caret-blank'}`,
  });
  if (hasChildren) {
    const svg = createCaretSvg(isOpen);
    caret.appendChild(svg);
    caret.addEventListener('click', () => {
      expanded[deck.id] = !expanded[deck.id];
      rerender();
    });
  }

  // Icon
  const icon = nameCol.createSpan({ cls: 'dk-icon' });
  icon.style.color = 'var(--gs-green)';
  icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12L12 20l-9-9V3h8z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/></svg>`;

  // Name
  nameCol.createSpan({ cls: `dk-name dk-name-l${level}`, text: deck.name });

  // Updated (only top level)
  if (level === 0 && deck.lastReviewed) {
    nameCol.createSpan({ cls: 'dk-updated gs-mono', text: formatRelative(deck.lastReviewed) });
  }

  // Strategy column (top-level only)
  const modeCol = row.createDiv({ cls: 'dk-col-mode' });
  if (level === 0) {
    const stratName = deck.strategyName ?? '全局默认';
    const isOverridden = stratName !== '全局默认';
    const badge = modeCol.createEl('button', { cls: `dk-strategy-badge${isOverridden ? ' dk-strategy-override' : ''}` });
    badge.createSpan({ cls: 'dk-strategy-zh', text: stratName });
    badge.createSpan({ cls: 'dk-strategy-en gs-en', text: isOverridden ? 'CUSTOM' : 'DEFAULT' });
    badge.addEventListener('click', () => {
      showStrategyPicker(badge, deck.fullTag, ctx);
    });
  }

  // Source column
  const sourceCol = row.createDiv({ cls: 'dk-col-source' });
  sourceCol.createSpan({ cls: 'dk-source gs-mono dk-source-auto', text: `#${deck.fullTag}` });

  // Progress column
  const progCol = row.createDiv({ cls: 'dk-col-progress' });
  const bar = progCol.createDiv({ cls: 'dk-bar' });
  const barFill = bar.createDiv({ cls: 'dk-bar-fill' });
  barFill.style.width = `${progress}%`;
  progCol.createSpan({ cls: 'dk-bar-pct gs-mono', text: `${progress}%` });

  // NEW count
  row.createDiv({
    cls: `dk-col-num gs-mono ${deck.newCount > 0 ? 'dk-num-clay' : 'dk-num-mute'}`,
    text: String(deck.newCount),
  });

  // DUE count
  row.createDiv({
    cls: `dk-col-num gs-mono ${deck.due > 0 ? 'dk-num-green' : 'dk-num-mute'}`,
    text: String(deck.due),
  });

  // TOTAL count
  row.createDiv({ cls: 'dk-col-num gs-mono dk-num-total', text: String(deck.count) });

  // Actions column
  const actCol = row.createDiv({ cls: 'dk-col-actions' });
  if (deck.due > 0) {
    const reviewBtn = actCol.createEl('button', { cls: 'gs-btn dk-review-btn', text: '复习 →' });
    reviewBtn.addEventListener('click', () => ctx.startReviewModal(deck.fullTag));
  } else {
    actCol.createEl('button', { cls: 'dk-action-ghost', text: '浏览' });
  }

  // Children
  if (hasChildren && isOpen) {
    for (const child of deck.children) {
      renderDeckRow(parent, child, level + 1, expanded, rerender, ctx);
    }
  }
}

// ── Strategy Picker ──

function showStrategyPicker(anchor: HTMLElement, deckTag: string, ctx: TabContext): void {
  // Remove any existing picker
  document.querySelector('.dk-strategy-picker')?.remove();

  const settings = ctx.store.getRawStore().getSettings();
  const overrides = settings.deckSrsOverrides ?? {};
  const currentValue = overrides[deckTag] ?? null;
  const currentPresetId = typeof currentValue === 'string' ? currentValue : null;

  const allPresets: Array<{ id: string | null; name: string; nameEn: string }> = [
    { id: null, name: '全局默认', nameEn: 'GLOBAL DEFAULT' },
    ...BUILTIN_PRESETS.map(p => ({ id: p.id, name: p.name, nameEn: p.nameEn })),
    ...(settings.customPresets ?? []).map(p => ({ id: p.id, name: p.name, nameEn: p.nameEn })),
  ];

  // Position picker below anchor
  const rect = anchor.getBoundingClientRect();
  const picker = document.body.createDiv({ cls: 'dk-strategy-picker' });
  picker.style.top = `${rect.bottom + 4}px`;
  picker.style.left = `${rect.left}px`;

  for (const preset of allPresets) {
    const isActive = preset.id === null
      ? currentValue === null
      : preset.id === currentPresetId;

    const opt = picker.createDiv({
      cls: `dk-strategy-option${isActive ? ' dk-strategy-option-active' : ''}`,
    });
    opt.createSpan({ text: preset.name });
    opt.createSpan({ cls: 'gs-en', text: preset.nameEn });

    opt.addEventListener('click', async () => {
      closePicker();
      if (isActive) return;

      // Resolve new params
      const newValue = preset.id;
      const newPresets = [...BUILTIN_PRESETS, ...(settings.customPresets ?? [])];
      const resolvedParams = newValue
        ? newPresets.find(p => p.id === newValue)?.params ?? ctx.store.getSrsParams()
        : ctx.store.getSrsParams();

      // Show reset confirmation
      new DeckResetConfirmModal(
        ctx.app,
        deckTag,
        preset.name,
        resolvedParams,
        ctx.store,
      ).open();
    });
  }

  // Close on outside click
  const onOutside = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node) && e.target !== anchor) {
      closePicker();
    }
  };
  setTimeout(() => document.addEventListener('click', onOutside), 0);

  function closePicker() {
    picker.remove();
    document.removeEventListener('click', onOutside);
  }
}

// ── Reset Confirmation Modal ──

class DeckResetConfirmModal extends Modal {
  private deckTag: string;
  private strategyName: string;
  private newParams: SrsParams;
  private gsStore: GrindstoneStore;
  private selectedMode: DeckResetMode = 'gradual';

  constructor(
    app: App,
    deckTag: string,
    strategyName: string,
    newParams: SrsParams,
    gsStore: GrindstoneStore,
  ) {
    super(app);
    this.deckTag = deckTag;
    this.strategyName = strategyName;
    this.newParams = newParams;
    this.gsStore = gsStore;
  }

  onOpen(): void {
    this.modalEl.addClass('dk-reset-modal');
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: `切换策略: ${this.strategyName}` });
    contentEl.createDiv({
      cls: 'dk-reset-desc',
      text: `将 #${this.deckTag} 卡组的复习策略切换为「${this.strategyName}」。选择如何处理已有卡片：`,
    });

    const options: Array<{ mode: DeckResetMode; zh: string; en: string; desc: string; warning?: string }> = [
      {
        mode: 'gradual',
        zh: '渐进过渡',
        en: 'GRADUAL',
        desc: '仅后续复习使用新参数，已有卡片自然适应',
      },
      {
        mode: 'reset-ease',
        zh: '重置 Ease',
        en: 'RESET EASE',
        desc: `卡组内所有卡片的 Ease 重置为 ${this.newParams.initialEase}，保留间隔和进度`,
      },
      {
        mode: 'full-reset',
        zh: '完全重置',
        en: 'FULL RESET',
        desc: '卡片的 Ease、间隔、进度全部归零，相当于从头开始',
        warning: '此操作不可逆，所有复习进度将丢失',
      },
    ];

    const optionsWrap = contentEl.createDiv({ cls: 'dk-reset-options' });
    for (const opt of options) {
      const el = optionsWrap.createDiv({
        cls: `dk-reset-option${opt.mode === this.selectedMode ? ' dk-reset-option-active' : ''}`,
      });
      const header = el.createDiv({ cls: 'dk-reset-option-h' });
      const radio = header.createSpan({ cls: 'dk-reset-radio' });
      if (opt.mode === this.selectedMode) radio.addClass('dk-reset-radio-on');
      header.createSpan({ cls: 'dk-reset-option-zh', text: opt.zh });
      header.createSpan({ cls: 'dk-reset-option-en gs-en', text: opt.en });
      el.createDiv({ cls: 'dk-reset-option-desc', text: opt.desc });
      if (opt.warning) {
        el.createDiv({ cls: 'dk-reset-warning', text: `\u26A0 ${opt.warning}` });
      }

      el.addEventListener('click', () => {
        this.selectedMode = opt.mode;
        optionsWrap.querySelectorAll('.dk-reset-option').forEach(e => e.removeClass('dk-reset-option-active'));
        optionsWrap.querySelectorAll('.dk-reset-radio').forEach(e => e.removeClass('dk-reset-radio-on'));
        el.addClass('dk-reset-option-active');
        radio.addClass('dk-reset-radio-on');
      });
    }

    const actions = contentEl.createDiv({ cls: 'dk-reset-actions' });
    const cancelBtn = actions.createEl('button', { cls: 'gs-btn', text: '取消' });
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '确认切换' });
    confirmBtn.addEventListener('click', async () => {
      // Set strategy: null for global default, presetId for preset
      const presetValue = this.strategyName === '全局默认' ? null : this.findPresetId();
      await this.gsStore.setDeckStrategy(this.deckTag, presetValue);
      await this.gsStore.resetDeckCards(this.deckTag, this.selectedMode, this.newParams);
      this.close();
    });
  }

  private findPresetId(): string | null {
    const allPresets: SrsPreset[] = [
      ...BUILTIN_PRESETS,
      ...(this.gsStore.getRawStore().getSettings().customPresets ?? []),
    ];
    return allPresets.find(p => p.name === this.strategyName)?.id ?? null;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ── Helpers ──

function createCaretSvg(isOpen: boolean): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  svg.setAttribute('viewBox', '0 0 10 10');
  if (isOpen) svg.style.transform = 'rotate(90deg)';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3 1l4 4-4 4');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  return dateStr;
}
