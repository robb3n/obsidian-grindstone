import { CardState, Rating } from '../card/types';

const MIN_EASE = 1.3;
const EASE_STEP = 0.15;

/**
 * SM-2 scheduling – pure function.
 * Returns a new CardState with updated interval, ease, and reviewCount.
 */
export function schedule(state: CardState, rating: Rating): CardState {
  const reviewCount = state.reviewCount + 1;
  let ease = state.ease;
  let interval: number;

  switch (rating) {
    case 'easy':
      ease = state.ease + EASE_STEP;
      if (reviewCount <= 1) {
        interval = 4;
      } else if (reviewCount === 2) {
        interval = 6;
      } else {
        interval = Math.round(state.interval * ease);
      }
      break;

    case 'good':
      // ease unchanged
      if (reviewCount <= 1) {
        interval = 1;
      } else if (reviewCount === 2) {
        interval = 3;
      } else {
        interval = Math.round(state.interval * ease);
      }
      break;

    case 'hard':
      ease = Math.max(MIN_EASE, state.ease - EASE_STEP);
      if (reviewCount <= 1) {
        interval = 1;
      } else {
        interval = Math.max(1, Math.round(state.interval * 1.2));
      }
      break;
  }

  return { interval, ease, reviewCount };
}

export function initialCardState(): CardState {
  return { interval: 0, ease: 2.5, reviewCount: 0 };
}
