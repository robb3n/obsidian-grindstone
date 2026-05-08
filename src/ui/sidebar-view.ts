import { ItemView, WorkspaceLeaf, Component } from 'obsidian';
import { CardData, Rating } from '../card/types';
import { schedule } from '../srs/sm2';
import { CardManager } from '../card/card-manager';
import { DataStore } from '../storage/data-store';
import { renderCardView, renderCompleteView } from './card-renderer';

export const SIDEBAR_VIEW_TYPE = 'grindstone-sidebar';

interface QueueItem {
  id: string;
  card: CardData;
}

export class GrindstoneSidebarView extends ItemView {
  private queue: QueueItem[] = [];
  private currentIndex = 0;
  private cardManager: CardManager;
  private store: DataStore;
  private component: Component;

  constructor(
    leaf: WorkspaceLeaf,
    cardManager: CardManager,
    store: DataStore,
  ) {
    super(leaf);
    this.cardManager = cardManager;
    this.store = store;
    this.component = new Component();
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Grindstone';
  }

  getIcon(): string {
    return 'flame';
  }

  async onOpen(): Promise<void> {
    this.component.load();
    this.contentEl.addClass('grindstone-sidebar-content');
    this.loadQueue();
    this.renderCurrent();
  }

  async onClose(): Promise<void> {
    this.component.unload();
    this.contentEl.empty();
  }

  /** Reload the due queue and re-render. */
  refresh(): void {
    this.loadQueue();
    this.renderCurrent();
  }

  private loadQueue(): void {
    const today = formatDate(new Date());
    this.queue = this.store.getDueCards(today);
    this.currentIndex = 0;
  }

  private renderCurrent(): void {
    if (this.currentIndex >= this.queue.length) {
      renderCompleteView(this.contentEl);
      return;
    }

    const { id, card } = this.queue[this.currentIndex];

    renderCardView({
      container: this.contentEl,
      card,
      position: { current: this.currentIndex + 1, total: this.queue.length },
      app: this.app,
      component: this.component,
      cardManager: this.cardManager,
      onRate: (rating, elapsed) => this.handleRating(id, card, rating, elapsed),
      // No onClose for sidebar – jump-to-source doesn't close the panel
    });
  }

  private async handleRating(id: string, card: CardData, rating: Rating, elapsed: number): Promise<void> {
    const newState = schedule(
      { interval: card.interval, ease: card.ease, reviewCount: card.reviewCount },
      rating,
    );

    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + newState.interval);

    card.interval = newState.interval;
    card.ease = newState.ease;
    card.reviewCount = newState.reviewCount;
    card.due = formatDate(dueDate);
    card.lastReviewed = formatDate(today);

    this.store.setCard(id, card);
    await this.store.save();
    await this.store.addReviewLog({
      cardId: id,
      rating,
      timestamp: today.toISOString().slice(0, 19),
      elapsed,
    });
    await this.cardManager.writeStarsBack(card, rating);

    this.currentIndex++;
    this.renderCurrent();
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
