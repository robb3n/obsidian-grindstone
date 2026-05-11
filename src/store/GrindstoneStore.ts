/**
 * GrindstoneStore — facade layer between workspace views and DataStore.
 *
 * Views never read data.json directly; they call this store.
 * Internally delegates to the existing DataStore for persistence
 * and adds computed/derived queries the UI needs.
 */

import { DataStore } from '../storage/data-store';
import { CardData, Rating, ReviewLog, SrsParams, DeckResetMode, BUILTIN_PRESETS } from '../card/types';

// ── Shared helpers ──────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today(): string {
  return formatDate(new Date());
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

// ── Types ───────────────────────────────────────────────────

export interface OverviewStats {
  due: number;
  done: number;
  remaining: number;
  streak: number;
  weekMinutes: number;
  tagCount: number;
}

export interface ForecastDay {
  date: string;   // YYYY-MM-DD
  label: string;  // day of month, e.g. "09"
  count: number;
  isToday: boolean;
}

export interface TodayProgress {
  done: number;
  total: number;
}

export interface MaturityData {
  new: number;
  learning: number;
  mature: number;
}

export interface RatingsData {
  again: number;
  hard: number;
  good: number;
  easy: number;
  againPct: number;
  hardPct: number;
  goodPct: number;
  easyPct: number;
}

export interface TagSummary {
  path: string;
  count: number;
}

export interface DeckNode {
  id: string;
  name: string;
  fullTag: string;
  count: number;
  due: number;
  newCount: number;
  mode: 'auto';
  children: DeckNode[];
  /** ISO date of most recent review for any card in this deck (empty if never). */
  lastReviewed: string;
  /** Resolved strategy display name for top-level decks. */
  strategyName?: string;
}

export interface StatsKPI {
  reviewed: number;
  studyMinutes: number;
  activeDays: number;
  accuracy: number;
  /** Deltas vs previous equal-length period (null if no prior data). */
  reviewedDelta: number | null;
  studyMinutesDelta: number | null;
  activeDaysDelta: number | null;
  accuracyDelta: number | null;
}

export interface ForgettingPoint {
  intervalDays: number;
  retention: number;  // 0..100%
  sampleSize: number;
}

export interface AccuracyByTag {
  tag: string;
  accuracy: number;
  reviewCount: number;
}

export interface ReviewSession {
  date: string;
  cards: number;
  minutes: number;
  ratings: Record<Rating, number> | null;
  /** Top tags that appeared in this session's reviewed cards. */
  scope: string[];
}

export interface TagTreeNode {
  path: string;
  name: string;
  count: number;
  children: TagTreeNode[];
}

export interface CardEntry {
  id: string;
  card: CardData;
}

// ── Store ───────────────────────────────────────────────────

export class GrindstoneStore {
  private primaryDeckCache: Map<string, string> | null = null;

  constructor(private dataStore: DataStore) {}

  // ── Overview ────────────────────────────────────────────

  getOverviewStats(): OverviewStats {
    const t = today();
    const stats = this.dataStore.getStats(t);
    const streak = this.computeStreak();
    const weekMinutes = this.getWeekStudyMinutes();
    const tagCount = this.getAllTagPaths().length;
    // After reviewing a card its due date moves forward, so
    // dueToday only counts cards still awaiting review.
    // Original due count = still-due + already-reviewed-today.
    return {
      due: stats.dueToday + stats.reviewedToday,
      done: stats.reviewedToday,
      remaining: stats.dueToday,
      streak,
      weekMinutes,
      tagCount,
    };
  }

  getForecast7D(): ForecastDay[] {
    const upcoming = this.dataStore.getUpcomingDue(7);
    const t = today();
    return upcoming.map((u) => ({
      date: u.date,
      label: u.date.slice(8, 10),
      count: u.count,
      isToday: u.date === t,
    }));
  }

  getTodayProgress(): TodayProgress {
    const t = today();
    const stats = this.dataStore.getStats(t);
    return { done: stats.reviewedToday, total: stats.dueToday + stats.reviewedToday };
  }

  getMaturity(): MaturityData {
    const dist = this.dataStore.getMaturityDistribution();
    return { new: dist.new, learning: dist.learning, mature: dist.mature };
  }

  getRatingsDistribution(days?: number): RatingsData {
    const dist = this.dataStore.getRatingDistribution(days);
    const total = dist.again + dist.hard + dist.good + dist.easy;
    if (total === 0) {
      return { again: 0, hard: 0, good: 0, easy: 0, againPct: 0, hardPct: 0, goodPct: 0, easyPct: 0 };
    }
    return {
      again: dist.again,
      hard: dist.hard,
      good: dist.good,
      easy: dist.easy,
      againPct: Math.round((dist.again / total) * 100),
      hardPct: Math.round((dist.hard / total) * 100),
      goodPct: Math.round((dist.good / total) * 100),
      easyPct: Math.round((dist.easy / total) * 100),
    };
  }

  get12WeekHeatmap(): number[] {
    const cells: number[] = [];
    const now = new Date();
    // Start from 12 weeks (84 days) ago, align to Monday
    const dayOfWeek = now.getDay(); // 0=Sun..6=Sat
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startDate = addDays(now, -(83 + mondayOffset));

    // Collect review counts per day
    const history = this.dataStore.getReviewHistory(84 + mondayOffset);
    const dateMap = new Map<string, number>();
    for (const h of history) {
      dateMap.set(h.date, h.count);
    }

    // Fill 84 cells (12 cols x 7 rows), column-major
    for (let col = 0; col < 12; col++) {
      for (let row = 0; row < 7; row++) {
        const d = addDays(startDate, col * 7 + row);
        const count = dateMap.get(formatDate(d)) ?? 0;
        // Map count to 0..4 intensity
        let intensity: number;
        if (count === 0) intensity = 0;
        else if (count <= 5) intensity = 1;
        else if (count <= 15) intensity = 2;
        else if (count <= 30) intensity = 3;
        else intensity = 4;
        cells.push(intensity);
      }
    }
    return cells;
  }

  getTopTags(limit: number = 8): TagSummary[] {
    const tagMap = new Map<string, number>();
    const cards = this.dataStore.getAllCards();
    for (const card of Object.values(cards)) {
      if (card.disabled) continue;
      for (const tag of card.tags) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(tagMap.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // ── Decks ───────────────────────────────────────────────

  getDeckTree(): DeckNode[] {
    const cards = this.dataStore.getAllCards();
    const t = today();

    // Build a map of tag → { count, due, new, lastReviewed }
    interface TagAgg { count: number; due: number; newCount: number; lastReviewed: string }
    const tagAgg = new Map<string, TagAgg>();
    for (const card of Object.values(cards)) {
      if (card.disabled) continue;
      for (const tag of card.tags) {
        if (!tagAgg.has(tag)) tagAgg.set(tag, { count: 0, due: 0, newCount: 0, lastReviewed: '' });
        const agg = tagAgg.get(tag)!;
        agg.count++;
        if (card.due <= t) agg.due++;
        if (card.reviewCount === 0) agg.newCount++;
        if (card.lastReviewed > agg.lastReviewed) agg.lastReviewed = card.lastReviewed;
      }
    }

    // Build tree
    interface RawNode {
      name: string;
      fullTag: string;
      count: number;
      due: number;
      newCount: number;
      lastReviewed: string;
      children: Map<string, RawNode>;
    }

    const root = new Map<string, RawNode>();

    for (const [tag, agg] of tagAgg) {
      const parts = tag.split('/');
      let level = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const fullTag = parts.slice(0, i + 1).join('/');
        if (!level.has(part)) {
          level.set(part, {
            name: part,
            fullTag,
            count: 0,
            due: 0,
            newCount: 0,
            lastReviewed: '',
            children: new Map(),
          });
        }
        const node = level.get(part)!;
        // Only add counts at leaf level to avoid double-counting
        if (i === parts.length - 1) {
          node.count += agg.count;
          node.due += agg.due;
          node.newCount += agg.newCount;
          if (agg.lastReviewed > node.lastReviewed) node.lastReviewed = agg.lastReviewed;
        }
        level = node.children;
      }
    }

    // Recursively sum children counts and convert to DeckNode[]
    const convert = (map: Map<string, RawNode>): DeckNode[] => {
      return Array.from(map.values()).map((n) => {
        const children = convert(n.children);
        const childCount = children.reduce((a, c) => a + c.count, 0);
        const childDue = children.reduce((a, c) => a + c.due, 0);
        const childNew = children.reduce((a, c) => a + c.newCount, 0);
        const childLastReviewed = children.reduce(
          (a, c) => c.lastReviewed > a ? c.lastReviewed : a, ''
        );
        const lastReviewed = n.lastReviewed > childLastReviewed
          ? n.lastReviewed : childLastReviewed;
        return {
          id: n.fullTag,
          name: n.name,
          fullTag: n.fullTag,
          count: n.count + childCount,
          due: n.due + childDue,
          newCount: n.newCount + childNew,
          mode: 'auto' as const,
          children,
          lastReviewed,
        };
      });
    };

    const tree = convert(root);

    // Populate strategy names for top-level decks
    for (const node of tree) {
      node.strategyName = this.resolveStrategyName(node.fullTag);
    }

    return tree;
  }

  // ── Stats ───────────────────────────────────────────────

  getStatsKPI(days: number): StatsKPI {
    const cur = this.computeKPIRaw(days);
    // Compute previous period for delta comparison
    const prev = this.computeKPIRaw(days * 2);
    // prev covers 2x the window — subtract current to get prior period
    const prevReviewed = prev.reviewed - cur.reviewed;
    const prevMinutes = prev.studyMinutes - cur.studyMinutes;
    const prevActive = prev.activeDays - cur.activeDays;

    const hasPrev = prevReviewed > 0 || prevMinutes > 0;

    return {
      ...cur,
      reviewedDelta: hasPrev && prevReviewed > 0
        ? Math.round(((cur.reviewed - prevReviewed) / prevReviewed) * 100)
        : null,
      studyMinutesDelta: hasPrev && prevMinutes > 0
        ? Math.round(((cur.studyMinutes - prevMinutes) / prevMinutes) * 100)
        : null,
      activeDaysDelta: hasPrev
        ? cur.activeDays - prevActive
        : null,
      accuracyDelta: null, // Accuracy delta needs per-period rating split; deferred
    };
  }

  private computeKPIRaw(days: number): { reviewed: number; studyMinutes: number; activeDays: number; accuracy: number } {
    const history = this.dataStore.getReviewHistory(days);
    const studyTime = this.dataStore.getDailyStudyTime(days);
    const ratings = this.dataStore.getRatingDistribution(days);

    const reviewed = history.reduce((a, h) => a + h.count, 0);
    const studyMinutes = Math.round(
      studyTime.reduce((a, s) => a + s.ms, 0) / 60000
    );
    const activeDays = history.filter((h) => h.count > 0).length;
    const totalRatings = ratings.again + ratings.hard + ratings.good + ratings.easy;
    const accuracy =
      totalRatings === 0
        ? 0
        : Math.round(((ratings.good + ratings.easy) / totalRatings) * 100);

    return { reviewed, studyMinutes, activeDays, accuracy };
  }

  getReviewTrend(days: number): Array<{ date: string; count: number }> {
    return this.dataStore.getReviewHistory(days);
  }

  getAccuracyByTag(): AccuracyByTag[] {
    const logs = this.getAllReviewLogs();
    const cards = this.dataStore.getAllCards();

    // Group logs by tag
    const tagStats = new Map<string, { good: number; total: number }>();
    for (const log of logs) {
      const card = cards[log.cardId];
      if (!card || card.disabled) continue;
      for (const tag of card.tags) {
        if (!tagStats.has(tag)) tagStats.set(tag, { good: 0, total: 0 });
        const s = tagStats.get(tag)!;
        s.total++;
        if (log.rating === 'good' || log.rating === 'easy') s.good++;
      }
    }

    return Array.from(tagStats.entries())
      .map(([tag, s]) => ({
        tag,
        accuracy: s.total === 0 ? 0 : Math.round((s.good / s.total) * 100),
        reviewCount: s.total,
      }))
      .sort((a, b) => b.reviewCount - a.reviewCount);
  }

  /**
   * Forgetting curve: at each interval bucket, what % of reviews were good/easy.
   * Buckets: 1, 2, 4, 7, 14, 30, 60, 90 days.
   */
  getForgettingCurve(): ForgettingPoint[] {
    const logs = this.getAllReviewLogs();
    const cards = this.dataStore.getAllCards();
    const buckets = [1, 2, 4, 7, 14, 30, 60, 90];
    const bucketStats = buckets.map(() => ({ good: 0, total: 0 }));

    for (const log of logs) {
      const card = cards[log.cardId];
      if (!card) continue;
      // Use the card's interval at review time as the bucket selector.
      // The interval before this review is approximately the current interval
      // divided by the ease, but we don't have historical snapshots.
      // Best approximation: use the card's current interval.
      const interval = card.interval;
      // Find nearest bucket
      let bestIdx = 0;
      let bestDist = Math.abs(interval - buckets[0]);
      for (let i = 1; i < buckets.length; i++) {
        const dist = Math.abs(interval - buckets[i]);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      bucketStats[bestIdx].total++;
      if (log.rating === 'good' || log.rating === 'easy') {
        bucketStats[bestIdx].good++;
      }
    }

    return buckets
      .map((d, i) => ({
        intervalDays: d,
        retention: bucketStats[i].total === 0
          ? 0
          : Math.round((bucketStats[i].good / bucketStats[i].total) * 100),
        sampleSize: bucketStats[i].total,
      }))
      .filter((p) => p.sampleSize > 0);
  }

  getStudyMinutesTrend(days: number): Array<{ date: string; minutes: number }> {
    return this.dataStore.getDailyStudyTime(days).map((d) => ({
      date: d.date,
      minutes: Math.round(d.ms / 60000),
    }));
  }

  // ── SRS params ──────────────────────────────────────────

  getSrsParams(): SrsParams {
    return this.dataStore.getSrsParams();
  }

  /** Resolve SRS params for a specific card based on its primary deck. */
  getSrsParamsForCard(cardId: string, card: CardData): SrsParams {
    const overrides = this.dataStore.getDeckSrsOverrides();
    if (Object.keys(overrides).length === 0) return this.getSrsParams();

    const primaryDeck = this.getPrimaryDeck(cardId, card);
    const override = overrides[primaryDeck];
    if (!override) return this.getSrsParams();

    if (typeof override === 'string') return this.resolvePresetParams(override);
    return override;
  }

  /** Determine the primary deck (top-level tag) for a card based on review frequency. */
  getPrimaryDeck(cardId: string, card: CardData): string {
    if (card.reviewCount === 0) {
      return card.tags[0]?.split('/')[0] ?? '';
    }
    if (!this.primaryDeckCache) {
      this.primaryDeckCache = this.buildPrimaryDeckCache();
    }
    return this.primaryDeckCache.get(cardId) ?? card.tags[0]?.split('/')[0] ?? '';
  }

  invalidatePrimaryDeckCache(): void {
    this.primaryDeckCache = null;
  }

  private buildPrimaryDeckCache(): Map<string, string> {
    const logs = this.dataStore.getReviewLogs();
    const cards = this.dataStore.getAllCards();

    const cardTagCounts = new Map<string, Map<string, number>>();
    for (const log of logs) {
      const card = cards[log.cardId];
      if (!card) continue;
      if (!cardTagCounts.has(log.cardId)) cardTagCounts.set(log.cardId, new Map());
      const tagMap = cardTagCounts.get(log.cardId)!;
      for (const tag of card.tags) {
        const topTag = tag.split('/')[0];
        tagMap.set(topTag, (tagMap.get(topTag) ?? 0) + 1);
      }
    }

    const result = new Map<string, string>();
    for (const [cardId, tagMap] of cardTagCounts) {
      let maxTag = '';
      let maxCount = 0;
      for (const [tag, count] of tagMap) {
        if (count > maxCount) { maxCount = count; maxTag = tag; }
      }
      if (maxTag) result.set(cardId, maxTag);
    }
    return result;
  }

  private resolvePresetParams(presetId: string): SrsParams {
    const allPresets = [
      ...BUILTIN_PRESETS,
      ...(this.dataStore.getSettings().customPresets ?? []),
    ];
    const preset = allPresets.find(p => p.id === presetId);
    return preset?.params ?? this.getSrsParams();
  }

  /** Resolve display name for a deck's strategy override. */
  resolveStrategyName(deckTag: string): string {
    const overrides = this.dataStore.getDeckSrsOverrides();
    const override = overrides[deckTag];
    if (!override) return '全局默认';
    if (typeof override === 'string') {
      const allPresets = [...BUILTIN_PRESETS, ...(this.dataStore.getSettings().customPresets ?? [])];
      return allPresets.find(p => p.id === override)?.name ?? '全局默认';
    }
    return '自定义';
  }

  async setDeckStrategy(deckTag: string, value: string | SrsParams | null): Promise<void> {
    const overrides = { ...this.dataStore.getDeckSrsOverrides() };
    if (value === null) {
      delete overrides[deckTag];
    } else {
      overrides[deckTag] = value;
    }
    await this.dataStore.updateSettings({ deckSrsOverrides: overrides });
  }

  async resetDeckCards(deckTag: string, mode: DeckResetMode, newParams: SrsParams): Promise<void> {
    if (mode === 'gradual') return;

    const cards = this.dataStore.getAllCards();
    const t = today();
    const updates: Array<{ id: string; patch: Partial<CardData> }> = [];

    for (const [id, card] of Object.entries(cards)) {
      if (card.disabled) continue;
      const primary = this.getPrimaryDeck(id, card);
      if (primary !== deckTag) continue;

      if (mode === 'reset-ease') {
        updates.push({ id, patch: { ease: newParams.initialEase } });
      } else if (mode === 'full-reset') {
        updates.push({ id, patch: {
          ease: newParams.initialEase,
          interval: 0,
          due: t,
          reviewCount: 0,
        }});
      }
    }

    this.dataStore.bulkUpdateCards(updates);
    await this.dataStore.save();
    this.primaryDeckCache = null;
  }

  // ── Review (launch pad) ─────────────────────────────────

  getDueCards(): CardEntry[] {
    return this.dataStore.getDueCards(today());
  }

  /** Count of due cards that have never been reviewed (reviewCount === 0). */
  getDueNewCount(): number {
    return this.getDueCards().filter((e) => e.card.reviewCount === 0).length;
  }

  getDueCardsByTag(tag: string): CardEntry[] {
    const t = today();
    return this.dataStore.getCardsByTag(tag).filter((e) => e.card.due <= t);
  }

  getRecentSessions(limit: number = 7): ReviewSession[] {
    const logs = this.getAllReviewLogs();
    const cards = this.dataStore.getAllCards();
    const sessionMap = new Map<string, {
      count: number;
      ms: number;
      ratings: Record<Rating, number>;
      tagCounts: Map<string, number>;
    }>();

    for (const log of logs) {
      const date = log.timestamp.slice(0, 10);
      if (!sessionMap.has(date)) {
        sessionMap.set(date, {
          count: 0, ms: 0,
          ratings: { again: 0, hard: 0, good: 0, easy: 0 },
          tagCounts: new Map(),
        });
      }
      const s = sessionMap.get(date)!;
      s.count++;
      s.ms += log.elapsed;
      s.ratings[log.rating]++;
      // Collect top-level tags for scope
      const card = cards[log.cardId];
      if (card) {
        for (const tag of card.tags) {
          const topTag = tag.split('/')[0];
          s.tagCounts.set(topTag, (s.tagCounts.get(topTag) ?? 0) + 1);
        }
      }
    }

    return Array.from(sessionMap.entries())
      .map(([date, s]) => ({
        date,
        cards: s.count,
        minutes: Math.round(s.ms / 60000),
        ratings: s.count > 0 ? s.ratings : null,
        scope: Array.from(s.tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([tag]) => tag),
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  // ── Tags ────────────────────────────────────────────────

  getTagTree(): TagTreeNode[] {
    const cards = this.dataStore.getAllCards();
    const root: Record<string, { path: string; name: string; count: number; children: Record<string, any> }> = {};

    for (const card of Object.values(cards)) {
      if (card.disabled) continue;
      for (const tag of card.tags) {
        const parts = tag.split('/');
        let cur = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const path = parts.slice(0, i + 1).join('/');
          if (!cur[part]) {
            cur[part] = { path, name: part, count: 0, children: {} };
          }
          cur[part].count++;
          cur = cur[part].children;
        }
      }
    }

    const toArr = (obj: Record<string, any>): TagTreeNode[] =>
      Object.values(obj).map((n: any) => ({
        path: n.path,
        name: n.name,
        count: n.count,
        children: toArr(n.children),
      }));

    return toArr(root);
  }

  getCardsByTag(tag: string | null, search?: string): CardEntry[] {
    let entries: CardEntry[];
    if (tag) {
      entries = this.dataStore.getCardsByTag(tag);
    } else {
      // All active cards
      entries = Object.entries(this.dataStore.getAllCards())
        .filter(([, c]) => !c.disabled)
        .map(([id, card]) => ({ id, card }));
    }

    if (search) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.card.blockTitle.toLowerCase().includes(q) ||
          e.card.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return entries;
  }

  /** Accuracy for a tag, aggregating all sub-tags if it's a parent node. */
  getAccuracyForTag(tag: string): number | null {
    const all = this.getAccuracyByTag();
    // Collect this exact tag + any children (prefix match with /)
    const matches = all.filter(
      (a) => a.tag === tag || a.tag.startsWith(tag + '/')
    );
    if (matches.length === 0) return null;
    const totalReviews = matches.reduce((a, m) => a + m.reviewCount, 0);
    if (totalReviews === 0) return null;
    // Weighted average by review count
    const weightedSum = matches.reduce(
      (a, m) => a + m.accuracy * m.reviewCount, 0
    );
    return Math.round(weightedSum / totalReviews);
  }

  // ── Shared helpers ──────────────────────────────────────

  getTotalActiveCards(): number {
    return this.dataStore.getStats(today()).active;
  }

  /** Expose raw DataStore for ReviewModal (which takes DataStore directly). */
  getRawStore(): DataStore {
    return this.dataStore;
  }

  // ── Private ─────────────────────────────────────────────

  private computeStreak(): number {
    const logs = this.getAllReviewLogs();
    if (logs.length === 0) return 0;

    const reviewDates = new Set<string>();
    for (const log of logs) {
      reviewDates.add(log.timestamp.slice(0, 10));
    }

    let streak = 0;
    const d = new Date();
    const t = formatDate(d);

    if (reviewDates.has(t)) {
      // Reviewed today — count today, then check backwards from yesterday
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      // Not yet reviewed today — start checking from yesterday
      d.setDate(d.getDate() - 1);
    }

    // Count consecutive past days
    for (let i = 0; i < 365; i++) {
      const ds = formatDate(d);
      if (!reviewDates.has(ds)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }

    return streak;
  }

  private getWeekStudyMinutes(): number {
    const study = this.dataStore.getDailyStudyTime(7);
    return Math.round(study.reduce((a, s) => a + s.ms, 0) / 60000);
  }

  private getAllTagPaths(): string[] {
    const tags = new Set<string>();
    const cards = this.dataStore.getAllCards();
    for (const card of Object.values(cards)) {
      if (card.disabled) continue;
      for (const tag of card.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags);
  }

  private getAllReviewLogs(): ReviewLog[] {
    return this.dataStore.getReviewLogs();
  }
}
