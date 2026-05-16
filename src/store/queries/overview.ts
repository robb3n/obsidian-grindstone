import { DataStore } from '../../storage/data-store';
import { formatDate, today, addDays } from '../../util/date';

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

export function getOverviewStats(ds: DataStore): OverviewStats {
  const t = today();
  const stats = ds.getStats(t);
  const streak = computeStreak(ds);
  const weekMinutes = getWeekStudyMinutes(ds);
  const tagCount = getAllTagPaths(ds).length;
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

export function getForecast7D(ds: DataStore): ForecastDay[] {
  const upcoming = ds.getUpcomingDue(7);
  const t = today();
  return upcoming.map((u) => ({
    date: u.date,
    label: u.date.slice(8, 10),
    count: u.count,
    isToday: u.date === t,
  }));
}

export function getTodayProgress(ds: DataStore): TodayProgress {
  const t = today();
  const stats = ds.getStats(t);
  return { done: stats.reviewedToday, total: stats.dueToday + stats.reviewedToday };
}

export function getMaturity(ds: DataStore): MaturityData {
  const dist = ds.getMaturityDistribution();
  return { new: dist.new, learning: dist.learning, mature: dist.mature };
}

export function getRatingsDistribution(ds: DataStore, days?: number): RatingsData {
  const dist = ds.getRatingDistribution(days);
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

export function get12WeekHeatmap(ds: DataStore): number[] {
  const cells: number[] = [];
  const now = new Date();
  // Start from 12 weeks (84 days) ago, align to Monday
  const dayOfWeek = now.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startDate = addDays(now, -(83 + mondayOffset));

  // Collect review counts per day
  const history = ds.getReviewHistory(84 + mondayOffset);
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

export interface WeeklyReviewTagStat {
  tag: string;
  accuracy: number;  // 0..100
  count: number;
}

export interface WeeklyReview {
  cardsThisWeek: number;
  cardsLastWeek: number;
  accuracyThisWeek: number | null;  // null when no data
  accuracyDelta: number | null;     // percentage points; null when either week empty
  bestTags: WeeklyReviewTagStat[];  // top-level deck tags, sorted by accuracy desc, max 3
  worstTags: WeeklyReviewTagStat[]; // sorted by accuracy asc, max 3
}

const WEEKLY_TAG_MIN_SAMPLE = 5;

export function getWeeklyReview(ds: DataStore): WeeklyReview {
  const logs = ds.getReviewLogs();
  const cards = ds.getAllCards();

  // Rolling 7-day windows ending today (lexicographic compare works on YYYY-MM-DD).
  const todayD = new Date();
  const todayStr = formatDate(todayD);
  const thisStart = formatDate(addDays(todayD, -6));
  const lastEnd = formatDate(addDays(todayD, -7));
  const lastStart = formatDate(addDays(todayD, -13));

  let thisCount = 0, thisGood = 0;
  let lastCount = 0, lastGood = 0;
  const tagStats = new Map<string, { good: number; total: number }>();

  for (const log of logs) {
    const date = log.timestamp.slice(0, 10);
    const isPass = log.rating === 'good' || log.rating === 'easy';

    if (date >= thisStart && date <= todayStr) {
      thisCount++;
      if (isPass) thisGood++;

      const card = cards[log.cardId];
      if (card && !card.disabled) {
        // One log → one rating per top-level deck (dedup if a card has multiple sub-tags
        // under the same deck — otherwise tag stats double-count).
        const decks = new Set<string>();
        for (const t of card.tags) {
          const top = t.split('/')[0];
          if (top) decks.add(top);
        }
        for (const deck of decks) {
          let s = tagStats.get(deck);
          if (!s) { s = { good: 0, total: 0 }; tagStats.set(deck, s); }
          s.total++;
          if (isPass) s.good++;
        }
      }
    } else if (date >= lastStart && date <= lastEnd) {
      lastCount++;
      if (isPass) lastGood++;
    }
  }

  const accuracyThis = thisCount > 0 ? Math.round((thisGood / thisCount) * 100) : null;
  const accuracyLast = lastCount > 0 ? Math.round((lastGood / lastCount) * 100) : null;
  const accuracyDelta = (accuracyThis !== null && accuracyLast !== null)
    ? accuracyThis - accuracyLast
    : null;

  const tagAcc: WeeklyReviewTagStat[] = [];
  for (const [tag, s] of tagStats) {
    if (s.total < WEEKLY_TAG_MIN_SAMPLE) continue;
    tagAcc.push({ tag, accuracy: Math.round((s.good / s.total) * 100), count: s.total });
  }
  tagAcc.sort((a, b) => b.accuracy - a.accuracy);

  const bestTags = tagAcc.slice(0, 3);
  // Skip tags already in bestTags so a small deck pool doesn't show the same
  // tag in both columns reversed.
  const bestSet = new Set(bestTags.map((t) => t.tag));
  const worstTags = tagAcc.slice().reverse().filter((t) => !bestSet.has(t.tag)).slice(0, 3);

  return {
    cardsThisWeek: thisCount,
    cardsLastWeek: lastCount,
    accuracyThisWeek: accuracyThis,
    accuracyDelta,
    bestTags,
    worstTags,
  };
}

export function getTopTags(ds: DataStore, limit = 8): TagSummary[] {
  const tagMap = new Map<string, number>();
  const cards = ds.getAllCards();
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

function computeStreak(ds: DataStore): number {
  const logs = ds.getReviewLogs();
  if (logs.length === 0) return 0;

  const reviewDates = new Set<string>();
  for (const log of logs) {
    reviewDates.add(log.timestamp.slice(0, 10));
  }

  // In non-strict mode, freeze-bridged days count as active. The sweep that
  // populates freezeUsedDates runs at plugin load (see ensureFreezeState).
  const settings = ds.getSettings();
  const freezeUsed = settings.strictStreakMode === true
    ? new Set<string>()
    : new Set(settings.freezeUsedDates ?? []);
  const isActive = (s: string) => reviewDates.has(s) || freezeUsed.has(s);

  let streak = 0;
  const d = new Date();
  const t = formatDate(d);

  if (isActive(t)) {
    streak++;
  }
  d.setDate(d.getDate() - 1);

  for (let i = 0; i < 365; i++) {
    const dStr = formatDate(d);
    if (!isActive(dStr)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

function getWeekStudyMinutes(ds: DataStore): number {
  const study = ds.getDailyStudyTime(7);
  return Math.round(study.reduce((a, s) => a + s.ms, 0) / 60000);
}

function getAllTagPaths(ds: DataStore): string[] {
  const tags = new Set<string>();
  const cards = ds.getAllCards();
  for (const card of Object.values(cards)) {
    if (card.disabled) continue;
    for (const tag of card.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}
