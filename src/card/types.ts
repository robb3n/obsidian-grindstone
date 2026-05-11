export interface CardData {
  file: string;
  blockTitle: string;
  blockStartLine?: number;
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

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface SrsParams {
  initialEase: number;
  minEase: number;
  easeBonus: number;
  easeGoodDelta: number;
  easeHardPenalty: number;
  againPenalty: number;
  hardMultiplier: number;
  graduatingInterval: number;
  easyInterval: number;
  againInterval: number;
  step1Interval: number;
  step2Interval: number;
}

export const DEFAULT_SRS_PARAMS: SrsParams = {
  initialEase: 2.5,
  minEase: 1.3,
  easeBonus: 0.15,
  easeGoodDelta: 0,
  easeHardPenalty: 0.15,
  againPenalty: 0.20,
  hardMultiplier: 1.2,
  graduatingInterval: 1,
  easyInterval: 4,
  againInterval: 0,
  step1Interval: 3,
  step2Interval: 6,
};

export interface SrsPreset {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  params: SrsParams;
  builtin: boolean;
}

export const BUILTIN_PRESETS: SrsPreset[] = [
  {
    id: 'sm2-default',
    name: '默认 SM-2',
    nameEn: 'Default SM-2',
    description: '经典 SM-2 参数，平衡记忆效率与复习压力',
    params: { ...DEFAULT_SRS_PARAMS },
    builtin: true,
  },
  {
    id: 'anki-standard',
    name: 'Anki 标准',
    nameEn: 'Anki Standard',
    description: '模拟 Anki 默认参数，适合从 Anki 迁移的用户',
    params: {
      ...DEFAULT_SRS_PARAMS,
      step1Interval: 6,
      step2Interval: 4,
    },
    builtin: true,
  },
  {
    id: 'high-frequency',
    name: '高频巩固',
    nameEn: 'High Frequency',
    description: '更短间隔、更严惩罚，适合考前冲刺或易遗忘内容',
    params: {
      initialEase: 2.2,
      minEase: 1.3,
      easeBonus: 0.10,
      easeGoodDelta: 0,
      easeHardPenalty: 0.20,
      againPenalty: 0.30,
      hardMultiplier: 1.1,
      graduatingInterval: 1,
      easyInterval: 3,
      againInterval: 0,
      step1Interval: 2,
      step2Interval: 4,
    },
    builtin: true,
  },
  {
    id: 'gentle',
    name: '轻松记忆',
    nameEn: 'Gentle Memory',
    description: '更长间隔、较轻惩罚，适合长线记忆或低压学习',
    params: {
      initialEase: 2.7,
      minEase: 1.5,
      easeBonus: 0.20,
      easeGoodDelta: 0.05,
      easeHardPenalty: 0.10,
      againPenalty: 0.15,
      hardMultiplier: 1.3,
      graduatingInterval: 2,
      easyInterval: 5,
      againInterval: 1,
      step1Interval: 4,
      step2Interval: 8,
    },
    builtin: true,
  },
];

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
  embedCardIds: boolean;
  autoShowTags: string[];
  /** Workspace theme: 'light' | 'dark' | undefined (follow Obsidian). */
  gsTheme?: 'light' | 'dark';
  /** Whether the sidebar rail is collapsed to icon-only mode. */
  gsSidebarCollapsed?: boolean;
  /** SRS algorithm parameters. Falls back to DEFAULT_SRS_PARAMS when absent. */
  srsParams?: SrsParams;
  /** User-created custom presets. */
  customPresets?: SrsPreset[];
  /** Active preset ID ('sm2-default', 'anki-standard', etc. or custom). */
  activePresetId?: string;
  /** Per-deck SRS strategy overrides. Key = top-level tag. Value = preset ID or custom SrsParams. */
  deckSrsOverrides?: Record<string, string | SrsParams>;
}

export type DeckResetMode = 'gradual' | 'reset-ease' | 'full-reset';

export const DEFAULT_SETTINGS: GrindstoneSettings = {
  triggerTags: ['#考研数学', '#408'],
  excludeTags: [],
  prefixMatch: true,
  writeStarsBack: true,
  embedCardIds: true,
  autoShowTags: ['#Grind'],
};

export const DEFAULT_DATA: PluginData = {
  version: 2,
  settings: { ...DEFAULT_SETTINGS },
  cards: {},
  reviewLogs: [],
};
