import { App } from 'obsidian';
import { GrindstoneStore } from '../../store/GrindstoneStore';
import { CardManager } from '../../card/card-manager';
import { ReviewEngine } from '../../review/review-engine';
import { TabId } from '../WorkspaceView';

export interface TabContext {
  store: GrindstoneStore;
  cardManager: CardManager;
  app: App;
  onNavigate: (tab: TabId, opts?: { tag?: string }) => void;
  startReviewModal: (tag?: string) => void;
  /** Start inline review in the workspace Review tab. */
  startInlineReview: (tag?: string) => void;
  /** Get the active inline review engine (null if not reviewing). */
  getReviewEngine: () => ReviewEngine | null;
  /** End the inline review session and return to pre-flight. */
  endInlineReview: () => void;
  /** Re-render the current tab. */
  refreshTab: () => void;
}
