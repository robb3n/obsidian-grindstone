import { App, TFile } from 'obsidian';
import { CardData, GrindstoneSettings, Rating } from './types';
import { computeCardId } from './card-id';
import { parseCardBlocks } from '../scanner/block-parser';
import { initialCardState } from '../srs/sm2';
import { DataStore } from '../storage/data-store';

export class CardManager {
  private app: App;
  private store: DataStore;

  constructor(app: App, store: DataStore) {
    this.app = app;
    this.store = store;
  }

  async fullScan(): Promise<void> {
    const settings = this.store.getSettings();
    const seenIds = new Set<string>();
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const ids = await this.scanFile(file, settings);
      for (const id of ids) seenIds.add(id);
    }

    // Disable cards whose blocks are no longer detected
    for (const [id, card] of Object.entries(this.store.getAllCards())) {
      if (!seenIds.has(id) && !card.disabled) {
        card.disabled = true;
        this.store.setCard(id, card);
      }
    }

    await this.store.save();
  }

  async scanFile(file: TFile, settings?: GrindstoneSettings): Promise<string[]> {
    if (!settings) settings = this.store.getSettings();

    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return [];

    const content = await this.app.vault.cachedRead(file);
    const blocks = parseCardBlocks(cache, content, settings);
    const ids: string[] = [];

    // Count title occurrences for blockIndex disambiguation
    const titleCounts: Record<string, number> = {};

    for (const block of blocks) {
      const blockIndex = titleCounts[block.title] ?? 0;
      titleCounts[block.title] = blockIndex + 1;

      const cardId = computeCardId(file.path, block.title, blockIndex);
      ids.push(cardId);

      const existing = this.store.getCard(cardId);
      if (existing) {
        existing.file = file.path;
        existing.blockStartLine = block.startLine;
        existing.tags = block.tags;
        existing.blockTitle = block.title;
        existing.disabled = false;
        this.store.setCard(cardId, existing);
      } else {
        const today = formatDate(new Date());
        const init = initialCardState();
        const card: CardData = {
          file: file.path,
          blockTitle: block.title,
          blockStartLine: block.startLine,
          tags: block.tags,
          interval: init.interval,
          ease: init.ease,
          due: today,
          lastReviewed: '',
          reviewCount: init.reviewCount,
          createdAt: today,
        };
        this.store.setCard(cardId, card);
      }
    }

    return ids;
  }

  async getBlockContent(card: CardData): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(card.file);
    if (!(file instanceof TFile)) return '';

    const content = await this.app.vault.cachedRead(file);
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return '';

    const settings = this.store.getSettings();
    const blocks = parseCardBlocks(cache, content, settings);
    const lines = content.split('\n');

    // Match by startLine first, then by title
    for (const block of blocks) {
      if (block.startLine === card.blockStartLine) {
        return lines.slice(block.startLine + 1, block.endLine).join('\n');
      }
    }
    for (const block of blocks) {
      if (block.title === card.blockTitle) {
        return lines.slice(block.startLine + 1, block.endLine).join('\n');
      }
    }

    return '';
  }

  /**
   * Write star rating back to the source file's trigger line.
   * Hard = ⭐️⭐️, Good = ⭐️, Easy = no star.
   */
  async writeStarsBack(card: CardData, rating: Rating): Promise<void> {
    if (!this.store.getSettings().writeStarsBack) return;

    const file = this.app.vault.getAbstractFileByPath(card.file);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    const lineIdx = card.blockStartLine;
    if (lineIdx >= lines.length) return;

    // Strip existing stars from the line start (after optional heading markers)
    let line = lines[lineIdx];
    const headingMatch = line.match(/^(#{1,6}\s+)/);
    const prefix = headingMatch ? headingMatch[1] : '';
    let rest = headingMatch ? line.slice(prefix.length) : line;
    rest = rest.replace(/^[\u2B50\uFE0F]+/, '');

    // Prepend new stars
    const starCount = rating === 'hard' ? 2 : rating === 'good' ? 1 : 0;
    const stars = '\u2B50\uFE0F'.repeat(starCount);
    lines[lineIdx] = prefix + stars + rest;

    await this.app.vault.modify(file, lines.join('\n'));
  }

  handleRename(oldPath: string, newPath: string): void {
    for (const [id, card] of Object.entries(this.store.getAllCards())) {
      if (card.file === oldPath) {
        card.file = newPath;
        this.store.setCard(id, card);
      }
    }
  }

  handleDelete(filePath: string): void {
    for (const [id, card] of Object.entries(this.store.getAllCards())) {
      if (card.file === filePath && !card.disabled) {
        card.disabled = true;
        this.store.setCard(id, card);
      }
    }
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
