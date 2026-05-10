import { ItemView, WorkspaceLeaf } from 'obsidian';
import { GrindstoneStore } from '../store/GrindstoneStore';
import { CardManager } from '../card/card-manager';
import { renderSidebar } from './Sidebar';
import { renderOverview } from './tabs/Overview';
import { renderDecks } from './tabs/Decks';
import { renderReview } from './tabs/Review';
import { renderStats } from './tabs/Stats';
import { renderTags } from './tabs/Tags';

export const WORKSPACE_VIEW_TYPE = 'grindstone-workspace';

export type TabId = 'overview' | 'decks' | 'review' | 'stats' | 'tags';

export class GrindstoneWorkspaceView extends ItemView {
  private store: GrindstoneStore;
  private cardManager: CardManager;
  private startReviewModal: (tag?: string) => void;
  private activeTab: TabId = 'overview';
  private rootEl!: HTMLElement;
  private mainEl!: HTMLElement;
  private sidebarEl!: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    store: GrindstoneStore,
    cardManager: CardManager,
    startReviewModal: (tag?: string) => void,
  ) {
    super(leaf);
    this.store = store;
    this.cardManager = cardManager;
    this.startReviewModal = startReviewModal;
  }

  getViewType(): string {
    return WORKSPACE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Grindstone';
  }

  getIcon(): string {
    return 'layout-dashboard';
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass('grindstone-workspace');

    // Root element
    this.rootEl = container.createDiv({ cls: 'gs-app gs-root' });
    this.applyThemeOverride();

    // Sidebar rail
    this.sidebarEl = this.rootEl.createEl('aside', { cls: 'gs-rail' });

    // Main content area
    this.mainEl = this.rootEl.createDiv({ cls: 'gs-main' });

    this.renderSidebar();
    this.renderActiveTab();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  refresh(): void {
    this.renderSidebar();
    this.renderActiveTab();
  }

  navigateTo(tab: TabId): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.renderSidebar();
    this.renderActiveTab();
  }

  private renderSidebar(): void {
    this.sidebarEl.empty();
    renderSidebar(this.sidebarEl, {
      activeTab: this.activeTab,
      onNavigate: (tab) => this.navigateTo(tab),
      dueCount: this.store.getDueCards().length,
      streak: this.store.getOverviewStats().streak,
      onToggleTheme: () => this.toggleTheme(),
      themeMode: this.store.getRawStore().getSettings().gsTheme,
      isDark: this.isDark(),
    });
  }

  private renderActiveTab(): void {
    this.mainEl.empty();
    const ctx = {
      store: this.store,
      cardManager: this.cardManager,
      app: this.app,
      onNavigate: (tab: TabId) => this.navigateTo(tab),
      startReviewModal: this.startReviewModal,
    };

    try {
      switch (this.activeTab) {
        case 'overview': renderOverview(this.mainEl, ctx); break;
        case 'decks':    renderDecks(this.mainEl, ctx); break;
        case 'review':   renderReview(this.mainEl, ctx); break;
        case 'stats':    renderStats(this.mainEl, ctx); break;
        case 'tags':     renderTags(this.mainEl, ctx); break;
      }
    } catch (err) {
      console.error('[Grindstone] Tab render error:', err);
      this.renderErrorState(err);
    }
  }

  private renderErrorState(err: unknown): void {
    this.mainEl.empty();
    const errorDiv = this.mainEl.createDiv({ cls: 'gs-error-state' });
    const icon = errorDiv.createDiv({ cls: 'gs-error-icon' });
    icon.textContent = '!';
    errorDiv.createDiv({ cls: 'gs-error-title', text: '数据加载失败' });
    errorDiv.createDiv({ cls: 'gs-error-sub', text: String(err) });
    const retry = errorDiv.createEl('button', { cls: 'gs-error-retry', text: '重试' });
    retry.addEventListener('click', () => this.renderActiveTab());
  }

  // ── Theme ─────────────────────────────────────────────

  private isDark(): boolean {
    const settings = this.store.getRawStore().getSettings();
    if (settings.gsTheme === 'light') return false;
    if (settings.gsTheme === 'dark') return true;
    return document.body.classList.contains('theme-dark');
  }

  private applyThemeOverride(): void {
    const mode = this.store.getRawStore().getSettings().gsTheme;
    this.contentEl.classList.toggle('gs-force-dark', mode === 'dark');
    this.contentEl.classList.toggle('gs-force-light', mode === 'light');
  }

  private toggleTheme(): void {
    const current = this.store.getRawStore().getSettings().gsTheme;
    // Cycle: auto → dark → light → auto
    const next = !current ? 'dark' : current === 'dark' ? 'light' : undefined;
    this.store.getRawStore().updateSettings({ gsTheme: next as any });
    this.applyThemeOverride();
    this.renderSidebar();
  }
}
