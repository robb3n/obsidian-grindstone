import { App, TFile } from 'obsidian';
import { CardData, GrindstoneSettings, Rating } from './types';
import { computeCardId, generateCardId, toCardKey, embedIdInLine, extractEmbeddedId } from './card-id';
import { parseCardBlocks, CardBlock } from '../scanner/block-parser';
import { initialCardState } from '../srs/sm2';
import { DataStore } from '../storage/data-store';

export class CardManager {
  private app: App;
  private store: DataStore;
  private _idWriteInProgress = new Set<string>();

  constructor(app: App, store: DataStore) {
    this.app = app;
    this.store = store;
  }

  /** True if the given file is currently being modified by ID embedding. */
  isWritingIds(filePath: string): boolean {
    return this._idWriteInProgress.has(filePath);
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

    if (!settings.embedCardIds) {
      return this.scanFileLegacy(file, blocks, settings);
    }

    const ids: string[] = [];
    const lines = content.split('\n');
    const pendingEmbeds: Array<{ lineIndex: number; id: string }> = [];

    for (const block of blocks) {
      let cardId: string;
      if (block.embeddedId) {
        cardId = block.embeddedId;
      } else {
        cardId = generateCardId();
        pendingEmbeds.push({ lineIndex: block.startLine, id: cardId });
      }

      const key = toCardKey(cardId);
      ids.push(key);

      const existing = this.store.getCard(key);
      if (existing) {
        existing.file = file.path;
        existing.blockStartLine = block.startLine;
        existing.tags = block.tags;
        existing.blockTitle = block.title;
        existing.disabled = false;
        this.store.setCard(key, existing);
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
        this.store.setCard(key, card);
      }
    }

    // Batch-write new IDs back to the file
    if (pendingEmbeds.length > 0) {
      this._idWriteInProgress.add(file.path);
      for (const { lineIndex, id } of pendingEmbeds) {
        lines[lineIndex] = embedIdInLine(lines[lineIndex], id);
      }
      await this.app.vault.modify(file, lines.join('\n'));
      setTimeout(() => this._idWriteInProgress.delete(file.path), 1000);
    }

    return ids;
  }

  /** Legacy hash-based scan (embedCardIds = false). */
  private scanFileLegacy(file: TFile, blocks: CardBlock[], settings: GrindstoneSettings): string[] {
    const ids: string[] = [];
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

  async getBlockContent(card: CardData, cardId?: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(card.file);
    if (!(file instanceof TFile)) return '';

    const content = await this.app.vault.cachedRead(file);
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return '';

    const settings = this.store.getSettings();
    const blocks = parseCardBlocks(cache, content, settings);
    const lines = content.split('\n');

    // Match by embedded ID
    if (cardId && cardId.startsWith('gs:')) {
      const embId = cardId.slice(3);
      for (const block of blocks) {
        if (block.embeddedId === embId) {
          return lines.slice(block.startLine + 1, block.endLine).join('\n');
        }
      }
    }

    // Fallback: match by startLine, then by title
    if (card.blockStartLine != null) {
      for (const block of blocks) {
        if (block.startLine === card.blockStartLine) {
          return lines.slice(block.startLine + 1, block.endLine).join('\n');
        }
      }
    }
    for (const block of blocks) {
      if (block.title === card.blockTitle) {
        return lines.slice(block.startLine + 1, block.endLine).join('\n');
      }
    }

    return '';
  }

  /** Resolve the current start line for a card by re-parsing its file. */
  async getBlockStartLine(card: CardData, cardId: string): Promise<number | null> {
    const file = this.app.vault.getAbstractFileByPath(card.file);
    if (!(file instanceof TFile)) return null;

    const content = await this.app.vault.cachedRead(file);
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return null;

    const blocks = parseCardBlocks(cache, content, this.store.getSettings());

    if (cardId.startsWith('gs:')) {
      const embId = cardId.slice(3);
      for (const block of blocks) {
        if (block.embeddedId === embId) return block.startLine;
      }
    }
    for (const block of blocks) {
      if (block.title === card.blockTitle) return block.startLine;
    }
    return null;
  }

  /**
   * Write star rating back to the source file's trigger line.
   * Hard = ⭐️⭐️, Good = ⭐️, Easy = no star.
   */
  async writeStarsBack(card: CardData, cardId: string, rating: Rating): Promise<void> {
    if (!this.store.getSettings().writeStarsBack) return;

    const file = this.app.vault.getAbstractFileByPath(card.file);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    // Find the correct line
    let lineIdx: number | undefined;

    if (cardId.startsWith('gs:')) {
      const embId = cardId.slice(3);
      const pattern = new RegExp(`<!--\\s*gs:${embId}\\s*-->`);
      const idx = lines.findIndex(l => pattern.test(l));
      if (idx !== -1) lineIdx = idx;
    }

    if (lineIdx == null) {
      lineIdx = card.blockStartLine;
    }

    if (lineIdx == null || lineIdx >= lines.length) return;

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

  // ── Migration ──

  async migrateToEmbeddedIds(): Promise<{ migrated: number; failed: number }> {
    const oldCards = { ...this.store.getAllCards() };
    const keyMapping = new Map<string, string>();
    let migrated = 0;
    let failed = 0;

    // Group old active cards by file
    const cardsByFile = new Map<string, Array<{ oldKey: string; card: CardData }>>();
    for (const [key, card] of Object.entries(oldCards)) {
      if (key.startsWith('gs:')) continue; // already migrated
      if (card.disabled) continue;
      const list = cardsByFile.get(card.file) ?? [];
      list.push({ oldKey: key, card });
      cardsByFile.set(card.file, list);
    }

    for (const [filePath, entries] of cardsByFile) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        failed += entries.length;
        continue;
      }

      try {
        const content = await this.app.vault.read(file);
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) { failed += entries.length; continue; }

        const settings = this.store.getSettings();
        const blocks = parseCardBlocks(cache, content, settings);
        const lines = content.split('\n');
        let modified = false;

        for (const { oldKey, card } of entries) {
          // Find matching block by title first, then startLine
          let matchedBlock: CardBlock | undefined;
          for (const block of blocks) {
            if (block.title === card.blockTitle) { matchedBlock = block; break; }
          }
          if (!matchedBlock && card.blockStartLine != null) {
            for (const block of blocks) {
              if (block.startLine === card.blockStartLine) { matchedBlock = block; break; }
            }
          }

          if (!matchedBlock) { failed++; continue; }

          // Reuse existing embedded ID if present (partial prior migration)
          let newId: string;
          if (matchedBlock.embeddedId) {
            newId = matchedBlock.embeddedId;
          } else {
            newId = generateCardId();
            lines[matchedBlock.startLine] = embedIdInLine(lines[matchedBlock.startLine], newId);
            modified = true;
          }

          keyMapping.set(oldKey, toCardKey(newId));
          migrated++;
        }

        if (modified) {
          await this.app.vault.modify(file, lines.join('\n'));
        }
      } catch (err) {
        console.error(`[Grindstone] Migration failed for ${filePath}:`, err);
        failed += entries.length;
      }
    }

    // Remap card entries
    for (const [oldKey, newKey] of keyMapping) {
      const card = this.store.getCard(oldKey);
      if (card) {
        this.store.setCard(newKey, card);
        this.store.deleteCard(oldKey);
      }
    }

    // Remap review log references
    const logs = this.store.getReviewLogs();
    for (const log of logs) {
      const newKey = keyMapping.get(log.cardId);
      if (newKey) log.cardId = newKey;
    }

    return { migrated, failed };
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
