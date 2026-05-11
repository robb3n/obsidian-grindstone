import { ItemView, WorkspaceLeaf, TFile, Component, MarkdownRenderer } from 'obsidian';
import { DataStore } from '../storage/data-store';
import { CardData, Maturity } from '../card/types';

export const BROWSER_VIEW_TYPE = 'grindstone-browser';

type SortKey = 'due' | 'title' | 'maturity';

export class GrindstoneBrowserView extends ItemView {
  private store: DataStore;
  private searchQuery = '';
  private selectedTags = new Set<string>();
  private sortBy: SortKey = 'due';
  private component: Component;

  constructor(leaf: WorkspaceLeaf, store: DataStore) {
    super(leaf);
    this.store = store;
    this.component = new Component();
  }

  getViewType(): string {
    return BROWSER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Card Browser';
  }

  getIcon(): string {
    return 'library';
  }

  async onOpen(): Promise<void> {
    this.component.load();
    this.render();
  }

  async onClose(): Promise<void> {
    this.component.unload();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass('gs-browser');

    const wrap = el.createDiv({ cls: 'gs-wrap' });

    // -- Header --
    const header = wrap.createDiv({ cls: 'gs-header' });
    header.createEl('h1', { text: '卡 库' });
    header.createEl('div', { text: 'CARD BROWSER', cls: 'gs-sub' });

    // -- Toolbar --
    const toolbar = wrap.createDiv({ cls: 'gs-toolbar' });

    const searchInput = toolbar.createEl('input', {
      cls: 'gs-search',
      attr: { type: 'text', placeholder: '搜索标题或文件名…' },
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.renderList(wrap, listContainer);
    });

    const sortSelect = toolbar.createEl('select', { cls: 'gs-sort' });
    const sortOptions: Array<{ value: SortKey; label: string }> = [
      { value: 'due', label: '按到期日' },
      { value: 'title', label: '按标题' },
      { value: 'maturity', label: '按成熟度' },
    ];
    for (const opt of sortOptions) {
      const option = sortSelect.createEl('option', { text: opt.label, attr: { value: opt.value } });
      if (opt.value === this.sortBy) option.selected = true;
    }
    sortSelect.addEventListener('change', () => {
      this.sortBy = sortSelect.value as SortKey;
      this.renderList(wrap, listContainer);
    });

    // -- Tag Chips --
    const allTags = this.collectTags();
    if (allTags.length > 0) {
      const chips = wrap.createDiv({ cls: 'gs-chips' });
      for (const tag of allTags) {
        const chip = chips.createDiv({
          cls: `gs-chip${this.selectedTags.has(tag) ? ' gs-chip-active' : ''}`,
          text: tag,
        });
        chip.addEventListener('click', () => {
          if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
          } else {
            this.selectedTags.add(tag);
          }
          this.render();
        });
      }
    }

    // -- Card List --
    const listContainer = wrap.createDiv({ cls: 'gs-card-list' });
    this.renderList(wrap, listContainer);
  }

  private renderList(_wrap: HTMLElement, container: HTMLElement): void {
    container.empty();
    const today = formatDate(new Date());
    const cards = this.getFilteredCards();

    if (cards.length === 0) {
      container.createDiv({ cls: 'gs-empty', text: '无匹配卡片' });
      return;
    }

    // Count header
    container.createDiv({ cls: 'gs-list-count', text: `${cards.length} 张卡片` });

    for (const { id: _id, card } of cards) {
      const row = container.createDiv({ cls: 'gs-card-row' });

      // Maturity dot
      const mat = getMaturity(card);
      row.createDiv({ cls: `gs-card-dot gs-dot-${mat}` });

      // Main content
      const main = row.createDiv({ cls: 'gs-card-main' });

      // Title (clickable, supports LaTeX)
      const title = main.createDiv({ cls: 'gs-card-title' });
      MarkdownRenderer.render(this.app, card.blockTitle || '(untitled)', title, card.file, this.component);
      title.addEventListener('click', async () => {
        const file = this.app.vault.getAbstractFileByPath(card.file);
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf('tab');
          await leaf.openFile(file);
          const view = leaf.view;
          if ('editor' in view) {
            const editor = (view as any).editor;
            const line = card.blockStartLine ?? 0;
            editor.setCursor({ line, ch: 0 });
            editor.scrollIntoView(
              { from: { line, ch: 0 }, to: { line, ch: 0 } },
              true,
            );
          }
        }
      });

      // File path
      main.createDiv({ cls: 'gs-card-file', text: card.file });

      // Tags
      if (card.tags.length > 0) {
        const tagsEl = main.createDiv({ cls: 'gs-card-tags' });
        for (const tag of card.tags) {
          tagsEl.createSpan({ cls: 'gs-card-tag', text: tag });
        }
      }

      // Schedule info
      const schedule = row.createDiv({ cls: 'gs-card-schedule' });

      // Maturity label
      const matLabel = mat === 'new' ? '新' : mat === 'learning' ? '习' : '熟';
      schedule.createSpan({ cls: `gs-card-mat gs-card-mat-${mat}`, text: matLabel });

      // Due date
      const isOverdue = card.due <= today && card.reviewCount > 0;
      const isDueToday = card.due === today;
      const dueClass = isOverdue ? ' gs-card-due-overdue' : isDueToday ? ' gs-card-due-today' : '';
      schedule.createSpan({ cls: `gs-card-due${dueClass}`, text: card.due.slice(5) }); // MM-DD

      // Interval
      if (card.interval > 0) {
        schedule.createSpan({ cls: 'gs-card-interval', text: `${card.interval}d` });
      }
    }
  }

  private collectTags(): string[] {
    const tagCounts = new Map<string, number>();
    const settings = this.store.getSettings();

    for (const card of Object.values(this.store.getAllCards())) {
      if (card.disabled) continue;
      for (const tag of card.tags) {
        for (const trigger of settings.triggerTags) {
          if (tag === trigger || tag.startsWith(trigger + '/')) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }
      }
    }

    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }

  private getFilteredCards(): Array<{ id: string; card: CardData }> {
    const allCards = this.store.getAllCards();
    const query = this.searchQuery.toLowerCase();
    const result: Array<{ id: string; card: CardData }> = [];

    for (const [id, card] of Object.entries(allCards)) {
      if (card.disabled) continue;

      // Tag filter (OR logic)
      if (this.selectedTags.size > 0) {
        const match = card.tags.some((t) => this.selectedTags.has(t));
        if (!match) continue;
      }

      // Search filter
      if (query) {
        const titleMatch = card.blockTitle.toLowerCase().includes(query);
        const fileMatch = card.file.toLowerCase().includes(query);
        if (!titleMatch && !fileMatch) continue;
      }

      result.push({ id, card });
    }

    // Sort
    result.sort((a, b) => {
      switch (this.sortBy) {
        case 'due':
          return a.card.due.localeCompare(b.card.due);
        case 'title':
          return a.card.blockTitle.localeCompare(b.card.blockTitle);
        case 'maturity': {
          const order: Record<Maturity, number> = { new: 0, learning: 1, mature: 2 };
          return order[getMaturity(a.card)] - order[getMaturity(b.card)];
        }
      }
    });

    return result;
  }
}

function getMaturity(card: CardData): Maturity {
  if (card.reviewCount === 0) return 'new';
  if (card.interval < 21) return 'learning';
  return 'mature';
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
