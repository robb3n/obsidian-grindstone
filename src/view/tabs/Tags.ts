import { MarkdownRenderer, Component } from 'obsidian';
import { TagTreeNode, CardEntry } from '../../store/GrindstoneStore';
import { TabContext } from './types';

export function renderTags(container: HTMLElement, ctx: TabContext): void {
  let selected: string | null = null;
  let search = '';
  const expanded: Record<string, boolean> = {};

  const tree = ctx.store.getTagTree();
  // Auto-expand top-level
  for (const node of tree) expanded[node.path] = true;

  // ── Page Head ──
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  headL.createDiv({ cls: 'gs-pagehead-eyebrow gs-en', text: 'WORKSPACE \u00B7 TAGS' });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: '标签' });

  const headR = head.createDiv({ cls: 'gs-pagehead-r' });
  const tagCountPill = headR.createSpan({ cls: 'gs-pill' });
  const matchPill = headR.createSpan({ cls: 'gs-pill gs-pill-green' });

  const searchBox = headR.createDiv({ cls: 'tg-search' });
  searchBox.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`;
  const searchInput = searchBox.createEl('input', { placeholder: '搜索卡片...' });
  searchInput.addEventListener('input', () => { search = searchInput.value; renderMain(); });

  // ── Page Body (tree + main) ──
  const page = container.createDiv({ cls: 'tg-page' });
  const treeSidebar = page.createEl('aside', { cls: 'tg-tree' });
  const main = page.createEl('section', { cls: 'tg-main' });

  const renderTree = () => {
    treeSidebar.empty();
    treeSidebar.createDiv({ cls: 'tg-tree-head' }).innerHTML = `<span class="gs-en">TAG TREE</span><span class="tg-tree-total gs-en">${ctx.store.getTotalActiveCards()}</span>`;

    for (const node of tree) {
      renderTreeNode(treeSidebar, node, 0);
    }
  };

  const renderTreeNode = (parent: HTMLElement, node: TagTreeNode, level: number) => {
    const has = node.children.length > 0;
    const isOpen = expanded[node.path] ?? false;
    const isSel = selected === node.path;

    const row = parent.createDiv({ cls: `tg-tree-row${isSel ? ' tg-tree-row-on' : ''}` });
    row.style.paddingLeft = `${8 + level * 14}px`;

    // Caret
    const caret = row.createEl('button', { cls: 'tg-tree-caret' });
    if (has) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '9'); svg.setAttribute('height', '9'); svg.setAttribute('viewBox', '0 0 10 10');
      if (isOpen) svg.style.transform = 'rotate(90deg)';
      svg.style.transition = 'transform .15s';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 1l4 4-4 4'); path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6');
      path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path); caret.appendChild(svg);
      caret.addEventListener('click', (e) => { e.stopPropagation(); expanded[node.path] = !expanded[node.path]; renderTree(); });
    } else {
      caret.createSpan({ cls: 'tg-tree-bullet' });
    }

    // Name button
    const nameBtn = row.createEl('button', { cls: 'tg-tree-namebtn' });
    nameBtn.createSpan({ cls: 'tg-tree-name', text: node.name.replace(/^#/, '') });
    nameBtn.createSpan({ cls: 'tg-tree-n gs-mono', text: String(node.count) });
    nameBtn.addEventListener('click', () => { selected = node.path; renderTree(); renderMain(); });

    if (has && isOpen) {
      for (const child of node.children) renderTreeNode(parent, child, level + 1);
    }
  };

  const renderMain = () => {
    main.empty();
    const cards = ctx.store.getCardsByTag(selected, search);

    tagCountPill.textContent = `${tree.length} 个标签`;
    matchPill.textContent = `${cards.length} 张匹配`;

    // autoShow detection
    const autoShowTags = ctx.store.getRawStore().getSettings().autoShowTags;
    const sel = selected;
    const isAutoShowTag = sel !== null && autoShowTags.some((ast: string) =>
      sel === ast || sel.startsWith(ast + '/') || ast.startsWith(sel + '/'),
    );
    let expandAll = false;
    const openRows = new Set<string>();

    // Breadcrumb
    if (selected) {
      const bc = main.createDiv({ cls: 'tg-breadcrumb' });
      const segs = selected.split('/');
      for (let i = 0; i < segs.length; i++) {
        if (i > 0) bc.createSpan({ cls: 'tg-bc-sep', text: '/' });
        const segBtn = bc.createEl('button', { cls: 'tg-bc-seg', text: segs[i].replace(/^#/, '') });
        const path = segs.slice(0, i + 1).join('/');
        segBtn.addEventListener('click', () => { selected = path; renderTree(); renderMain(); });
      }
      const acc = ctx.store.getAccuracyForTag(selected);
      if (acc !== null) {
        const pill = bc.createSpan({ cls: 'tg-bc-pill' });
        const tone = acc >= 85 ? 'green' : acc >= 70 ? 'gold' : 'clay';
        pill.createSpan({ cls: `tg-bc-acc tg-bc-acc-${tone}`, text: `准确率 ${acc}%` });
      }
      if (isAutoShowTag) {
        const toggleBtn = bc.createEl('button', { cls: 'gs-pill tg-bc-toggle', text: '全部展开' });
        toggleBtn.addEventListener('click', () => {
          expandAll = !expandAll;
          toggleBtn.textContent = expandAll ? '逐张查看' : '全部展开';
          toggleBtn.classList.toggle('gs-pill-green', expandAll);
          if (expandAll) {
            cards.forEach(c => openRows.add(c.id));
          } else {
            openRows.clear();
          }
          renderCards();
        });
      }
    }

    // Table
    const table = main.createDiv({ cls: 'tg-table' });

    // Table head
    const headRow = table.createDiv({ cls: 'tg-row tg-row-head gs-en' });
    headRow.createSpan({ cls: 'tg-c-front', text: 'QUESTION' });
    headRow.createSpan({ cls: 'tg-c-tags', text: 'TAGS' });
    headRow.createSpan({ cls: 'tg-c-int', text: 'INTERVAL' });
    headRow.createSpan({ cls: 'tg-c-ef', text: 'EF' });
    headRow.createSpan({ cls: 'tg-c-due', text: 'DUE' });
    headRow.createSpan({ cls: 'tg-c-act' });

    if (cards.length === 0) {
      const empty = table.createDiv({ cls: 'tg-empty' });
      empty.createDiv({ cls: 'tg-empty-zh', text: '没有找到匹配的卡片' });
      empty.createDiv({ cls: 'tg-empty-en gs-en', text: 'NO CARDS MATCH' });
      return;
    }

    // Render card rows with load-more for large sets
    const BATCH = 200;
    let shown = 0;

    const renderCards = (scrollTo?: string) => {
      while (table.children.length > 1) table.removeChild(table.lastChild!);

      if (cards.length > BATCH) {
        const hint = table.createDiv({ cls: 'tg-load-hint gs-en' });
        hint.textContent = `Showing ${Math.min(shown + BATCH, cards.length)} / ${cards.length} cards`;
      }

      const slice = cards.slice(0, shown + BATCH);
      shown = slice.length;
      const loadPromises: Promise<void>[] = [];
      let scrollRow: HTMLElement | null = null;
      for (const entry of slice) {
        const selectTag = (tag: string) => { selected = tag; renderTree(); renderMain(); };
        const { row, loadPromise } = renderCardRow(table, entry, openRows, expandAll, renderCards, selectTag, ctx);
        if (loadPromise) loadPromises.push(loadPromise);
        if (scrollTo === entry.id) scrollRow = row;
      }
      if (scrollRow) {
        Promise.all(loadPromises).then(() => {
          requestAnimationFrame(() => scrollRow!.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        });
      }

      if (shown < cards.length) {
        const more = table.createEl('button', { cls: 'tg-load-more', text: `加载更多 (${cards.length - shown} 剩余)` });
        more.addEventListener('click', () => renderCards());
      }
    };
    renderCards();
  };

  renderTree();
  renderMain();
}

function renderCardRow(
  parent: HTMLElement, entry: CardEntry,
  openRows: Set<string>, expandAll: boolean, rerender: (scrollTo?: string) => void,
  onSelectTag: (tag: string) => void, ctx: TabContext,
): { row: HTMLElement; loadPromise: Promise<void> | null } {
  const { id, card } = entry;
  const isOpen = openRows.has(id);
  const dueLabel = formatDue(card.due);
  const dueTone = card.due <= formatToday() ? 'clay' : 'mute';

  const row = parent.createDiv({ cls: `tg-row${isOpen ? ' tg-row-open' : ''}` });
  let loadPromise: Promise<void> | null = null;

  // Make the main grid clickable
  const mainDiv = row.createDiv({ cls: 'tg-row-main' });
  mainDiv.addEventListener('click', () => {
    if (expandAll) return; // In expand-all mode, clicks don't toggle
    if (openRows.has(id)) {
      openRows.delete(id);
      rerender();
    } else {
      openRows.clear();
      openRows.add(id);
      rerender(id);
    }
  });

  // Question
  const front = mainDiv.createSpan({ cls: 'tg-c-front' });
  const caretMini = front.createSpan({ cls: 'tg-caret-mini' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '9'); svg.setAttribute('height', '9'); svg.setAttribute('viewBox', '0 0 10 10');
  if (isOpen) svg.style.transform = 'rotate(90deg)';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3 1l4 4-4 4'); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path); caretMini.appendChild(svg);
  const frontText = front.createSpan({ cls: 'tg-front-text' });
  MarkdownRenderer.render(ctx.app, card.blockTitle, frontText, card.file, new Component());

  // Tags
  const tagsDiv = mainDiv.createSpan({ cls: 'tg-c-tags' });
  for (const tag of card.tags) {
    const chip = tagsDiv.createEl('button', { cls: 'tg-tag-chip' });
    chip.textContent = (tag.split('/').pop() || '').replace(/^#/, '');
    chip.title = tag;
    chip.addEventListener('click', (e) => { e.stopPropagation(); onSelectTag(tag); });
  }

  // Interval, EF, Due
  mainDiv.createSpan({ cls: 'tg-c-int gs-mono', text: `${card.interval}d` });
  mainDiv.createSpan({ cls: 'tg-c-ef gs-mono', text: card.ease.toFixed(2) });
  mainDiv.createSpan({ cls: `tg-c-due gs-mono tg-due-${dueTone}`, text: dueLabel });

  // Actions
  const act = mainDiv.createSpan({ cls: 'tg-c-act' });
  const moreBtn = act.createEl('button', { cls: 'gs-iconbtn' });
  moreBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>`;
  moreBtn.addEventListener('click', (e) => e.stopPropagation());

  // Expanded content
  if (isOpen) {
    const back = row.createDiv({ cls: 'tg-row-back' });
    back.createDiv({ cls: 'tg-back-l gs-en', text: 'ANSWER' });
    const answerEl = back.createDiv({ cls: 'tg-back-answer' });
    loadPromise = ctx.cardManager.getBlockContent(card).then((content) => {
      if (content) {
        MarkdownRenderer.render(ctx.app, content, answerEl, card.file, new Component());
      } else {
        answerEl.createSpan({ cls: 'gs-placeholder', text: '无内容' });
      }
    });
    const meta = back.createDiv({ cls: 'tg-back-meta' });
    meta.innerHTML = `<span class="gs-en">ID</span> <code>${id}</code> <span class="gs-en">REPS</span> <span class="gs-mono">${card.reviewCount}</span> <span class="gs-en">DUE</span> <span class="gs-mono">${card.due}</span> <span class="gs-en">FILE</span> <span class="gs-mono">${card.file}</span>`;
  }
  return { row, loadPromise };
}

function formatToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDue(due: string): string {
  const today = formatToday();
  if (due === today) return '今天';
  if (due < today) return '逾期';
  const d1 = new Date(today), d2 = new Date(due);
  const days = Math.round((d2.getTime() - d1.getTime()) / 86400000);
  return `+${days}d`;
}
