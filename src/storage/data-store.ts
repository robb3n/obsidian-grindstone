import { Plugin } from 'obsidian';
import {
  PluginData, CardData, DEFAULT_DATA, GrindstoneSettings, DEFAULT_SETTINGS,
  StoreStats, MaturityDistribution, ReviewLog, Rating,
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
        reviewLogs: raw.reviewLogs ?? [],
      };
    }
  }

  async save(): Promise<void> {
    // Strip runtime-only fields before persisting
    const cleanCards: Record<string, CardData> = {};
    for (const [id, card] of Object.entries(this.data.cards)) {
      const { blockStartLine, ...rest } = card;
      cleanCards[id] = rest as CardData;
    }
    await this.plugin.saveData({ ...this.data, cards: cleanCards });
  }

  needsMigration(): boolean {
    return this.data.version < 2;
  }

  setVersion(v: number): void {
    this.data.version = v;
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

  // ── Review log methods ──

  /** Append a review log entry and persist. */
  async addReviewLog(log: ReviewLog): Promise<void> {
    this.data.reviewLogs.push(log);
    await this.save();
  }

  /** Number of cards reviewed per day over the last N days. */
  getReviewHistory(days: number): Array<{ date: string; count: number }> {
    const result: Array<{ date: string; count: number }> = [];
    const today = new Date();
    const dateCountMap = new Map<string, number>();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = formatDate(d);
      dateCountMap.set(ds, 0);
    }

    for (const log of this.data.reviewLogs) {
      const logDate = log.timestamp.slice(0, 10); // "YYYY-MM-DD"
      if (dateCountMap.has(logDate)) {
        dateCountMap.set(logDate, (dateCountMap.get(logDate) ?? 0) + 1);
      }
    }

    for (const [date, count] of dateCountMap) {
      result.push({ date, count });
    }
    return result;
  }

  /** Rating distribution. If days is provided, only count logs within that window. */
  getRatingDistribution(days?: number): Record<Rating, number> {
    const dist: Record<Rating, number> = { hard: 0, good: 0, easy: 0 };
    const cutoff = days != null ? this.dateCutoff(days) : null;

    for (const log of this.data.reviewLogs) {
      if (cutoff && log.timestamp < cutoff) continue;
      dist[log.rating]++;
    }
    return dist;
  }

  /** Total study time (ms) per day over the last N days. */
  getDailyStudyTime(days: number): Array<{ date: string; ms: number }> {
    const result: Array<{ date: string; ms: number }> = [];
    const today = new Date();
    const dateMap = new Map<string, number>();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dateMap.set(formatDate(d), 0);
    }

    for (const log of this.data.reviewLogs) {
      const logDate = log.timestamp.slice(0, 10);
      if (dateMap.has(logDate)) {
        dateMap.set(logDate, (dateMap.get(logDate) ?? 0) + log.elapsed);
      }
    }

    for (const [date, ms] of dateMap) {
      result.push({ date, ms });
    }
    return result;
  }

  private dateCutoff(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return formatDate(d) + 'T00:00:00';
  }

  /** Raw review log entries. */
  getReviewLogs(): ReviewLog[] {
    return this.data.reviewLogs;
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
