import { MarkdownRenderer, Component, setTooltip } from 'obsidian';
import { TagTreeNode, CardEntry } from '../../store/GrindstoneStore';
import { TabContext } from './types';
import { today as formatToday } from '../../util/date';
import { matchesAnyPrefix } from '../../util/tag-match';

type SortField = 'front' | 'ef' | 'due';
type SortDir = 'asc' | 'desc';

export function renderTags(container: HTMLElement, ctx: TabContext, initialTag?: string): void {
  const selectedTags = new Set<string>(initialTag ? [initialTag] : []);
  let search = '';
  const expanded: Record<string, boolean> = {};
  let sortField: SortField = 'ef';
  let sortDir: SortDir = 'asc';

  const tree = ctx.store.getTagTree();
  // Auto-expand top-level
  for (const node of tree) expanded[node.path] = true;

  // Collect flat tag list for picker
  const allTagPaths: string[] = [];
  const collectTags = (nodes: TagTreeNode[]) => {
    for (const n of nodes) { allTagPaths.push(n.path); collectTags(n.children); }
  };
  collectTags(tree);

  // ── Page Head ──
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  headL.createDiv({ cls: 'gs-pagehead-eyebrow gs-en', text: 'WORKSPACE · TAGS' });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: '标签' });

  const headR = head.createDiv({ cls: 'gs-pagehead-r' });
  const tagCountPill = headR.createSpan({ cls: 'gs-pill' });
  const matchPill = headR.createSpan({ cls: 'gs-pill gs-pill-green' });

  const searchBox = headR.createDiv({ cls: 'tg-search' });
  searchBox.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`;
  const searchInput = searchBox.createEl('input', { placeholder: '搜索卡片...' });
  searchInput.addEventListener('input', () => { search = searchInput.value; renderFilterBar(); renderMain(); });

  // ── Page Body (tree + main) ──
  const page = container.createDiv({ cls: 'tg-page' });
  const treeSidebar = page.createEl('aside', { cls: 'tg-tree' });
  const main = page.createEl('section', { cls: 'tg-main' });

  // ── Tag selection helpers ──
  const toggleTag = (tag: string, multi: boolean) => {
    if (multi) {
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else {
        // Remove sibling/parent/child tags (same dimension) before adding
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
    renderTree();
    renderFilterBar();
    renderMain();
  };

  // ── Filter Condition Bar ──
  const filterBarEl = main.createDiv({ cls: 'tg-filter-bar' });

  const renderFilterBar = () => {
    filterBarEl.empty();
    const hasFilters = selectedTags.size > 0 || search.length > 0;
    if (!hasFilters) {
      filterBarEl.style.display = 'none';
      return;
    }
    filterBarEl.style.display = '';

    // Wrap tags in parens when both tags and search are present
    const needParens = selectedTags.size > 1 && search.length > 0;

    if (needParens) filterBarEl.createSpan({ cls: 'tg-filter-paren gs-en', text: '(' });

    // Selected tag chips
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

      // Show AND separator between tags
      if ([...selectedTags].indexOf(tag) < selectedTags.size - 1) {
        filterBarEl.createSpan({ cls: 'tg-filter-and gs-en', text: 'AND' });
      }
    }

    if (needParens) filterBarEl.createSpan({ cls: 'tg-filter-paren gs-en', text: ')' });

    // Search keyword chip
    if (search.length > 0) {
      if (selectedTags.size > 0) {
        filterBarEl.createSpan({ cls: 'tg-filter-and gs-en', text: 'AND' });
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

    // Tag picker (+) button
    const addBtn = filterBarEl.createEl('button', { cls: 'tg-filter-add' });
    addBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 1v8M1 5h8"/></svg>`;
    addBtn.title = '添加标签筛选';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTagPicker(addBtn);
    });

    // Accuracy pill (when exactly 1 tag selected)
    if (selectedTags.size === 1) {
      const tag = [...selectedTags][0];
      const acc = ctx.store.getAccuracyForTag(tag);
      if (acc !== null) {
        const pill = filterBarEl.createSpan({ cls: 'tg-bc-pill' });
        const tone = acc >= 85 ? 'green' : acc >= 70 ? 'gold' : 'clay';
        pill.createSpan({ cls: `tg-bc-acc tg-bc-acc-${tone}`, text: `准确率 ${acc}%` });
      }
    }

    // Clear all button
    if (selectedTags.size > 1 || (selectedTags.size > 0 && search.length > 0)) {
      const clearBtn = filterBarEl.createEl('button', { cls: 'tg-filter-clear gs-en', text: 'CLEAR' });
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

    const pickerInput = pickerEl.createEl('input', { cls: 'tg-picker-input', placeholder: '搜索标签...' });
    const pickerList = pickerEl.createDiv({ cls: 'tg-picker-list' });

    const renderPickerList = (query: string) => {
      pickerList.empty();
      const q = query.toLowerCase();
      const matches = allTagPaths.filter((t) => {
        if (selectedTags.has(t)) return false; // hide already selected
        return q === '' || t.toLowerCase().includes(q);
      });
      if (matches.length === 0) {
        pickerList.createDiv({ cls: 'tg-picker-empty', text: '无匹配标签' });
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
    treeSidebar.createDiv({ cls: 'tg-tree-head' }).innerHTML = `<span class="gs-en">TAG TREE</span>`;

    // "All cards" row
    const allRow = treeSidebar.createDiv({ cls: `tg-tree-row tg-tree-all${selectedTags.size === 0 ? ' tg-tree-row-on' : ''}` });
    allRow.style.paddingLeft = '8px';
    const allIcon = allRow.createSpan({ cls: 'tg-tree-all-icon' });
    allIcon.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
    const allNameBtn = allRow.createDiv({ cls: 'tg-tree-namebtn' });
    allNameBtn.createSpan({ cls: 'tg-tree-name', text: '全部卡片' });
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

    // Name button — normal click replaces, Cmd/Ctrl+click toggles
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
    // Preserve the filter bar, clear everything else
    while (main.children.length > 1) main.removeChild(main.lastChild!);

    const cards = sortCards(ctx.store.getCardsByTags(selectedTags, search || undefined), sortField, sortDir);

    tagCountPill.textContent = `${tree.length} 个标签`;
    matchPill.textContent = `${cards.length} 张匹配`;

    // autoShow detection
    const autoShowTags = ctx.store.getSettings().autoShowTags;
    const isAutoShowTag = selectedTags.size === 1
      && matchesAnyPrefix([...selectedTags][0], autoShowTags, true);
    let expandAll = false;
    const openRows = new Set<string>();

    // Expand-all toggle (for autoShow tags) — inject into filter bar
    if (isAutoShowTag) {
      const toggleBtn = filterBarEl.createEl('button', { cls: 'gs-pill tg-bc-toggle', text: '全部展开' });
      filterBarEl.style.display = ''; // ensure visible even if no other filters
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

    // Table
    const table = main.createDiv({ cls: 'tg-table' });

    // Table head
    const headRow = table.createDiv({ cls: 'tg-row tg-row-head gs-en' });
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
    makeSortHead('tg-c-front', 'front', 'QUESTION');
    headRow.createSpan({ cls: 'tg-c-tags', text: 'TAGS' });
    makeSortHead('tg-c-ef', 'ef', 'EF');
    makeSortHead('tg-c-due', 'due', 'DUE');

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
      table.style.paddingBottom = '';
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
        const selectTag = (tag: string, e: MouseEvent) => {
          toggleTag(tag, e.metaKey || e.ctrlKey);
        };
        const { row, loadPromise } = renderCardRow(table, entry, openRows, expandAll, renderCards, selectTag, ctx);
        if (loadPromise) loadPromises.push(loadPromise);
        if (scrollTo === entry.id) scrollRow = row;
      }
      if (scrollRow) {
        Promise.all(loadPromises).then(() => {
          requestAnimationFrame(() => scrollRowToOffset(scrollRow!, 50));
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
  renderFilterBar();
  renderMain();
}

function renderCardRow(
  parent: HTMLElement, entry: CardEntry,
  openRows: Set<string>, expandAll: boolean, rerender: (scrollTo?: string) => void,
  onSelectTag: (tag: string, e: MouseEvent) => void, ctx: TabContext,
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
  setTooltip(frontText, card.blockTitle);
  MarkdownRenderer.render(ctx.app, card.blockTitle, frontText, card.file, new Component());

  // Tags
  const tagsDiv = mainDiv.createSpan({ cls: 'tg-c-tags' });
  for (const tag of card.tags) {
    const chip = tagsDiv.createEl('button', { cls: 'tg-tag-chip' });
    chip.textContent = (tag.split('/').pop() || '').replace(/^#/, '');
    chip.title = tag;
    chip.addEventListener('click', (e) => { e.stopPropagation(); onSelectTag(tag, e); });
  }

  // EF, Due
  mainDiv.createSpan({ cls: 'tg-c-ef gs-mono', text: card.ease.toFixed(2) });
  mainDiv.createSpan({ cls: `tg-c-due gs-mono tg-due-${dueTone}`, text: dueLabel });

  // Expanded content
  if (isOpen) {
    const back = row.createDiv({ cls: 'tg-row-back' });
    back.createDiv({ cls: 'tg-back-l gs-en', text: 'ANSWER' });
    const answerEl = back.createDiv({ cls: 'tg-back-answer' });
    loadPromise = ctx.cardManager.getBlockContent(card, id).then((content) => {
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

  // Overscroll padding: ensure the row can reach `topOffset` from container top
  // even when it sits near the bottom of the content.
  const needed = Math.max(0, scroller.clientHeight - topOffset - row.offsetHeight);
  scroller.style.paddingBottom = `${needed}px`;

  const rowTop = row.getBoundingClientRect().top;
  const containerTop = scroller.getBoundingClientRect().top;
  const diff = rowTop - containerTop - topOffset;
  scroller.scrollBy({ top: diff, behavior: 'smooth' });
}

function formatDue(due: string): string {
  const today = formatToday();
  if (due === today) return '今天';
  if (due < today) return '逾期';
  const d1 = new Date(today), d2 = new Date(due);
  const days = Math.round((d2.getTime() - d1.getTime()) / 86400000);
  return `+${days}d`;
}
