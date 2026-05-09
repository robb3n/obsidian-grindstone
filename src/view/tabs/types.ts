import { App } from 'obsidian';
import { GrindstoneStore } from '../../store/GrindstoneStore';
import { CardManager } from '../../card/card-manager';
import { TabId } from '../WorkspaceView';

export interface TabContext {
  store: GrindstoneStore;
  cardManager: CardManager;
  app: App;
  onNavigate: (tab: TabId) => void;
  startReviewModal: (tag?: string) => void;
}
