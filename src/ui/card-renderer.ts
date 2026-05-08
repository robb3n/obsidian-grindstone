import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import { CardData, Rating } from '../card/types';
import { CardManager } from '../card/card-manager';

export interface RenderParams {
  container: HTMLElement;
  card: CardData;
  position: { current: number; total: number };
  app: App;
  component: Component;
  cardManager: CardManager;
  onRate: (rating: Rating, elapsed: number) => Promise<void>;
  onClose?: () => void;
  autoShow?: boolean;
}

export async function renderCardView(params: RenderParams): Promise<void> {
  const { container, card, position, app, component, cardManager, onRate, onClose, autoShow } = params;
  container.empty();

  // Header: card count
  const header = container.createDiv({ cls: 'grindstone-header' });
  header.createSpan({
    text: `${position.current} / ${position.total}`,
    cls: 'grindstone-counter',
  });

  // Card front
  const front = container.createDiv({ cls: 'grindstone-front' });
  const titleEl = front.createEl('h2', { cls: 'grindstone-title' });
  await MarkdownRenderer.render(app, card.blockTitle, titleEl, card.file, component);

  // File path (toggle: filename ↔ full path)
  const fileName = card.file.replace(/\.md$/, '').split('/').pop() ?? card.file;
  const fullPath = card.file.replace(/\.md$/, '');
  const fileBadge = front.createDiv({ cls: 'grindstone-file' });
  const fileSpan = fileBadge.createSpan({ text: fileName });
  fileSpan.addEventListener('click', () => {
    fileSpan.setText(fileSpan.getText() === fileName ? fullPath : fileName);
  });

  // Tags (toggle: short ↔ full)
  const tagContainer = front.createDiv({ cls: 'grindstone-tags' });
  let tagsExpanded = false;
  const uniqueTags = [...new Set(card.tags)];

  function renderTags() {
    tagContainer.empty();
    for (const tag of uniqueTags) {
      const display = tagsExpanded ? tag : shortTag(tag);
      const span = tagContainer.createSpan({ text: display, cls: 'grindstone-tag' });
      span.addEventListener('click', () => {
        tagsExpanded = !tagsExpanded;
        renderTags();
      });
    }
  }
  renderTags();

  // Content area
  const contentCls = autoShow ? 'grindstone-content grindstone-content-full' : 'grindstone-content';
  const contentArea = container.createDiv({ cls: contentCls });

  if (autoShow) {
    // Auto-expand: load and show content immediately
    const blockContent = await cardManager.getBlockContent(card);
    await MarkdownRenderer.render(app, blockContent, contentArea, card.file, component);
  } else {
    contentArea.style.display = 'none';
  }

  // Action buttons
  const actions = container.createDiv({ cls: 'grindstone-actions' });

  const showBtn = actions.createEl('button', {
    text: autoShow ? '隐藏内容' : '显示内容',
    cls: 'grindstone-btn grindstone-btn-show',
  });
  showBtn.addEventListener('click', async () => {
    if (contentArea.style.display === 'none') {
      const blockContent = await cardManager.getBlockContent(card);
      contentArea.empty();
      await MarkdownRenderer.render(app, blockContent, contentArea, card.file, component);
      contentArea.style.display = 'block';
      contentArea.addClass('grindstone-content-full');
      showBtn.setText('隐藏内容');
    } else {
      contentArea.style.display = 'none';
      showBtn.setText('显示内容');
    }
  });

  const jumpBtn = actions.createEl('button', {
    text: '跳到原文',
    cls: 'grindstone-btn grindstone-btn-jump',
  });
  jumpBtn.addEventListener('click', async () => {
    const file = app.vault.getAbstractFileByPath(card.file);
    if (file instanceof TFile) {
      const leaf = app.workspace.getLeaf('tab');
      await leaf.openFile(file);
      const editor = app.workspace.activeEditor?.editor;
      if (editor) {
        editor.setCursor({ line: card.blockStartLine, ch: 0 });
        editor.scrollIntoView(
          { from: { line: card.blockStartLine, ch: 0 }, to: { line: card.blockStartLine, ch: 0 } },
          true,
        );
      }
    }
    if (onClose) onClose();
  });

  // Rating buttons — track elapsed time from card display
  const cardDisplayedAt = Date.now();
  const ratingRow = container.createDiv({ cls: 'grindstone-ratings' });
  for (const [label, rating, cls] of [
    ['Hard', 'hard', 'grindstone-btn-hard'],
    ['Good', 'good', 'grindstone-btn-good'],
    ['Easy', 'easy', 'grindstone-btn-easy'],
  ] as [string, Rating, string][]) {
    const btn = ratingRow.createEl('button', {
      text: label,
      cls: `grindstone-btn grindstone-btn-rating ${cls}`,
    });
    btn.addEventListener('click', () => onRate(rating, Date.now() - cardDisplayedAt));
  }
}

export function renderCompleteView(container: HTMLElement, onClose?: () => void): void {
  container.empty();
  const done = container.createDiv({ cls: 'grindstone-complete' });
  done.createEl('h2', { text: '今日复习完成!' });
  done.createEl('p', { text: '所有到期卡片已复习。' });

  if (onClose) {
    const closeBtn = done.createEl('button', { text: '关闭', cls: 'grindstone-btn' });
    closeBtn.addEventListener('click', () => onClose());
  }
}

function shortTag(tag: string): string {
  const lastSlash = tag.lastIndexOf('/');
  if (lastSlash === -1) return tag;
  return '#' + tag.substring(lastSlash + 1);
}
