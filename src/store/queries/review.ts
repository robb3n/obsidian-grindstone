import { DataStore } from '../../storage/data-store';
import { CardData, Rating } from '../../card/types';
import { today } from '../../util/date';
import { MaturityData } from './overview';

export interface CardEntry {
  id: string;
  card: CardData;
}

export interface ReviewSession {
  date: string;
  cards: number;
  minutes: number;
  ratings: Record<Rating, number> | null;
  /** Top tags that appeared in this session's reviewed cards. */
  scope: string[];
}

export function getDueCards(ds: DataStore): CardEntry[] {
  return ds.getDueCards(today());
}

export function getDueBreakdown(ds: DataStore): MaturityData {
  const dist = ds.getDueBreakdown(today());
  return { new: dist.new, learning: dist.learning, mature: dist.mature };
}

export function getDueCardsByTag(ds: DataStore, tag: string): CardEntry[] {
  const t = today();
  return ds.getCardsByTag(tag).filter((e) => e.card.due <= t);
}

export function getRecentSessions(ds: DataStore, limit = 7): ReviewSession[] {
  const logs = ds.getReviewLogs();
  const cards = ds.getAllCards();
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
