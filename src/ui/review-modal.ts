import { App, Modal, Component } from 'obsidian';
import { CardData, Rating } from '../card/types';
import { schedule } from '../srs/sm2';
import { CardManager } from '../card/card-manager';
import { DataStore } from '../storage/data-store';
import { renderCardView, renderCompleteView } from './card-renderer';

interface QueueItem {
  id: string;
  card: CardData;
}

export class ReviewModal extends Modal {
  private queue: QueueItem[];
  private currentIndex: number;
  private cardManager: CardManager;
  private store: DataStore;
  private component: Component;

  constructor(
    app: App,
    queue: QueueItem[],
    cardManager: CardManager,
    store: DataStore,
  ) {
    super(app);
    this.queue = queue;
    this.currentIndex = 0;
    this.cardManager = cardManager;
    this.store = store;
    this.component = new Component();
  }

  onOpen(): void {
    this.component.load();
    this.modalEl.addClass('grindstone-review-modal');
    this.renderCurrent();
  }

  onClose(): void {
    this.component.unload();
    this.contentEl.empty();
  }

  private renderCurrent(): void {
    if (this.currentIndex >= this.queue.length) {
      renderCompleteView(this.contentEl, () => this.close());
      return;
    }

    const { id, card } = this.queue[this.currentIndex];
    const autoShowTags = this.store.getSettings().autoShowTags;
    const autoShow = card.tags.some((t) =>
      autoShowTags.some((ast) => t === ast || t.startsWith(ast + '/')),
    );

    renderCardView({
      container: this.contentEl,
      card,
      cardId: id,
      position: { current: this.currentIndex + 1, total: this.queue.length },
      app: this.app,
      component: this.component,
      cardManager: this.cardManager,
      onRate: (rating, elapsed) => this.handleRating(id, card, rating, elapsed),
      onClose: () => this.close(),
      autoShow,
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
    await this.cardManager.writeStarsBack(card, id, rating);

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
