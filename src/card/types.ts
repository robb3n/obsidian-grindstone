export interface CardData {
  file: string;
  blockTitle: string;
  blockStartLine: number;
  tags: string[];
  interval: number;
  ease: number;
  due: string;          // ISO date string YYYY-MM-DD
  lastReviewed: string; // ISO date string YYYY-MM-DD
  reviewCount: number;
  createdAt: string;    // ISO date string YYYY-MM-DD
  disabled?: boolean;
}

export interface CardState {
  interval: number;
  ease: number;
  reviewCount: number;
}

export type Rating = 'hard' | 'good' | 'easy';

export type Maturity = 'new' | 'learning' | 'mature';

export interface StoreStats {
  total: number;
  active: number;
  disabled: number;
  dueToday: number;
  reviewedToday: number;
}

export interface MaturityDistribution {
  new: number;        // reviewCount === 0
  learning: number;   // interval < 21
  mature: number;     // interval >= 21
}

export interface ReviewLog {
  cardId: string;
  rating: Rating;
  timestamp: string;    // ISO datetime, e.g. "2026-05-08T14:30:00"
  elapsed: number;      // milliseconds from card display to rating click
}

export interface PluginData {
  version: number;
  settings: GrindstoneSettings;
  cards: Record<string, CardData>;
  reviewLogs: ReviewLog[];
}

export interface GrindstoneSettings {
  triggerTags: string[];
  excludeTags: string[];
  prefixMatch: boolean;
  writeStarsBack: boolean;
  autoShowTags: string[];
  /** Workspace theme: 'light' | 'dark' | undefined (follow Obsidian). */
  gsTheme?: 'light' | 'dark';
}

export const DEFAULT_SETTINGS: GrindstoneSettings = {
  triggerTags: ['#考研数学', '#408'],
  excludeTags: [],
  prefixMatch: true,
  writeStarsBack: true,
  autoShowTags: ['#Grind'],
};

export const DEFAULT_DATA: PluginData = {
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  cards: {},
  reviewLogs: [],
};
