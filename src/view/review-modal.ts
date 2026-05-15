import { App, Modal, Component, MarkdownRenderer, TFile } from 'obsidian';
import { Rating } from '../card/types';
import { CardManager } from '../card/card-manager';
import { GrindstoneStore } from '../store/GrindstoneStore';
import { ReviewEngine, QueueItem } from '../review/review-engine';
import { RATING_LABELS, RATING_KEY_MAP } from '../review/rating-defs';
import { renderCardAnswer } from '../review/card-render';

export class ReviewModal extends Modal {
  private engine: ReviewEngine;
  private cardManager: CardManager;
  private component: Component;
  private cardDisplayedAt = 0;
  private answerShown = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    app: App,
    queue: QueueItem[],
    cardManager: CardManager,
    gsStore: GrindstoneStore,
  ) {
    super(app);
    this.engine = new ReviewEngine(queue, gsStore, cardManager);
    this.cardManager = cardManager;
    this.component = new Component();
  }

  onOpen(): void {
    this.component.load();
    this.modalEl.addClass('grindstone-review-modal');
    this.renderCurrent();
    this.registerKeyboard();
  }

  onClose(): void {
    this.unregisterKeyboard();
    this.component.unload();
    this.contentEl.empty();
  }

  private registerKeyboard(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (this.engine.isComplete()) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.toggleAnswer();
      } else if (this.answerShown) {
        const rating = RATING_KEY_MAP[e.key];
        if (rating) {
          e.preventDefault();
          this.doRate(rating);
        }
      }
    };
    this.modalEl.addEventListener('keydown', this.keyHandler);
    // Ensure modal can receive keyboard events
    this.modalEl.tabIndex = -1;
    this.modalEl.focus();
  }

  private unregisterKeyboard(): void {
    if (this.keyHandler) {
      this.modalEl.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  private renderCurrent(): void {
    this.contentEl.empty();
    this.answerShown = false;

    if (this.engine.isComplete()) {
      this.renderComplete();
      return;
    }

    const item = this.engine.getCurrentItem()!;
    const pos = this.engine.getPosition();
    const autoShow = this.engine.isAutoShow();

    // Header
    const head = this.contentEl.createDiv({ cls: 'rvm-head' });
    const headL = head.createDiv({ cls: 'rvm-head-l gs-en' });
    headL.createSpan({ cls: 'rvm-head-eyebrow', text: 'REVIEW SESSION' });
    headL.createSpan({ cls: 'rvm-head-meta gs-mono', text: `${pos.current} / ${pos.total}` });
    // Progress bar
    const progress = this.contentEl.createDiv({ cls: 'rvm-progress' });
    const fill = progress.createDiv({ cls: 'rvm-progress-fill' });
    fill.style.width = `${this.engine.getProgress() * 100}%`;

    // Stage
    const stage = this.contentEl.createDiv({ cls: 'rvm-stage' });

    // Tags
    const tags = stage.createDiv({ cls: 'rvm-card-tags' });
    const uniqueTags = [...new Set(item.card.tags)];
    for (const tag of uniqueTags) {
      const display = tag.startsWith('#') ? tag : `#${tag}`;
      tags.createSpan({ cls: 'rvm-card-tag', text: display });
    }

    // Title (question)
    const titleEl = stage.createDiv({ cls: 'rvm-card-title' });
    MarkdownRenderer.render(this.app, item.card.blockTitle, titleEl, item.card.file, this.component);

    // Card metadata
    const metaEl = stage.createDiv({ cls: 'rvm-card-meta gs-mono' });
    metaEl.createSpan({ text: `间隔 ${item.card.interval}d` });
    metaEl.createSpan({ text: `EF ${item.card.ease.toFixed(2)}` });
    metaEl.createSpan({ text: `复习 ${item.card.reviewCount} 次` });

    // Answer area (initially hidden unless autoShow)
    const backWrap = stage.createDiv({ cls: 'rvm-card-back' });
    if (autoShow) {
      this.answerShown = true;
      this.loadAnswer(backWrap, item);
    }

    // Action buttons
    const actions = stage.createDiv({ cls: 'rvm-card-actions' });
    const showBtn = actions.createEl('button', {
      text: autoShow ? '隐藏内容' : '显示答案',
      cls: 'rvm-card-btn',
    });
    showBtn.addEventListener('click', () => this.toggleAnswer());

    const jumpBtn = actions.createEl('button', { text: '跳到原文', cls: 'rvm-card-btn' });
    jumpBtn.addEventListener('click', async () => {
      const file = this.app.vault.getAbstractFileByPath(item.card.file);
      if (file instanceof TFile) {
        const startLine = await this.cardManager.getBlockStartLine(item.card, item.id);
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(file);
        if (startLine != null) {
          const editor = this.app.workspace.activeEditor?.editor;
          if (editor) {
            editor.setCursor({ line: startLine, ch: 0 });
            editor.scrollIntoView(
              { from: { line: startLine, ch: 0 }, to: { line: startLine, ch: 0 } },
              true,
            );
          }
        }
      }
      this.close();
    });

    // Rating buttons (fixed at bottom, outside stage scroll)
    const rateSection = this.contentEl.createDiv({ cls: 'rvm-rate' });
    if (!autoShow) rateSection.style.display = 'none';

    const previews = this.engine.previewIntervals();
    for (const def of RATING_LABELS) {
      const btn = rateSection.createEl('button', { cls: `rvm-r rvm-r-${def.rating}` });
      const inner = btn.createDiv({ cls: 'rvm-r-inner' });
      inner.createEl('kbd', { cls: 'rvm-r-kbd gs-mono', text: def.key });
      inner.createDiv({ cls: 'rvm-r-zh', text: def.zh });
      inner.createDiv({ cls: 'rvm-r-en gs-en', text: def.en });
      inner.createDiv({ cls: 'rvm-r-interval gs-mono', text: previews[def.rating] });
      btn.addEventListener('click', () => this.doRate(def.rating));
    }

    // Hint
    const hint = this.contentEl.createDiv({ cls: 'rvm-hint gs-en' });
    if (!autoShow) {
      hint.textContent = 'SPACE 显示答案 · ESC 退出';
    } else {
      hint.textContent = '1-4 评分 · ESC 退出';
    }

    // Track display time
    this.cardDisplayedAt = Date.now();

    // Store references for toggleAnswer
    (this as any)._backWrap = backWrap;
    (this as any)._showBtn = showBtn;
    (this as any)._rateSection = rateSection;
    (this as any)._hint = hint;
    (this as any)._currentItem = item;
  }

  private async toggleAnswer(): Promise<void> {
    const backWrap = (this as any)._backWrap as HTMLElement;
    const showBtn = (this as any)._showBtn as HTMLButtonElement;
    const rateSection = (this as any)._rateSection as HTMLElement;
    const hint = (this as any)._hint as HTMLElement;
    const item = (this as any)._currentItem as QueueItem;

    if (!this.answerShown) {
      this.answerShown = true;
      await this.loadAnswer(backWrap, item);
      showBtn.setText('隐藏内容');
      rateSection.style.display = '';
      hint.textContent = '1-4 评分 · ESC 退出';
    } else {
      this.answerShown = false;
      backWrap.empty();
      showBtn.setText('显示答案');
      rateSection.style.display = 'none';
      hint.textContent = 'SPACE 显示答案 · ESC 退出';
    }
    this.modalEl.focus();
  }

  private async loadAnswer(container: HTMLElement, item: QueueItem): Promise<void> {
    container.empty();
    container.createDiv({ cls: 'rvm-card-divider' });
    const md = container.createDiv({ cls: 'rvm-card-back-md' });
    await renderCardAnswer(md, item.card, item.id, this.cardManager, this.app, this.component);
  }

  private async doRate(rating: Rating): Promise<void> {
    const elapsed = Date.now() - this.cardDisplayedAt;
    await this.engine.rate(rating, elapsed);
    this.renderCurrent();
    // Re-focus modal for keyboard
    this.modalEl.focus();
  }

  private renderComplete(): void {
    this.contentEl.empty();

    // Progress bar (full)
    const progress = this.contentEl.createDiv({ cls: 'rvm-progress' });
    progress.createDiv({ cls: 'rvm-progress-fill' }).style.width = '100%';

    const done = this.contentEl.createDiv({ cls: 'rvm-done' });
    done.createDiv({ cls: 'rvm-done-eyebrow gs-en', text: 'SESSION COMPLETE' });
    done.createEl('h2', { cls: 'rvm-done-title', text: '本次会话完成' });
    done.createEl('p', { cls: 'rvm-done-sub', text: `${this.engine.getPosition().total} 张 · 所有到期卡片已复习` });
    const closeBtn = done.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '关闭 →' });
    closeBtn.addEventListener('click', () => this.close());
  }
}
