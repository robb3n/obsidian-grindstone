import { Plugin } from 'obsidian';
import {
  PluginData, CardData, DEFAULT_DATA, GrindstoneSettings, DEFAULT_SETTINGS,
  StoreStats, MaturityDistribution,
} from '../card/types';

export class DataStore {
  private data: PluginData;
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.data = { ...DEFAULT_DATA, cards: {} };
  }

  async load(): Promise<void> {
    const raw = await this.plugin.loadData();
    if (raw) {
      this.data = {
        version: raw.version ?? 1,
        settings: { ...DEFAULT_SETTINGS, ...raw.settings },
        cards: raw.cards ?? {},
      };
    }
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.data);
  }

  getSettings(): GrindstoneSettings {
    return this.data.settings;
  }

  async updateSettings(s: Partial<GrindstoneSettings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...s };
    await this.save();
  }

  getCard(id: string): CardData | undefined {
    return this.data.cards[id];
  }

  getAllCards(): Record<string, CardData> {
    return this.data.cards;
  }

  setCard(id: string, card: CardData): void {
    this.data.cards[id] = card;
  }

  deleteCard(id: string): void {
    delete this.data.cards[id];
  }

  /** Get cards due today or earlier (and not disabled). */
  getDueCards(today: string): Array<{ id: string; card: CardData }> {
    const result: Array<{ id: string; card: CardData }> = [];
    for (const [id, card] of Object.entries(this.data.cards)) {
      if (card.disabled) continue;
      if (card.due <= today) {
        result.push({ id, card });
      }
    }
    return result;
  }

  /** Get active cards grouped by tag. Each card may appear under multiple tags. */
  getCardsByTag(tag: string): Array<{ id: string; card: CardData }> {
    const result: Array<{ id: string; card: CardData }> = [];
    for (const [id, card] of Object.entries(this.data.cards)) {
      if (card.disabled) continue;
      if (card.tags.some((t) => t === tag || t.startsWith(tag + '/'))) {
        result.push({ id, card });
      }
    }
    return result;
  }

  /** Get cards due within a date range [startDate, endDate] (inclusive, YYYY-MM-DD). */
  getDueCardsByRange(
    startDate: string,
    endDate: string,
  ): Array<{ id: string; card: CardData }> {
    const result: Array<{ id: string; card: CardData }> = [];
    for (const [id, card] of Object.entries(this.data.cards)) {
      if (card.disabled) continue;
      if (card.due >= startDate && card.due <= endDate) {
        result.push({ id, card });
      }
    }
    return result;
  }

  /** Aggregate statistics snapshot. */
  getStats(today: string): StoreStats {
    let total = 0;
    let active = 0;
    let disabled = 0;
    let dueToday = 0;
    let reviewedToday = 0;

    for (const card of Object.values(this.data.cards)) {
      total++;
      if (card.disabled) {
        disabled++;
        continue;
      }
      active++;
      if (card.due <= today) dueToday++;
      if (card.lastReviewed === today) reviewedToday++;
    }

    return { total, active, disabled, dueToday, reviewedToday };
  }

  /** Card maturity distribution (active cards only). */
  getMaturityDistribution(): MaturityDistribution {
    const dist: MaturityDistribution = { new: 0, learning: 0, mature: 0 };
    for (const card of Object.values(this.data.cards)) {
      if (card.disabled) continue;
      if (card.reviewCount === 0) dist.new++;
      else if (card.interval < 21) dist.learning++;
      else dist.mature++;
    }
    return dist;
  }

  /** Number of cards due on each of the next N days. */
  getUpcomingDue(days: number): Array<{ date: string; count: number }> {
    const today = new Date();
    const result: Array<{ date: string; count: number }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      let count = 0;
      for (const card of Object.values(this.data.cards)) {
        if (card.disabled) continue;
        if (card.due === dateStr) count++;
      }
      result.push({ date: dateStr, count });
    }

    // Also count overdue cards (due before today) and add to day 0
    if (result.length > 0) {
      const todayStr = result[0].date;
      for (const card of Object.values(this.data.cards)) {
        if (card.disabled) continue;
        if (card.due < todayStr) result[0].count++;
      }
    }

    return result;
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
