import { CardState, Rating, SrsParams, DEFAULT_SRS_PARAMS } from '../card/types';

/**
 * SM-2 scheduling – pure function.
 * Returns a new CardState with updated interval, ease, and reviewCount.
 */
export function schedule(
  state: CardState,
  rating: Rating,
  params: SrsParams = DEFAULT_SRS_PARAMS,
): CardState {
  const reviewCount = state.reviewCount + 1;
  let ease = state.ease;
  let interval: number;

  switch (rating) {
    case 'again':
      ease = Math.max(params.minEase, state.ease - params.againPenalty);
      interval = params.againInterval;
      break;

    case 'easy':
      ease = state.ease + params.easeBonus;
      if (reviewCount <= 1) {
        interval = params.easyInterval;
      } else if (reviewCount === 2) {
        interval = params.step2Interval;
      } else {
        interval = Math.round(state.interval * ease);
      }
      break;

    case 'good':
      ease = state.ease + params.easeGoodDelta;
      if (reviewCount <= 1) {
        interval = params.graduatingInterval;
      } else if (reviewCount === 2) {
        interval = params.step1Interval;
      } else {
        interval = Math.round(state.interval * ease);
      }
      break;

    case 'hard':
      ease = Math.max(params.minEase, state.ease - params.easeHardPenalty);
      if (reviewCount <= 1) {
        interval = params.graduatingInterval;
      } else {
        interval = Math.max(1, Math.round(state.interval * params.hardMultiplier));
      }
      break;
  }

  return { interval, ease, reviewCount };
}

export function initialCardState(params?: SrsParams): CardState {
  return { interval: 0, ease: (params ?? DEFAULT_SRS_PARAMS).initialEase, reviewCount: 0 };
}
