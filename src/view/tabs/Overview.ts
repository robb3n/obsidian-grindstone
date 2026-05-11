import { TabContext } from './types';
import { countUp } from '../anim';

const MOTIVATIONAL = [
  { zh: '不积跬步，无以至千里', en: 'A journey of a thousand miles begins with a single step.' },
  { zh: '玉不琢，不成器', en: 'Jade uncut shines not.' },
  { zh: '日拱一卒，功不唐捐', en: 'A pawn moves daily; effort is never wasted.' },
];

export function renderOverview(container: HTMLElement, ctx: TabContext): void {
  const stats = ctx.store.getOverviewStats();
  const forecast = ctx.store.getForecast7D();
  const progress = ctx.store.getTodayProgress();
  const maturity = ctx.store.getMaturity();
  const ratings = ctx.store.getRatingsDistribution();
  const heatmap = ctx.store.get12WeekHeatmap();
  const topTags = ctx.store.getTopTags(6);

  // ── Page Head ──
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  const now = new Date();
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const dateStr = `TODAY \u00B7 ${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${dayNames[now.getDay()]}`;
  headL.createDiv({ cls: 'gs-pagehead-eyebrow gs-en', text: dateStr });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: '概览' });

  const headR = head.createDiv({ cls: 'gs-pagehead-r' });

  // Motivational quote
  const motiv = MOTIVATIONAL[now.getDate() % MOTIVATIONAL.length];
  const quote = headR.createDiv({ cls: 'ov-quote' });
  quote.createSpan({ text: `「${motiv.zh}」` });
  quote.createSpan({ cls: 'gs-en', text: motiv.en });

  // CTA button
  const cta = headR.createEl('button', { cls: 'gs-btn gs-btn-primary ov-cta' });
  cta.textContent = `开始复习 \u00B7 ${stats.due}`;
  cta.addEventListener('click', () => ctx.onNavigate('review'));

  // ── Page Body ──
  const page = container.createDiv({ cls: 'gs-page ov-page' });

  // Empty state
  const totalCards = maturity.new + maturity.learning + maturity.mature;
  if (totalCards === 0) {
    renderEmptyState(page);
    return;
  }

  // ── Stat Strip ──
  const strip = page.createDiv({ cls: 'ov-strip' });
  addStat(strip, 'DUE', '到期', stats.due, undefined, true, 0);
  addStat(strip, 'DONE', '已复习', stats.done, undefined, false, 60);
  addStat(strip, 'LEFT', '剩余', stats.remaining, undefined, false, 120);
  addStat(strip, 'STREAK', '连续打卡', stats.streak, 'd', false, 180);
  addStat(strip, 'WEEK', '本周用功', stats.weekMinutes, 'm', false, 240);
  addStat(strip, 'TAGS', '标签', stats.tagCount, undefined, false, 300);

  // ── Tile Grid ──
  const grid = page.createDiv({ cls: 'ov-grid' });

  // Forecast tile
  renderForecastTile(grid, forecast);

  // Progress tile
  renderProgressTile(grid, progress);

  // Maturity tile
  renderMaturityTile(grid, maturity);

  // Ratings tile
  renderRatingsTile(grid, ratings);

  // Heatmap tile
  renderHeatmapTile(grid, heatmap);

  // Tags tile
  renderTagsTile(grid, topTags, ctx);
}

// ── Stat Strip Item ──

function addStat(parent: HTMLElement, en: string, zh: string, value: number, suffix?: string, accent?: boolean, delay = 0): void {
  const stat = parent.createDiv({ cls: 'ov-stat' });
  const top = stat.createDiv({ cls: 'ov-stat-top' });
  top.createSpan({ cls: 'ov-stat-en gs-en', text: en });
  top.createSpan({ cls: 'ov-stat-zh', text: zh });
  const numEl = stat.createDiv({ cls: `ov-stat-num gs-mono gs-tabular${accent ? ' ov-stat-accent' : ''}` });
  const valSpan = numEl.createSpan();
  countUp(valSpan, value, 900, delay);
  if (suffix) {
    numEl.createSpan({ cls: 'ov-stat-suffix', text: suffix });
  }
}

// ── Tiles ──

function tileHead(parent: HTMLElement, title: string, en: string): void {
  const th = parent.createDiv({ cls: 'ov-th' });
  th.createSpan({ cls: 'ov-th-zh', text: title });
  th.createSpan({ cls: 'ov-th-en gs-en', text: en });
}

function renderForecastTile(grid: HTMLElement, forecast: ReturnType<typeof import('../../store/GrindstoneStore').GrindstoneStore.prototype.getForecast7D>): void {
  const tile = grid.createDiv({ cls: 'gs-card gs-hoverable ov-tile ov-t-forecast' });
  tileHead(tile, '未来七日到期', 'FORECAST \u00B7 7D');

  const max = Math.max(...forecast.map(f => f.count), 1);
  const fore = tile.createDiv({ cls: 'ov-fore' });

  for (const f of forecast) {
    const col = fore.createDiv({ cls: 'ov-fc' });
    const barWrap = col.createDiv({ cls: 'ov-fc-bar-wrap' });
    const bar = barWrap.createDiv({
      cls: `ov-fc-bar${f.isToday ? ' ov-fc-today' : ''}`,
    });
    bar.style.height = `${Math.max(22, (f.count / max) * 100)}%`;
    bar.createSpan({ cls: 'ov-fc-n gs-mono', text: String(f.count) });

    col.createDiv({
      cls: `ov-fc-d gs-mono${f.isToday ? ' ov-fc-d-today' : ''}`,
      text: f.label,
    });
  }
}

function renderProgressTile(grid: HTMLElement, progress: { done: number; total: number }): void {
  const tile = grid.createDiv({ cls: 'gs-card gs-hoverable ov-tile ov-t-progress' });
  tileHead(tile, '今日进度', 'TODAY');

  const prog = tile.createDiv({ cls: 'ov-prog' });
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  // SVG ring
  const size = 130;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  // Track
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', String(size / 2));
  track.setAttribute('cy', String(size / 2));
  track.setAttribute('r', String(r));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'var(--gs-line)');
  track.setAttribute('stroke-width', String(stroke));
  svg.appendChild(track);

  // Fill
  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fill.setAttribute('cx', String(size / 2));
  fill.setAttribute('cy', String(size / 2));
  fill.setAttribute('r', String(r));
  fill.setAttribute('fill', 'none');
  fill.setAttribute('stroke', 'var(--gs-green)');
  fill.setAttribute('stroke-width', String(stroke));
  fill.setAttribute('stroke-linecap', 'round');
  fill.setAttribute('stroke-dasharray', String(c));
  fill.setAttribute('stroke-dashoffset', String(c * (1 - (progress.total === 0 ? 0 : progress.done / progress.total))));
  fill.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  fill.style.transition = 'stroke-dashoffset .8s cubic-bezier(.2,.7,.3,1)';
  svg.appendChild(fill);

  prog.appendChild(svg);

  const overlay = prog.createDiv({ cls: 'ov-prog-overlay' });
  overlay.createDiv({ cls: 'ov-prog-pct gs-mono', text: `${pct}%` });
  overlay.createDiv({ cls: 'ov-prog-cap', text: `${progress.done} / ${progress.total}` });
}

function renderMaturityTile(grid: HTMLElement, maturity: { new: number; learning: number; mature: number }): void {
  const tile = grid.createDiv({ cls: 'gs-card gs-hoverable ov-tile ov-t-maturity' });
  tileHead(tile, '卡片成熟度', 'MATURITY');

  const total = maturity.new + maturity.learning + maturity.mature;
  const rows = tile.createDiv({ cls: 'ov-mat-rows' });

  addMatRow(rows, '新', 'NEW', maturity.new, total, 'var(--gs-clay)');
  addMatRow(rows, '习', 'LRN', maturity.learning, total, 'var(--gs-gold)');
  addMatRow(rows, '熟', 'MAT', maturity.mature, total, 'var(--gs-green)');
}

function addMatRow(parent: HTMLElement, zh: string, en: string, value: number, total: number, color: string): void {
  const pct = total === 0 ? 0 : (value / total) * 100;
  const row = parent.createDiv({ cls: 'ov-mat' });

  const left = row.createDiv({ cls: 'ov-mat-l' });
  const dot = left.createSpan({ cls: 'ov-mat-dot' });
  dot.style.background = color;
  left.createSpan({ cls: 'ov-mat-zh', text: zh });
  left.createSpan({ cls: 'ov-mat-en gs-en', text: en });

  const bar = row.createDiv({ cls: 'ov-mat-bar' });
  const barFill = bar.createDiv();
  barFill.style.width = `${pct}%`;
  barFill.style.background = color;

  row.createSpan({ cls: 'ov-mat-n gs-mono', text: String(value) });
}

function renderRatingsTile(grid: HTMLElement, ratings: { hard: number; good: number; easy: number; hardPct: number; goodPct: number; easyPct: number }): void {
  const tile = grid.createDiv({ cls: 'gs-card gs-hoverable ov-tile ov-t-ratings' });
  tileHead(tile, '评分分布', 'RATINGS');

  const total = ratings.hard + ratings.good + ratings.easy;
  const rate = tile.createDiv({ cls: 'ov-rate' });

  addRateCircle(rate, 'Hard', ratings.hardPct, 'var(--gs-clay)');
  addRateCircle(rate, 'Good', ratings.goodPct, 'var(--gs-green-2)');
  addRateCircle(rate, 'Easy', ratings.easyPct, 'var(--gs-green)');

  if (total === 0) {
    tile.createDiv({ cls: 'ov-rate-empty', text: '尚无评分 \u00B7 NO DATA' });
  }
}

function addRateCircle(parent: HTMLElement, label: string, pct: number, color: string): void {
  const row = parent.createDiv({ cls: 'ov-rate-row' });
  const circle = row.createDiv({ cls: 'ov-rate-circle' });
  circle.style.borderColor = color;
  const span = circle.createSpan({ cls: 'gs-mono', text: `${pct}%` });
  span.style.color = color;
  row.createSpan({ cls: 'ov-rate-l gs-en', text: label });
}

function renderHeatmapTile(grid: HTMLElement, cells: number[]): void {
  const tile = grid.createDiv({ cls: 'gs-card gs-hoverable ov-tile ov-t-heat' });
  tileHead(tile, '活动热力 \u00B7 12 周', 'HEATMAP');

  const cols = 12;
  const rows = 7;
  const cellSize = 11;
  const gap = 3;
  const palette = ['var(--gs-line)', 'var(--gs-green-soft)', '#9bbcaa', '#5b8d75', 'var(--gs-green)'];

  const w = cols * (cellSize + gap) - gap;
  const h = rows * (cellSize + gap) - gap;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.display = 'block';

  for (let i = 0; i < cells.length; i++) {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(col * (cellSize + gap)));
    rect.setAttribute('y', String(row * (cellSize + gap)));
    rect.setAttribute('width', String(cellSize));
    rect.setAttribute('height', String(cellSize));
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', palette[Math.min(4, Math.max(0, cells[i]))]);
    svg.appendChild(rect);
  }

  tile.appendChild(svg);

  // Footer legend
  const foot = tile.createDiv({ cls: 'ov-heat-foot gs-en gs-mono' });
  foot.createSpan({ text: '12 weeks' });
  const scale = foot.createDiv({ cls: 'ov-heat-scale' });
  for (let i = 0; i < 5; i++) {
    const dot = scale.createDiv();
    dot.style.width = '9px';
    dot.style.height = '9px';
    dot.style.borderRadius = '2px';
    dot.style.background = palette[i];
  }
}

function renderTagsTile(grid: HTMLElement, tags: Array<{ path: string; count: number }>, ctx: TabContext): void {
  const tile = grid.createDiv({ cls: 'gs-card gs-hoverable ov-tile ov-t-tags' });
  tileHead(tile, '标签', `TAGS \u00B7 ${tags.length}`);

  const max = Math.max(...tags.map(t => t.count), 1);
  const list = tile.createDiv({ cls: 'ov-tags' });

  for (const t of tags) {
    const btn = list.createEl('button', { cls: 'ov-tag' });
    btn.addEventListener('click', () => ctx.onNavigate('tags'));
    btn.createSpan({ cls: 'ov-tag-path', text: t.path });
    const meter = btn.createSpan({ cls: 'ov-tag-meter' });
    const fill = meter.createSpan();
    fill.style.width = `${(t.count / max) * 100}%`;
    btn.createSpan({ cls: 'ov-tag-n gs-mono', text: String(t.count) });
  }

  const more = list.createEl('button', { cls: 'ov-tag-more' });
  more.textContent = `查看全部 ${tags.length} 个 →`;
  more.addEventListener('click', () => ctx.onNavigate('tags'));
}

// ── Helpers ──

function renderEmptyState(parent: HTMLElement): void {
  const empty = parent.createDiv({ cls: 'gs-empty-state' });
  const icon = empty.createDiv({ cls: 'gs-empty-icon' });
  icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12L12 20l-9-9V3h8z"/><circle cx="7" cy="7" r="1.2"/></svg>`;
  empty.createDiv({ cls: 'gs-empty-title', text: '还没有卡片' });
  empty.createDiv({ cls: 'gs-empty-sub', text: '在 Obsidian 笔记中添加触发标签，磨刀石会自动提取卡片进行间隔复习。' });
  empty.createDiv({ cls: 'gs-empty-hint', text: '#考研数学 或 #flashcard' });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
