import { Plugin, TFile, TAbstractFile } from 'obsidian';
import { DataStore } from './storage/data-store';
import { CardManager } from './card/card-manager';
import { ReviewModal } from './ui/review-modal';
import { GrindstoneSidebarView, SIDEBAR_VIEW_TYPE } from './ui/sidebar-view';
import { GrindstoneOverviewView, OVERVIEW_VIEW_TYPE } from './ui/overview-view';
import { addRibbonIcon } from './ui/ribbon';
import { GrindstoneSettingTab } from './settings/settings-tab';

export default class GrindstonePlugin extends Plugin {
  store!: DataStore;
  cardManager!: CardManager;

  async onload(): Promise<void> {
    this.store = new DataStore(this);
    await this.store.load();

    this.cardManager = new CardManager(this.app, this.store);

    // Register views
    this.registerView(
      SIDEBAR_VIEW_TYPE,
      (leaf) => new GrindstoneSidebarView(leaf, this.cardManager, this.store),
    );
    this.registerView(
      OVERVIEW_VIEW_TYPE,
      (leaf) => new GrindstoneOverviewView(leaf, this.store, () => this.startReviewModal()),
    );

    // Full scan once layout is ready
    this.app.workspace.onLayoutReady(async () => {
      await this.cardManager.fullScan();
      console.log(
        `[Grindstone] Full scan complete. Cards: ${Object.keys(this.store.getAllCards()).length}`,
      );
    });

    // Incremental update on metadata change
    this.registerEvent(
      this.app.metadataCache.on('changed', async (file: TFile) => {
        await this.cardManager.scanFile(file);
        await this.store.save();
      }),
    );

    // Handle renames
    this.registerEvent(
      this.app.vault.on('rename', async (file: TAbstractFile, oldPath: string) => {
        if (file instanceof TFile) {
          this.cardManager.handleRename(oldPath, file.path);
          await this.store.save();
        }
      }),
    );

    // Handle deletions
    this.registerEvent(
      this.app.vault.on('delete', async (file: TAbstractFile) => {
        if (file instanceof TFile) {
          this.cardManager.handleDelete(file.path);
          await this.store.save();
        }
      }),
    );

    // Command: Start Review (Modal)
    this.addCommand({
      id: 'start-review',
      name: 'Start Review',
      callback: () => this.startReviewModal(),
    });

    // Command: Open Sidebar
    this.addCommand({
      id: 'open-sidebar',
      name: 'Open Review Sidebar',
      callback: () => this.activateSidebar(),
    });

    // Command: Open Overview
    this.addCommand({
      id: 'open-overview',
      name: 'Open Overview',
      callback: () => this.activateOverview(),
    });

    // Ribbon icon → modal
    addRibbonIcon(
      this,
      () => this.getDueCount(),
      () => this.startReviewModal(),
    );

    // Settings tab
    this.addSettingTab(new GrindstoneSettingTab(this.app, this));
  }

  private getDueCount(): number {
    const today = formatDate(new Date());
    return this.store.getDueCards(today).length;
  }

  private startReviewModal(): void {
    const today = formatDate(new Date());
    const queue = this.store.getDueCards(today);
    new ReviewModal(this.app, queue, this.cardManager, this.store).open();
  }

  private async activateSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      (existing[0].view as GrindstoneSidebarView).refresh();
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private async activateOverview(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(OVERVIEW_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      (existing[0].view as GrindstoneOverviewView).refresh();
      return;
    }

    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: OVERVIEW_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async onunload(): Promise<void> {
    await this.store.save();
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
