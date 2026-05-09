import { DeckNode } from '../../store/GrindstoneStore';
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
  const page = container.createDiv({ cls: 'gs-page dk-page' });

  // Table header
  const tableHead = page.createDiv({ cls: 'dk-tableHead' });
  tableHead.createSpan({ cls: 'dk-col-name gs-en', text: 'DECK' });
  tableHead.createSpan({ cls: 'dk-col-mode gs-en', text: 'MODE' });
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

  // Mode column
  const modeCol = row.createDiv({ cls: 'dk-col-mode' });
  if (level === 0) {
    const badge = modeCol.createSpan({ cls: 'dk-mode-badge' });
    badge.style.color = 'var(--gs-green)';
    badge.style.borderColor = 'var(--gs-green)';
    badge.createSpan({ cls: 'dk-mode-zh', text: '自动' });
    badge.createSpan({ cls: 'dk-mode-en gs-en', text: 'AUTO' });
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
