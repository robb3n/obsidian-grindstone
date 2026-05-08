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

export interface PluginData {
  version: number;
  settings: GrindstoneSettings;
  cards: Record<string, CardData>;
}

export interface GrindstoneSettings {
  triggerTags: string[];
  excludeTags: string[];
  prefixMatch: boolean;
  writeStarsBack: boolean;
}

export const DEFAULT_SETTINGS: GrindstoneSettings = {
  triggerTags: ['#考研数学', '#408'],
  excludeTags: [],
  prefixMatch: true,
  writeStarsBack: true,
};

export const DEFAULT_DATA: PluginData = {
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  cards: {},
};
