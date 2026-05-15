import { Plugin, TFile, TAbstractFile } from 'obsidian';
import { DataStore } from './storage/data-store';
import { CardManager } from './card/card-manager';
import { GrindstoneStore } from './store/GrindstoneStore';
import { ReviewModal } from './view/review-modal';
import { GrindstoneWorkspaceView, WORKSPACE_VIEW_TYPE } from './view/WorkspaceView';
import { addRibbonIcon } from './view/ribbon';
import { GrindstoneSettingTab } from './settings/settings-tab';

export default class GrindstonePlugin extends Plugin {
  store!: DataStore;
  gsStore!: GrindstoneStore;
  cardManager!: CardManager;

  async onload(): Promise<void> {
    this.store = new DataStore(this);
    await this.store.load();

    this.gsStore = new GrindstoneStore(this.store);
    this.cardManager = new CardManager(
      this.app,
      this.store,
      () => this.gsStore.invalidatePrimaryDeckCache(),
    );

    // Register workspace view
    this.registerView(
      WORKSPACE_VIEW_TYPE,
      (leaf) => new GrindstoneWorkspaceView(
        leaf, this.gsStore, this.cardManager,
        (tag?: string) => this.startReviewModal(tag),
      ),
    );

    // Full scan once layout is ready (with migration if needed)
    this.app.workspace.onLayoutReady(async () => {
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
    });

    // Incremental update on metadata change (skip re-entrant scans from ID embedding).
    // Save is debounced — vault-wide edits would otherwise trigger many disk writes.
    this.registerEvent(
      this.app.metadataCache.on('changed', async (file: TFile) => {
        if (this.cardManager.isWritingIds(file.path)) return;
        await this.cardManager.scanFile(file);
        this.store.saveDebounced();
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
    await this.store.flushSave();
  }
}
