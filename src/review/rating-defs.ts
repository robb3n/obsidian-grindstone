import { Rating } from '../card/types';

export interface RatingLabel {
  rating: Rating;
  zh: string;
  en: string;
  key: string;
}

export const RATING_LABELS: RatingLabel[] = [
  { rating: 'again', zh: '重来', en: 'Again', key: '1' },
  { rating: 'hard',  zh: '难',   en: 'Hard',  key: '2' },
  { rating: 'good',  zh: '可',   en: 'Good',  key: '3' },
  { rating: 'easy',  zh: '易',   en: 'Easy',  key: '4' },
];

export const RATING_KEY_MAP: Record<string, Rating> = {
  '1': 'again',
  '2': 'hard',
  '3': 'good',
  '4': 'easy',
};
