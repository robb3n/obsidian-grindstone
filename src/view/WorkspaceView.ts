import { ItemView, WorkspaceLeaf } from 'obsidian';
import { GrindstoneStore } from '../store/GrindstoneStore';
import { CardManager } from '../card/card-manager';
import { ReviewEngine } from '../review/review-engine';
import { renderSidebar } from './Sidebar';
import { renderOverview } from './tabs/Overview';
import { renderReview } from './tabs/Review';
import { renderStats } from './tabs/Stats';
import { renderTags } from './tabs/Tags';

export const WORKSPACE_VIEW_TYPE = 'grindstone-workspace';

export type TabId = 'overview' | 'review' | 'stats' | 'tags';

export class GrindstoneWorkspaceView extends ItemView {
  private store: GrindstoneStore;
  private cardManager: CardManager;
  private startReviewModal: (tag?: string) => void;
  private activeTab: TabId = 'overview';
  private sidebarCollapsed = false;
  /** Auto-collapse driven by leaf width (≤ NARROW_THRESHOLD). Not persisted. */
  private narrowMode = false;
  /** Below this width the responsive layout breaks down — show a notice instead. */
  private tooNarrow = false;
  private resizeObserver: ResizeObserver | null = null;
  private rootEl!: HTMLElement;
  private mainEl!: HTMLElement;
  private sidebarEl!: HTMLElement;
  private noticeEl!: HTMLElement;
  private reviewEngine: ReviewEngine | null = null;
  private pendingTag: string | null = null;
  /** Cleanup hook returned by the active tab renderer (e.g. unloading a markdown Component). */
  private tabCleanup: (() => void) | null = null;

  private static readonly NARROW_THRESHOLD = 900;
  private static readonly TOO_NARROW_THRESHOLD = 560;

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

    // Restore collapsed state from settings
    this.sidebarCollapsed = !!this.store.getSettings().gsSidebarCollapsed;

    // Root element
    this.rootEl = container.createDiv({ cls: 'gs-app gs-root' });
    this.applyThemeOverride();

    // Sidebar rail
    this.sidebarEl = this.rootEl.createEl('aside', { cls: 'gs-rail' });

    // Main content area
    this.mainEl = this.rootEl.createDiv({ cls: 'gs-main' });

    // Too-narrow fallback notice (sibling of rail/main, toggled by class on .gs-app)
    this.noticeEl = this.rootEl.createDiv({ cls: 'gs-too-narrow' });
    this.renderNotice();

    this.setupResizeObserver();
    this.renderSidebar();
    this.renderActiveTab();
  }

  async onClose(): Promise<void> {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.runTabCleanup();
    this.contentEl.empty();
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      if (width <= 0) return;
      this.applyWidth(width);
    });
    this.resizeObserver.observe(this.rootEl);
    // Pre-sync flags + class so the first render uses the correct layout state.
    const initialWidth = this.rootEl.clientWidth;
    if (initialWidth > 0) {
      this.narrowMode = initialWidth <= GrindstoneWorkspaceView.NARROW_THRESHOLD;
      this.tooNarrow = initialWidth <= GrindstoneWorkspaceView.TOO_NARROW_THRESHOLD;
    }
    this.applyLayoutState();
  }

  private applyWidth(width: number): void {
    const nextNarrow = width <= GrindstoneWorkspaceView.NARROW_THRESHOLD;
    const nextTooNarrow = width <= GrindstoneWorkspaceView.TOO_NARROW_THRESHOLD;
    const narrowChanged = nextNarrow !== this.narrowMode;
    const tooNarrowChanged = nextTooNarrow !== this.tooNarrow;
    if (!narrowChanged && !tooNarrowChanged) return;
    this.narrowMode = nextNarrow;
    this.tooNarrow = nextTooNarrow;
    this.applyLayoutState();
    if (narrowChanged) this.renderSidebar();
  }

  private renderNotice(): void {
    this.noticeEl.empty();
    this.noticeEl.createDiv({ cls: 'gs-too-narrow-icon', text: '↔' });
    this.noticeEl.createDiv({ cls: 'gs-too-narrow-en gs-en', text: 'WIDEN VIEW' });
    this.noticeEl.createDiv({ cls: 'gs-too-narrow-title', text: '视图太窄' });
    this.noticeEl.createDiv({
      cls: 'gs-too-narrow-sub',
      text: '请拉宽窗口或减少分栏，让磨石有足够的空间展开。',
    });
  }

  private runTabCleanup(): void {
    if (!this.tabCleanup) return;
    try { this.tabCleanup(); } catch (err) { console.error('[Grindstone] Tab cleanup error:', err); }
    this.tabCleanup = null;
  }

  refresh(): void {
    this.renderSidebar();
    this.renderActiveTab();
  }

  navigateTo(tab: TabId, opts?: { tag?: string }): void {
    if (this.activeTab === tab && !opts?.tag) return;
    if (this.activeTab === 'review' && this.reviewEngine) {
      this.reviewEngine = null;
    }
    this.pendingTag = opts?.tag ?? null;
    this.activeTab = tab;
    this.renderSidebar();
    this.renderActiveTab();
  }

  private renderSidebar(): void {
    const collapsed = this.effectiveCollapsed();
    this.sidebarEl.empty();
    this.sidebarEl.toggleClass('gs-rail--collapsed', collapsed);
    renderSidebar(this.sidebarEl, {
      activeTab: this.activeTab,
      onNavigate: (tab) => this.navigateTo(tab),
      dueCount: this.store.getDueCards().length,
      streak: this.store.getOverviewStats().streak,
      freezes: this.store.getStreakFreezes(),
      onToggleTheme: () => this.toggleTheme(),
      themeMode: this.store.getSettings().gsTheme,
      isDark: this.isDark(),
      collapsed,
      onToggleCollapse: () => this.toggleSidebarCollapse(),
    });
  }

  private effectiveCollapsed(): boolean {
    return this.sidebarCollapsed || this.narrowMode;
  }

  private renderActiveTab(): void {
    this.runTabCleanup();
    this.mainEl.empty();
    const ctx = {
      store: this.store,
      cardManager: this.cardManager,
      app: this.app,
      onNavigate: (tab: TabId, opts?: { tag?: string }) => this.navigateTo(tab, opts),
      startReviewModal: this.startReviewModal,
      startInlineReview: (tag?: string) => this.doStartInlineReview(tag),
      getReviewEngine: () => this.reviewEngine,
      endInlineReview: () => this.doEndInlineReview(),
      refreshTab: () => this.renderActiveTab(),
    };

    try {
      let cleanup: (() => void) | void;
      switch (this.activeTab) {
        case 'overview': cleanup = renderOverview(this.mainEl, ctx); break;
        case 'review':   cleanup = renderReview(this.mainEl, ctx); break;
        case 'stats':    cleanup = renderStats(this.mainEl, ctx); break;
        case 'tags': {
          const tag = this.pendingTag;
          this.pendingTag = null;
          cleanup = renderTags(this.mainEl, ctx, tag ?? undefined);
          break;
        }
      }
      this.tabCleanup = cleanup ?? null;
    } catch (err) {
      console.error('[Grindstone] Tab render error:', err);
      this.renderErrorState(err);
    }
  }

  private doStartInlineReview(tag?: string): void {
    const queue = tag ? this.store.getDueCardsByTag(tag) : this.store.getDueCards();
    if (queue.length === 0) return;

    this.reviewEngine = new ReviewEngine(queue, this.store, this.cardManager);
    // Navigate to review tab and re-render
    this.activeTab = 'review';
    this.renderSidebar();
    this.renderActiveTab();
  }

  private doEndInlineReview(): void {
    this.reviewEngine = null;
    this.renderActiveTab();
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

  // ── Sidebar collapse ──────────────────────────────────

  private applyLayoutState(): void {
    this.rootEl.toggleClass('gs-app--collapsed', this.effectiveCollapsed());
    this.rootEl.toggleClass('gs-app--too-narrow', this.tooNarrow);
  }

  private toggleSidebarCollapse(): void {
    // Width-driven collapse is automatic — ignore manual toggle to keep
    // persisted state stable across narrow/wide transitions.
    if (this.narrowMode) return;
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.applyLayoutState();
    this.renderSidebar();
    this.store.updateSettings({ gsSidebarCollapsed: this.sidebarCollapsed });
  }

  // ── Theme ─────────────────────────────────────────────

  private isDark(): boolean {
    const settings = this.store.getSettings();
    if (settings.gsTheme === 'light') return false;
    if (settings.gsTheme === 'dark') return true;
    return document.body.classList.contains('theme-dark');
  }

  private applyThemeOverride(): void {
    const mode = this.store.getSettings().gsTheme;
    this.contentEl.classList.toggle('gs-force-dark', mode === 'dark');
    this.contentEl.classList.toggle('gs-force-light', mode === 'light');
  }

  private toggleTheme(): void {
    const current = this.store.getSettings().gsTheme;
    // Cycle: auto → dark → light → auto
    const next = !current ? 'dark' : current === 'dark' ? 'light' : undefined;
    this.store.updateSettings({ gsTheme: next as any });
    this.applyThemeOverride();
    this.renderSidebar();
  }
}
