import { MarkdownRenderer, Component, setTooltip } from 'obsidian';
import { TagTreeNode, CardEntry } from '../../store/GrindstoneStore';
import { TabContext } from './types';
import { today as formatToday } from '../../util/date';
import { matchesAnyPrefix } from '../../util/tag-match';
import { t, StringKey } from '../../i18n';

type SortField = 'front' | 'ef' | 'due';
type SortDir = 'asc' | 'desc';
type Maturity = 'all' | 'new' | 'learning' | 'mature';

const MATURITY_SEG: Array<{ id: Maturity; labelKey: StringKey }> = [
  { id: 'all',      labelKey: 'tags.mat.all' },
  { id: 'new',      labelKey: 'tags.mat.new' },
  { id: 'learning', labelKey: 'tags.mat.learning' },
  { id: 'mature',   labelKey: 'tags.mat.mature' },
];

const MATURITY_CHIP_KEY: Record<Exclude<Maturity, 'all'>, StringKey> = {
  new:      'tags.chip.new',
  learning: 'tags.chip.learning',
  mature:   'tags.chip.mature',
};

function classifyMaturity(card: { reviewCount: number; interval: number }): Exclude<Maturity, 'all'> {
  if (card.reviewCount === 0) return 'new';
  if (card.interval < 21) return 'learning';
  return 'mature';
}

export function renderTags(container: HTMLElement, ctx: TabContext, initialTag?: string): () => void {
  const component = new Component();
  component.load();

  const selectedTags = new Set<string>(initialTag ? [initialTag] : []);
  let search = '';
  let maturity: Maturity = 'all';
  const expanded: Record<string, boolean> = {};
  let sortField: SortField = 'ef';
  let sortDir: SortDir = 'asc';

  const tree = ctx.store.getTagTree();
  for (const node of tree) expanded[node.path] = true;

  const allTagPaths: string[] = [];
  const collectTags = (nodes: TagTreeNode[]) => {
    for (const n of nodes) { allTagPaths.push(n.path); collectTags(n.children); }
  };
  collectTags(tree);

  // ── Page Head ──
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: t('tags.title') });

  const headR = head.createDiv({ cls: 'gs-pagehead-r' });
  const tagCountPill = headR.createSpan({ cls: 'gs-pill' });
  const matchPill = headR.createSpan({ cls: 'gs-pill gs-pill-green' });

  const searchBox = headR.createDiv({ cls: 'tg-search' });
  searchBox.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`;
  const searchInput = searchBox.createEl('input', { placeholder: t('tags.search_placeholder') });
  searchInput.addEventListener('input', () => { search = searchInput.value; renderFilterBar(); renderMain(); });

  // Maturity segmented control
  const matSeg = headR.createDiv({ cls: 'tg-mat-seg' });
  const renderMatSeg = () => {
    matSeg.empty();
    for (const s of MATURITY_SEG) {
      const btn = matSeg.createEl('button', { cls: `tg-mat-tab${maturity === s.id ? ' tg-mat-tab-on' : ''}` });
      btn.textContent = t(s.labelKey);
      btn.addEventListener('click', () => {
        if (maturity === s.id) return;
        maturity = s.id;
        renderMatSeg();
        renderFilterBar();
        renderMain();
      });
    }
  };

  // ── Page Body (tree + main) ──
  const page = container.createDiv({ cls: 'tg-page' });
  const treeSidebar = page.createEl('aside', { cls: 'tg-tree' });
  const main = page.createEl('section', { cls: 'tg-main' });

  const toggleTag = (tag: string, multi: boolean) => {
    if (multi) {
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else {
        const topLevel = tag.split('/')[0];
        for (const t of [...selectedTags]) {
          if (t.split('/')[0] === topLevel) selectedTags.delete(t);
        }
        selectedTags.add(tag);
      }
    } else {
      selectedTags.clear();
      selectedTags.add(tag);
    }
    renderTree();
    renderFilterBar();
    renderMain();
  };

  const clearAll = () => {
    selectedTags.clear();
    maturity = 'all';
    renderMatSeg();
    renderTree();
    renderFilterBar();
    renderMain();
  };

  // ── Filter Condition Bar ──
  const filterBarEl = main.createDiv({ cls: 'tg-filter-bar' });

  const renderFilterBar = () => {
    filterBarEl.empty();
    const hasFilters = selectedTags.size > 0 || search.length > 0 || maturity !== 'all';
    if (!hasFilters) {
      filterBarEl.style.display = 'none';
      return;
    }
    filterBarEl.style.display = '';

    const needParens = selectedTags.size > 1 && search.length > 0;

    if (needParens) filterBarEl.createSpan({ cls: 'tg-filter-paren', text: '(' });

    for (const tag of selectedTags) {
      const chip = filterBarEl.createDiv({ cls: 'tg-filter-chip' });
      const label = '#' + (tag.split('/').pop()?.replace(/^#/, '') || tag);
      chip.createSpan({ cls: 'tg-filter-chip-label', text: label });
      chip.title = tag;
      const removeBtn = chip.createSpan({ cls: 'tg-filter-chip-x' });
      removeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>`;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedTags.delete(tag);
        renderTree();
        renderFilterBar();
        renderMain();
      });

      if ([...selectedTags].indexOf(tag) < selectedTags.size - 1) {
        filterBarEl.createSpan({ cls: 'tg-filter-and', text: t('tags.filter.and') });
      }
    }

    if (needParens) filterBarEl.createSpan({ cls: 'tg-filter-paren', text: ')' });

    if (search.length > 0) {
      if (selectedTags.size > 0) {
        filterBarEl.createSpan({ cls: 'tg-filter-and', text: t('tags.filter.and') });
      }
      const chip = filterBarEl.createDiv({ cls: 'tg-filter-chip tg-filter-chip-search' });
      chip.createSpan({ cls: 'tg-filter-chip-label', text: `"${search}"` });
      const removeBtn = chip.createSpan({ cls: 'tg-filter-chip-x' });
      removeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>`;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        search = '';
        searchInput.value = '';
        renderFilterBar();
        renderMain();
      });
    }

    if (maturity !== 'all') {
      if (selectedTags.size > 0 || search.length > 0) {
        filterBarEl.createSpan({ cls: 'tg-filter-and', text: t('tags.filter.and') });
      }
      const chip = filterBarEl.createDiv({ cls: `tg-filter-chip tg-filter-chip-maturity tg-filter-chip-mat-${maturity}` });
      chip.createSpan({ cls: 'tg-filter-chip-label', text: t(MATURITY_CHIP_KEY[maturity]) });
      const removeBtn = chip.createSpan({ cls: 'tg-filter-chip-x' });
      removeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>`;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        maturity = 'all';
        renderMatSeg();
        renderFilterBar();
        renderMain();
      });
    }

    const addBtn = filterBarEl.createEl('button', { cls: 'tg-filter-add' });
    addBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 1v8M1 5h8"/></svg>`;
    addBtn.title = t('tags.add_filter');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTagPicker(addBtn);
    });

    if (selectedTags.size === 1) {
      const tag = [...selectedTags][0];
      const acc = ctx.store.getAccuracyForTag(tag);
      if (acc !== null) {
        const pill = filterBarEl.createSpan({ cls: 'tg-bc-pill' });
        const tone = acc >= 85 ? 'green' : acc >= 70 ? 'gold' : 'clay';
        pill.createSpan({ cls: `tg-bc-acc tg-bc-acc-${tone}`, text: t('tags.accuracy_pill', { n: acc }) });
      }
    }

    const activeCount = selectedTags.size + (search.length > 0 ? 1 : 0) + (maturity !== 'all' ? 1 : 0);
    if (activeCount >= 2) {
      const clearBtn = filterBarEl.createEl('button', { cls: 'tg-filter-clear', text: t('tags.filter.clear') });
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        search = '';
        searchInput.value = '';
        clearAll();
      });
    }
  };

  // ── Tag Picker Dropdown ──
  let pickerEl: HTMLElement | null = null;

  const closeTagPicker = () => {
    if (pickerEl) { pickerEl.remove(); pickerEl = null; }
    document.removeEventListener('click', onDocClick);
  };

  const onDocClick = () => closeTagPicker();

  const openTagPicker = (anchor: HTMLElement) => {
    if (pickerEl) { closeTagPicker(); return; }

    pickerEl = filterBarEl.createDiv({ cls: 'tg-picker' });
    pickerEl.addEventListener('click', (e) => e.stopPropagation());

    const pickerInput = pickerEl.createEl('input', { cls: 'tg-picker-input', placeholder: t('tags.picker.placeholder') });
    const pickerList = pickerEl.createDiv({ cls: 'tg-picker-list' });

    const renderPickerList = (query: string) => {
      pickerList.empty();
      const q = query.toLowerCase();
      const matches = allTagPaths.filter((tag) => {
        if (selectedTags.has(tag)) return false;
        return q === '' || tag.toLowerCase().includes(q);
      });
      if (matches.length === 0) {
        pickerList.createDiv({ cls: 'tg-picker-empty', text: t('tags.picker.empty') });
        return;
      }
      for (const tag of matches.slice(0, 30)) {
        const item = pickerList.createDiv({ cls: 'tg-picker-item' });
        item.textContent = tag.replace(/^#/, '');
        item.addEventListener('click', () => {
          selectedTags.add(tag);
          closeTagPicker();
          renderTree();
          renderFilterBar();
          renderMain();
        });
      }
    };

    renderPickerList('');
    pickerInput.addEventListener('input', () => renderPickerList(pickerInput.value));
    setTimeout(() => {
      pickerInput.focus();
      document.addEventListener('click', onDocClick);
    }, 0);
  };

  // ── Tree ──
  const renderTree = () => {
    treeSidebar.empty();
    const head = treeSidebar.createDiv({ cls: 'tg-tree-head' });
    head.createSpan({ text: t('tags.tree_head') });

    const allRow = treeSidebar.createDiv({ cls: `tg-tree-row tg-tree-all${selectedTags.size === 0 ? ' tg-tree-row-on' : ''}` });
    allRow.style.paddingLeft = '8px';
    const allIcon = allRow.createSpan({ cls: 'tg-tree-all-icon' });
    allIcon.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
    const allNameBtn = allRow.createDiv({ cls: 'tg-tree-namebtn' });
    allNameBtn.createSpan({ cls: 'tg-tree-name', text: t('tags.all_cards') });
    allNameBtn.createSpan({ cls: 'tg-tree-n gs-mono', text: String(ctx.store.getTotalActiveCards()) });
    allNameBtn.addEventListener('click', () => clearAll());

    for (const node of tree) {
      renderTreeNode(treeSidebar, node, 0);
    }
  };

  const renderTreeNode = (parent: HTMLElement, node: TagTreeNode, level: number) => {
    const has = node.children.length > 0;
    const isOpen = expanded[node.path] ?? false;
    const isSel = selectedTags.has(node.path);

    const row = parent.createDiv({ cls: `tg-tree-row${isSel ? ' tg-tree-row-on' : ''}` });
    row.setAttribute('data-level', String(level));
    row.style.paddingLeft = `${8 + level * 14}px`;

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

    const nameBtn = row.createDiv({ cls: 'tg-tree-namebtn' });
    nameBtn.createSpan({ cls: 'tg-tree-name', text: node.name.replace(/^#/, '') });
    nameBtn.createSpan({ cls: 'tg-tree-n gs-mono', text: String(node.count) });
    nameBtn.addEventListener('click', (e) => {
      toggleTag(node.path, e.metaKey || e.ctrlKey);
    });

    if (has && isOpen) {
      for (const child of node.children) renderTreeNode(parent, child, level + 1);
    }
  };

  // ── Main content ──
  const renderMain = () => {
    while (main.children.length > 1) main.removeChild(main.lastChild!);

    let entries = ctx.store.getCardsByTags(selectedTags, search || undefined);
    if (maturity !== 'all') {
      entries = entries.filter((e) => classifyMaturity(e.card) === maturity);
    }
    const cards = sortCards(entries, sortField, sortDir);

    tagCountPill.textContent = t('tags.pill.count', { n: tree.length });
    matchPill.textContent = t('tags.pill.match', { n: cards.length });

    const autoShowTags = ctx.store.getSettings().autoShowTags;
    const isAutoShowTag = selectedTags.size === 1
      && matchesAnyPrefix([...selectedTags][0], autoShowTags, true);
    let expandAll = false;
    const openRows = new Set<string>();

    if (isAutoShowTag) {
      const toggleBtn = filterBarEl.createEl('button', { cls: 'gs-pill tg-bc-toggle', text: t('tags.expand_all') });
      filterBarEl.style.display = '';
      toggleBtn.addEventListener('click', () => {
        expandAll = !expandAll;
        toggleBtn.textContent = expandAll ? t('tags.collapse') : t('tags.expand_all');
        toggleBtn.classList.toggle('gs-pill-green', expandAll);
        if (expandAll) {
          cards.forEach(c => openRows.add(c.id));
        } else {
          openRows.clear();
        }
        renderCards();
      });
    }

    const table = main.createDiv({ cls: 'tg-table' });

    const headRow = table.createDiv({ cls: 'tg-row tg-row-head' });
    const makeSortHead = (cls: string, field: SortField, label: string) => {
      const isActive = sortField === field;
      const el = headRow.createSpan({ cls: `${cls} tg-c-head-sortable${isActive ? ' tg-c-head-active' : ''}` });
      el.createSpan({ cls: 'tg-c-head-label', text: label });
      if (isActive) {
        el.createSpan({ cls: 'tg-sort-arrow', text: sortDir === 'asc' ? '↑' : '↓' });
      }
      el.addEventListener('click', () => {
        if (sortField === field) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortField = field;
          sortDir = 'asc';
        }
        renderFilterBar();
        renderMain();
      });
    };
    makeSortHead('tg-c-front', 'front', t('tags.col.question'));
    headRow.createSpan({ cls: 'tg-c-tags', text: t('tags.col.tags') });
    makeSortHead('tg-c-ef', 'ef', t('tags.col.ef'));
    makeSortHead('tg-c-due', 'due', t('tags.col.due'));

    if (cards.length === 0) {
      const empty = table.createDiv({ cls: 'tg-empty' });
      empty.createDiv({ cls: 'tg-empty-zh', text: t('tags.empty.match') });
      return;
    }

    const BATCH = 200;
    let shown = 0;

    const renderCards = (scrollTo?: string) => {
      table.style.paddingBottom = '';
      while (table.children.length > 1) table.removeChild(table.lastChild!);

      if (cards.length > BATCH) {
        const hint = table.createDiv({ cls: 'tg-load-hint' });
        hint.textContent = t('tags.load_hint', { shown: Math.min(shown + BATCH, cards.length), total: cards.length });
      }

      const slice = cards.slice(0, shown + BATCH);
      shown = slice.length;
      const loadPromises: Promise<void>[] = [];
      let scrollRow: HTMLElement | null = null;
      for (const entry of slice) {
        const selectTag = (tag: string, e: MouseEvent) => {
          toggleTag(tag, e.metaKey || e.ctrlKey);
        };
        const { row, loadPromise } = renderCardRow(table, entry, openRows, expandAll, renderCards, selectTag, ctx, component);
        if (loadPromise) loadPromises.push(loadPromise);
        if (scrollTo === entry.id) scrollRow = row;
      }
      if (scrollRow) {
        Promise.all(loadPromises).then(() => {
          requestAnimationFrame(() => scrollRowToOffset(scrollRow!, 50));
        });
      }

      if (shown < cards.length) {
        const more = table.createEl('button', { cls: 'tg-load-more', text: t('tags.load_more', { n: cards.length - shown }) });
        more.addEventListener('click', () => renderCards());
      }
    };
    renderCards();
  };

  renderMatSeg();
  renderTree();
  renderFilterBar();
  renderMain();

  return () => component.unload();
}

function renderCardRow(
  parent: HTMLElement, entry: CardEntry,
  openRows: Set<string>, expandAll: boolean, rerender: (scrollTo?: string) => void,
  onSelectTag: (tag: string, e: MouseEvent) => void, ctx: TabContext,
  component: Component,
): { row: HTMLElement; loadPromise: Promise<void> | null } {
  const { id, card } = entry;
  const isOpen = openRows.has(id);
  const dueLabel = formatDue(card.due);
  const dueTone = card.due <= formatToday() ? 'clay' : 'mute';

  const row = parent.createDiv({ cls: `tg-row${isOpen ? ' tg-row-open' : ''}` });
  let loadPromise: Promise<void> | null = null;

  const mainDiv = row.createDiv({ cls: 'tg-row-main' });
  mainDiv.addEventListener('click', () => {
    if (expandAll) return;
    if (openRows.has(id)) {
      openRows.delete(id);
      rerender();
    } else {
      openRows.clear();
      openRows.add(id);
      rerender(id);
    }
  });

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
  setTooltip(frontText, card.blockTitle);
  MarkdownRenderer.render(ctx.app, card.blockTitle, frontText, card.file, component);

  const tagsDiv = mainDiv.createSpan({ cls: 'tg-c-tags' });
  for (const tag of card.tags) {
    const chip = tagsDiv.createEl('button', { cls: 'tg-tag-chip' });
    chip.textContent = (tag.split('/').pop() || '').replace(/^#/, '');
    chip.title = tag;
    chip.addEventListener('click', (e) => { e.stopPropagation(); onSelectTag(tag, e); });
  }

  mainDiv.createSpan({ cls: 'tg-c-ef gs-mono', text: card.ease.toFixed(2) });
  mainDiv.createSpan({ cls: `tg-c-due gs-mono tg-due-${dueTone}`, text: dueLabel });

  if (isOpen) {
    const back = row.createDiv({ cls: 'tg-row-back' });
    back.createDiv({ cls: 'tg-back-l', text: t('tags.row.answer') });
    const answerEl = back.createDiv({ cls: 'tg-back-answer' });
    loadPromise = ctx.cardManager.getBlockContent(card, id).then((content) => {
      if (!answerEl.isConnected) return;
      if (content) {
        MarkdownRenderer.render(ctx.app, content, answerEl, card.file, component);
      } else {
        answerEl.createSpan({ cls: 'gs-placeholder', text: t('tags.row.no_content') });
      }
    });
    const meta = back.createDiv({ cls: 'tg-back-meta' });
    meta.innerHTML = `<span class="tg-meta-l">${escapeHtml(t('tags.row.meta.id'))}</span> <code>${escapeHtml(id)}</code> <span class="tg-meta-l">${escapeHtml(t('tags.row.meta.reps'))}</span> <span class="gs-mono">${card.reviewCount}</span> <span class="tg-meta-l">${escapeHtml(t('tags.row.meta.due'))}</span> <span class="gs-mono">${escapeHtml(card.due)}</span> <span class="tg-meta-l">${escapeHtml(t('tags.row.meta.file'))}</span> <span class="gs-mono">${escapeHtml(card.file)}</span>`;
  }
  return { row, loadPromise };
}

function sortCards(cards: CardEntry[], field: SortField, dir: SortDir): CardEntry[] {
  const mul = dir === 'asc' ? 1 : -1;
  const cmp = (a: CardEntry, b: CardEntry): number => {
    switch (field) {
      case 'front':
        return a.card.blockTitle.toLowerCase().localeCompare(b.card.blockTitle.toLowerCase());
      case 'ef':
        return a.card.ease - b.card.ease;
      case 'due':
        return a.card.due < b.card.due ? -1 : a.card.due > b.card.due ? 1 : 0;
    }
  };
  return [...cards].sort((a, b) => cmp(a, b) * mul);
}

function scrollRowToOffset(row: HTMLElement, topOffset: number): void {
  let scroller: HTMLElement | null = row.parentElement;
  while (scroller) {
    const oy = getComputedStyle(scroller).overflowY;
    if (oy === 'auto' || oy === 'scroll') break;
    scroller = scroller.parentElement;
  }
  if (!scroller) return;

  const needed = Math.max(0, scroller.clientHeight - topOffset - row.offsetHeight);
  scroller.style.paddingBottom = `${needed}px`;

  const rowTop = row.getBoundingClientRect().top;
  const containerTop = scroller.getBoundingClientRect().top;
  const diff = rowTop - containerTop - topOffset;
  scroller.scrollBy({ top: diff, behavior: 'smooth' });
}

function formatDue(due: string): string {
  const today = formatToday();
  if (due === today) return t('common.due_today');
  if (due < today) return t('common.due_overdue');
  const d1 = new Date(today), d2 = new Date(due);
  const days = Math.round((d2.getTime() - d1.getTime()) / 86400000);
  return `+${days}d`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
