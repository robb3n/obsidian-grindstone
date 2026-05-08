import { ItemView, WorkspaceLeaf } from 'obsidian';
import { DataStore } from '../storage/data-store';

export const OVERVIEW_VIEW_TYPE = 'grindstone-overview';

export class GrindstoneOverviewView extends ItemView {
  private store: DataStore;
  private startReview: () => void;

  constructor(leaf: WorkspaceLeaf, store: DataStore, startReview: () => void) {
    super(leaf);
    this.store = store;
    this.startReview = startReview;
  }

  getViewType(): string {
    return OVERVIEW_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Grindstone';
  }

  getIcon(): string {
    return 'flame';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass('gs-overview');

    const today = formatDate(new Date());
    const stats = this.store.getStats(today);
    const maturity = this.store.getMaturityDistribution();
    const upcoming = this.store.getUpcomingDue(7);
    const ratings = this.store.getRatingDistribution(30);
    const studyTime = this.store.getDailyStudyTime(7);
    const settings = this.store.getSettings();

    const remaining = stats.dueToday - stats.reviewedToday;
    const ratingTotal = ratings.hard + ratings.good + ratings.easy;
    const matTotal = maturity.new + maturity.learning + maturity.mature;
    const maxDue = Math.max(...upcoming.map((d) => d.count), 1);
    const maxTime = Math.max(...studyTime.map((d) => d.ms), 1);

    // Container
    const wrap = el.createDiv({ cls: 'gs-wrap' });

    // ── Header ──
    const header = wrap.createDiv({ cls: 'gs-header' });
    header.createEl('h1', { text: '磨 石' });
    header.createEl('div', { text: 'GRINDSTONE', cls: 'gs-sub' });

    // ── Today Banner ──
    const banner = wrap.createDiv({ cls: 'gs-today' });
    const bannerInner = banner.createDiv({ cls: 'gs-today-inner' });
    const statsRow = bannerInner.createDiv({ cls: 'gs-today-stats' });

    const addStat = (val: number, label: string, accent?: boolean) => {
      const block = statsRow.createDiv({ cls: 'gs-stat' });
      const numEl = block.createEl('span', { text: String(val), cls: 'gs-stat-num' });
      if (accent) numEl.addClass('gs-stat-accent');
      block.createEl('span', { text: label, cls: 'gs-stat-lbl' });
    };

    addStat(stats.dueToday, '到期', true);
    addStat(stats.reviewedToday, '已复习');
    addStat(Math.max(0, remaining), '剩余');

    const btn = bannerInner.createEl('button', { text: '开始复习', cls: 'gs-btn-review' });
    btn.addEventListener('click', () => this.startReview());

    // ── Data Grid ──
    const grid = wrap.createDiv({ cls: 'gs-grid' });

    // Panel: Next 7 days
    const p1 = grid.createDiv({ cls: 'gs-panel' });
    p1.createDiv({ text: '未来七日到期', cls: 'gs-panel-title' });
    const bars1 = p1.createDiv({ cls: 'gs-bars' });
    for (const item of upcoming) {
      const col = bars1.createDiv({ cls: 'gs-bc' });
      col.createEl('span', { text: String(item.count), cls: 'gs-b-tip' });
      const bar = col.createDiv({ cls: 'gs-b gs-b-vermilion' });
      bar.style.height = `${(item.count / maxDue) * 100}%`;
      col.createEl('span', { text: item.date.slice(8), cls: 'gs-b-label' });
    }

    // Panel: Maturity
    const p2 = grid.createDiv({ cls: 'gs-panel' });
    p2.createDiv({ text: '卡片成熟度', cls: 'gs-panel-title' });
    const track = p2.createDiv({ cls: 'gs-mat-track' });

    if (matTotal > 0) {
      const segNew = track.createDiv({ cls: 'gs-mat-seg gs-mat-new' });
      segNew.style.flexBasis = `${(maturity.new / matTotal) * 100}%`;
      segNew.setText(String(maturity.new));

      const segLearn = track.createDiv({ cls: 'gs-mat-seg gs-mat-learn' });
      segLearn.style.flexBasis = `${(maturity.learning / matTotal) * 100}%`;
      segLearn.setText(String(maturity.learning));

      const segMature = track.createDiv({ cls: 'gs-mat-seg gs-mat-mature' });
      segMature.style.flexBasis = `${(maturity.mature / matTotal) * 100}%`;
      segMature.setText(String(maturity.mature));
    }

    const legend = p2.createDiv({ cls: 'gs-mat-legend' });
    const addLegend = (cls: string, label: string, count: number) => {
      const item = legend.createDiv({ cls: 'gs-mat-item' });
      item.createDiv({ cls: `gs-mat-dot ${cls}` });
      item.createSpan({ text: label });
      item.createSpan({ text: String(count), cls: 'gs-mat-n' });
    };
    addLegend('gs-dot-new', '新', maturity.new);
    addLegend('gs-dot-learn', '习', maturity.learning);
    addLegend('gs-dot-mature', '熟', maturity.mature);

    // Panel: Rating distribution
    const p3 = grid.createDiv({ cls: 'gs-panel' });
    p3.createDiv({ text: '评分分布', cls: 'gs-panel-title' });
    const ratRows = p3.createDiv({ cls: 'gs-rat-rows' });

    const addRating = (label: string, cls: string, count: number) => {
      const pct = ratingTotal > 0 ? Math.round((count / ratingTotal) * 100) : 0;
      const row = ratRows.createDiv({ cls: 'gs-rat-row' });
      row.createEl('span', { text: label, cls: `gs-rat-lbl ${cls}` });
      const trackEl = row.createDiv({ cls: 'gs-rat-track' });
      const fill = trackEl.createDiv({ cls: `gs-rat-fill ${cls}` });
      fill.style.width = `${pct}%`;
      row.createEl('span', { text: `${pct}%`, cls: 'gs-rat-pct' });
    };
    addRating('Hard', 'hard', ratings.hard);
    addRating('Good', 'good', ratings.good);
    addRating('Easy', 'easy', ratings.easy);

    // Panel: Daily study time
    const p4 = grid.createDiv({ cls: 'gs-panel' });
    p4.createDiv({ text: '每日用功', cls: 'gs-panel-title' });
    const bars2 = p4.createDiv({ cls: 'gs-bars' });
    for (const item of studyTime) {
      const mins = Math.round(item.ms / 60000);
      const col = bars2.createDiv({ cls: 'gs-bc' });
      col.createEl('span', { text: `${mins}m`, cls: 'gs-b-tip' });
      const bar = col.createDiv({ cls: 'gs-b gs-b-jade' });
      bar.style.height = `${(item.ms / maxTime) * 100}%`;
      col.createEl('span', { text: item.date.slice(8), cls: 'gs-b-label' });
    }

    // ── Tag Overview ──
    const tagPanel = wrap.createDiv({ cls: 'gs-panel gs-tag-panel' });
    tagPanel.createDiv({ text: '标签总览', cls: 'gs-panel-title' });
    const tagList = tagPanel.createDiv({ cls: 'gs-tag-list' });

    // Collect unique trigger tags and their counts
    const tagCounts = new Map<string, number>();
    for (const card of Object.values(this.store.getAllCards())) {
      if (card.disabled) continue;
      for (const tag of card.tags) {
        // Only count trigger tags
        for (const trigger of settings.triggerTags) {
          if (tag === trigger || tag.startsWith(trigger + '/')) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }
      }
    }

    const sorted = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
    const maxTagCount = sorted.length > 0 ? sorted[0][1] : 1;

    for (const [tag, count] of sorted) {
      const row = tagList.createDiv({ cls: 'gs-tag-row' });
      const nameEl = row.createSpan({ cls: 'gs-tag-name' });
      const lastSlash = tag.lastIndexOf('/');
      if (lastSlash > 0) {
        nameEl.createSpan({ text: tag.slice(0, lastSlash + 1), cls: 'gs-tag-prefix' });
        nameEl.createSpan({ text: tag.slice(lastSlash + 1), cls: 'gs-tag-leaf' });
      } else {
        nameEl.createSpan({ text: tag, cls: 'gs-tag-leaf' });
      }

      const right = row.createDiv({ cls: 'gs-tag-right' });
      const barTrack = right.createDiv({ cls: 'gs-tag-bar' });
      const barFill = barTrack.createDiv({ cls: 'gs-tag-fill' });
      barFill.style.width = `${(count / maxTagCount) * 100}%`;
      right.createSpan({ text: String(count), cls: 'gs-tag-count' });
    }

    // ── Colophon ──
    wrap.createDiv({ text: '磨 刀 不 误 砍 柴 工', cls: 'gs-colophon' });
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
