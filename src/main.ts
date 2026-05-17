import { Plugin, TFile, TAbstractFile, Notice } from 'obsidian';
import { DataStore } from './storage/data-store';
import { CardManager } from './card/card-manager';
import { GrindstoneStore } from './store/GrindstoneStore';
import { ReviewModal } from './view/review-modal';
import { GrindstoneWorkspaceView, WORKSPACE_VIEW_TYPE } from './view/WorkspaceView';
import { addRibbonIcon } from './view/ribbon';
import { OnboardingModal } from './view/onboarding-modal';
import { GrindstoneSettingTab } from './settings/settings-tab';
import { setLang, detectSystemLang } from './i18n';

export default class GrindstonePlugin extends Plugin {
  store!: DataStore;
  gsStore!: GrindstoneStore;
  cardManager!: CardManager;

  async onload(): Promise<void> {
    this.store = new DataStore(this);
    await this.store.load();

    // Initialize i18n before any view renders. Persisted setting wins; otherwise
    // fall back to the OS language so first-launch users see their native tongue.
    setLang(this.store.getSettings().language ?? detectSystemLang());

    this.gsStore = new GrindstoneStore(this.store);
    this.cardManager = new CardManager(
      this.app,
      this.store,
      () => this.gsStore.invalidatePrimaryDeckCache(),
    );

    // Daily streak-freeze sweep: grant weekly +1 (Monday cap 2) and bridge
    // gap days since last review. No-op in strict mode.
    await this.gsStore.ensureFreezeState();

    // Register workspace view
    this.registerView(
      WORKSPACE_VIEW_TYPE,
      (leaf) => new GrindstoneWorkspaceView(
        leaf, this.gsStore, this.cardManager,
        (tag?: string) => this.startReviewModal(tag),
      ),
    );

    // Full scan once layout is ready — gated behind first-run onboarding.
    this.app.workspace.onLayoutReady(() => this.runStartup());

    // Incremental update on metadata change (skip re-entrant scans from ID embedding).
    // Both scan and save are debounced — without per-file scan coalescing, every
    // keystroke in a large file would re-parse the whole file.
    this.registerEvent(
      this.app.metadataCache.on('changed', (file: TFile) => {
        if (this.cardManager.isWritingIds(file.path)) return;
        this.cardManager.scanFileDebounced(file);
      }),
    );

    // Handle renames
    this.registerEvent(
      this.app.vault.on('rename', async (file: TAbstractFile, oldPath: string) => {
        if (file instanceof TFile) {
          this.cardManager.handleRename(oldPath, file.path);
          this.store.saveDebounced();
        }
      }),
    );

    // Handle deletions
    this.registerEvent(
      this.app.vault.on('delete', async (file: TAbstractFile) => {
        if (file instanceof TFile) {
          this.cardManager.handleDelete(file.path);
          this.store.saveDebounced();
        }
      }),
    );

    // Command: Start Review (Modal)
    this.addCommand({
      id: 'start-review',
      name: 'Start Review',
      callback: () => this.startReviewModal(),
    });

    // Command: Open Workspace
    this.addCommand({
      id: 'open-workspace',
      name: 'Open Workspace',
      callback: () => this.activateWorkspace(),
    });

    // Ribbon icon → open workspace
    addRibbonIcon(
      this,
      () => this.getDueCount(),
      () => this.activateWorkspace(),
    );

    // Settings tab
    this.addSettingTab(new GrindstoneSettingTab(this.app, this));

    // Load user fonts
    this.app.workspace.onLayoutReady(() => this.loadUserFonts());
  }

  /**
   * Decide whether to show the onboarding modal before the first scan.
   * Upgrading users (have cards or logs but no flag) get auto-marked done.
   */
  private async runStartup(): Promise<void> {
    const settings = this.store.getSettings();
    const hasExistingData =
      Object.keys(this.store.getAllCards()).length > 0 ||
      this.store.getReviewLogs().length > 0;

    if (!settings._onboardingDone) {
      if (hasExistingData) {
        await this.store.updateSettings({ _onboardingDone: true });
      } else {
        new OnboardingModal(this.app, this.store, async (accepted) => {
          if (accepted) {
            await this.runFirstScan();
          } else {
            // User dismissed without committing — disable & persist so the
            // toggle in Community Plugins reflects "off" and survives restart.
            // `_onboardingDone` stays unset, so the prompt fires again on
            // re-enable. Use *AndSave variant: the plain `disablePlugin` only
            // unloads in memory and leaves community-plugins.json untouched.
            await this.disableSelf();
          }
        }).open();
        return;
      }
    }
    await this.runFirstScan();
  }

  /**
   * Disable & persist this plugin from within itself. The internal
   * Settings → Community Plugins list does not auto-rerender on programmatic
   * disable, so we explicitly nudge it after the call. Visible Notice gives
   * the user feedback that the dismissal was honored.
   */
  private async disableSelf(): Promise<void> {
    new Notice('Grindstone disabled. Re-enable in Settings → Community plugins to start over.', 5000);
    const plugins = (this.app as any).plugins;
    await plugins.disablePluginAndSave(this.manifest.id);
    // Re-render community-plugins tab if it's the active settings tab — the
    // toggle UI is otherwise stale until the user clicks away and back.
    const setting = (this.app as any).setting;
    if (setting?.activeTab?.id === 'community-plugins') {
      try { setting.openTabById('community-plugins'); } catch { /* noop */ }
    }
  }

  private async runFirstScan(): Promise<void> {
    if (this.store.needsMigration() && this.store.getSettings().embedCardIds) {
      console.log('[Grindstone] Migrating to embedded card IDs...');
      const result = await this.cardManager.migrateToEmbeddedIds();
      this.store.setVersion(2);
      await this.store.save();
      console.log(`[Grindstone] Migration complete: ${result.migrated} migrated, ${result.failed} failed`);
    }

    await this.cardManager.fullScan();
    console.log(
      `[Grindstone] Full scan complete. Cards: ${Object.keys(this.store.getAllCards()).length}`,
    );
  }

  /** Scan fonts-user/ directory and register any found fonts as Grindstone-User. */
  private async loadUserFonts(): Promise<void> {
    const fontDir = `${this.manifest.dir}/fonts-user`;
    if (!(await this.app.vault.adapter.exists(fontDir))) return;
    const list = await this.app.vault.adapter.list(fontDir);
    const fontFiles = list.files.filter(f => /\.(woff2?|ttf|otf)$/i.test(f));
    if (fontFiles.length === 0) return;

    // Remove previously injected style if any
    document.getElementById('grindstone-user-fonts')?.remove();

    const style = document.createElement('style');
    style.id = 'grindstone-user-fonts';
    style.textContent = fontFiles.map(path => `
      @font-face {
        font-family: 'Grindstone-User';
        src: url('app://obsidian.md/${path}');
        font-display: swap;
      }
    `).join('\n');
    document.head.appendChild(style);
    console.log(`[Grindstone] Loaded ${fontFiles.length} user font(s)`);
  }

  private getDueCount(): number {
    return this.gsStore.getDueCards().length;
  }

  private startReviewModal(tag?: string): void {
    const queue = tag ? this.gsStore.getDueCardsByTag(tag) : this.gsStore.getDueCards();
    new ReviewModal(this.app, queue, this.cardManager, this.gsStore).open();
  }

  /** Re-render every open Grindstone workspace view (used after settings changes that affect display). */
  refreshAllWorkspaceViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE)) {
      (leaf.view as GrindstoneWorkspaceView).refresh();
    }
  }

  /**
   * Wipe all SRS state (cards + logs + streak/freeze counts) while keeping
   * user settings. Re-scans the vault so cards are rediscovered as fresh
   * entries, then refreshes any open workspace views.
   */
  async resetLearningData(): Promise<void> {
    await this.store.resetLearningData();
    this.gsStore.invalidatePrimaryDeckCache();
    await this.cardManager.fullScan();
    this.refreshAllWorkspaceViews();
  }

  private async activateWorkspace(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      (existing[0].view as GrindstoneWorkspaceView).refresh();
    } else {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: WORKSPACE_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }

    // Collapse Obsidian sidebars to give the workspace full width
    (this.app.workspace as any).leftSplit?.collapse();
    (this.app.workspace as any).rightSplit?.collapse();
  }

  async onunload(): Promise<void> {
    this.cardManager?.dispose();
    await this.store.flushSave();
  }
}
