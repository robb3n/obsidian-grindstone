import { App, Notice } from 'obsidian';
import { TabContext } from './types';
import { RatingsData, WeeklyReview } from '../../store/GrindstoneStore';
import { countUp } from '../anim';

const DEMO_FILE_BASENAME = 'Grindstone Demo';
const DEMO_CONTENT = `# Grindstone Demo

#grind 什么是间隔重复（Spaced Repetition）？
一种根据"遗忘曲线"安排复习时机的学习方法：每复习一次，下次复习的间隔会变长，从而让长期记忆更稳。

---

#grind 磨石如何把一行文字变成一张卡片？
任何含有触发标签（默认 \`#grind\`）的行就是一张卡片的开头。
- 题面 = 该行去掉标签后的文字
- 答案 = 从该行到下一个分隔符 \`---\` / 下一张卡 / 下一个标题之间的内容

---

#grind 复习评分有哪四档？
- **1 Again** — 没记住，短间隔再练
- **2 Hard** — 难，间隔较短
- **3 Good** — 可，标准间隔增长
- **4 Easy** — 易，间隔大幅增长

---

#grind 卡组（deck）是什么？
卡组就是顶级标签。比如 \`#grind/biology/cells\` 这张卡的卡组是 \`grind\`，子标签 \`biology/cells\` 用于组织和筛选。

---

#grind 这张演示笔记可以删吗？
可以。删除文件后，对应的卡片会自动从复习队列移除。
你也可以在 Settings 里改触发标签，把 \`#grind\` 换成自己想用的标签（比如 \`#flashcard\`、\`#anki\`）。
`;

const MOTIVATIONAL = [
  '迈进',
  '纸上得来终觉浅',
  '博观约取',
  '厚积薄发',
  '等待与希望',
  '不积跬步，无以至千里',
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

  // Motivational quote — re-rolled every time Overview renders
  const motiv = MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)];
  const quote = headR.createDiv({ cls: 'ov-quote' });
  quote.createSpan({ text: motiv });

  // CTA — fast path: skip pre-flight, dive straight into the inline session.
  // Sidebar Review tab still routes through pre-flight for "see today first" users.
  const cta = headR.createEl('button', { cls: 'gs-btn gs-btn-primary ov-cta' });
  cta.textContent = `开始复习 \u00B7 ${stats.due}`;
  cta.disabled = stats.due === 0;
  cta.addEventListener('click', () => {
    if (stats.due > 0) ctx.startInlineReview();
  });

  // ── Page Body ──
  const page = container.createDiv({ cls: 'gs-page ov-page' });

  // Empty state
  const totalCards = maturity.new + maturity.learning + maturity.mature;
  if (totalCards === 0) {
    renderEmptyState(page, ctx);
    return;
  }

  // ── Stat Strip ──
  const strip = page.createDiv({ cls: 'ov-strip' });
  addStat(strip, 'DUE', '今日目标', stats.due, undefined, true, 0);
  addStat(strip, 'DONE', '已完成', stats.done, undefined, false, 60);
  addStat(strip, 'LEFT', '剩余', stats.remaining, undefined, false, 120);
  addStat(strip, 'STREAK', '连续打卡', stats.streak, 'd', false, 180);
  addStat(strip, 'WEEK', '本周用功', stats.weekMinutes, 'm', false, 240);
  addStat(strip, 'TAGS', '标签', stats.tagCount, undefined, false, 300);

  // ── Sunday-only Weekly Review banner ──
  // Sits between stat strip and grid. Skipped silently when user opted out or
  // there's no data this week (would just be an empty card).
  const settings = ctx.store.getSettings();
  if (now.getDay() === 0 && settings.weeklyReviewEnabled !== false) {
    const weekly = ctx.store.getWeeklyReview();
    if (weekly.cardsThisWeek > 0) {
      renderWeeklyReview(page, weekly, ctx);
    }
  }

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
  tileHead(tile, '未来七日复习量', 'FORECAST \u00B7 7D');

  const max = Math.max(...forecast.map(f => f.count), 1);
  const fore = tile.createDiv({ cls: 'ov-fore' });

  forecast.forEach((f, idx) => {
    const col = fore.createDiv({ cls: 'ov-fc' });
    const barWrap = col.createDiv({ cls: 'ov-fc-bar-wrap' });
    const bar = barWrap.createDiv({
      cls: `ov-fc-bar${f.isToday ? ' ov-fc-today' : ''}`,
    });
    const targetH = Math.max(22, (f.count / max) * 100);
    bar.style.height = '0%';
    window.setTimeout(() => {
      if (!bar.isConnected) return;
      bar.style.height = `${targetH}%`;
    }, idx * 60 + 16);
    bar.createSpan({ cls: 'ov-fc-n gs-mono', text: String(f.count) });

    col.createDiv({
      cls: `ov-fc-d gs-mono${f.isToday ? ' ov-fc-d-today' : ''}`,
      text: f.label,
    });
  });
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
  fill.setAttribute('stroke-dashoffset', String(c));
  fill.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  fill.style.transition = 'stroke-dashoffset .9s cubic-bezier(.215,.61,.355,1)';
  svg.appendChild(fill);

  prog.appendChild(svg);

  const targetOffset = c * (1 - (progress.total === 0 ? 0 : progress.done / progress.total));
  window.setTimeout(() => {
    if (!fill.isConnected) return;
    fill.setAttribute('stroke-dashoffset', String(targetOffset));
  }, 16);

  const overlay = prog.createDiv({ cls: 'ov-prog-overlay' });
  overlay.createDiv({ cls: 'ov-prog-pct gs-mono', text: `${pct}%` });
  overlay.createDiv({ cls: 'ov-prog-cap', text: `${progress.done} / ${progress.total}` });
}

function renderMaturityTile(grid: HTMLElement, maturity: { new: number; learning: number; mature: number }): void {
  const tile = grid.createDiv({ cls: 'gs-card gs-hoverable ov-tile ov-t-maturity' });
  tileHead(tile, '卡片成熟度', 'MATURITY');

  const total = maturity.new + maturity.learning + maturity.mature;
  const rows = tile.createDiv({ cls: 'ov-mat-rows' });

  addMatRow(rows, '新', 'NEW', maturity.new, total, 'var(--gs-clay)', 0);
  addMatRow(rows, '习', 'LRN', maturity.learning, total, 'var(--gs-gold)', 1);
  addMatRow(rows, '熟', 'MAT', maturity.mature, total, 'var(--gs-green)', 2);
}

function addMatRow(parent: HTMLElement, zh: string, en: string, value: number, total: number, color: string, idx: number): void {
  const pct = total === 0 ? 0 : (value / total) * 100;
  const row = parent.createDiv({ cls: 'ov-mat' });

  const left = row.createDiv({ cls: 'ov-mat-l' });
  const dot = left.createSpan({ cls: 'ov-mat-dot' });
  dot.style.background = color;
  left.createSpan({ cls: 'ov-mat-zh', text: zh });
  left.createSpan({ cls: 'ov-mat-en gs-en', text: en });

  const bar = row.createDiv({ cls: 'ov-mat-bar' });
  const barFill = bar.createDiv();
  barFill.style.width = '0%';
  barFill.style.background = color;
  window.setTimeout(() => {
    if (!barFill.isConnected) return;
    barFill.style.width = `${pct}%`;
  }, idx * 80 + 16);

  row.createSpan({ cls: 'ov-mat-n gs-mono', text: String(value) });
}

function renderRatingsTile(grid: HTMLElement, ratings: RatingsData): void {
  const tile = grid.createDiv({ cls: 'gs-card gs-hoverable ov-tile ov-t-ratings' });
  tileHead(tile, '评分分布', 'RATINGS');

  const total = ratings.again + ratings.hard + ratings.good + ratings.easy;

  if (total === 0) {
    tile.createDiv({ cls: 'ov-rate-empty', text: '尚无评分 \u00B7 NO DATA' });
    return;
  }

  const rate = tile.createDiv({ cls: 'ov-rate' });

  // Half-circle gauge
  const gaugeWrap = rate.createDiv({ cls: 'ov-rate-gauge' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const W = 200, H = 110, R = 80, STROKE = 14;
  const cx = W / 2, cy = H - 12;
  const arcLen = Math.PI * R;
  const arcD = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const track = document.createElementNS(svgNS, 'path');
  track.setAttribute('d', arcD);
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'var(--gs-line)');
  track.setAttribute('stroke-width', String(STROKE));
  track.setAttribute('stroke-linecap', 'butt');
  svg.appendChild(track);

  const segs = [
    { pct: ratings.againPct, color: 'var(--gs-clay)' },
    { pct: ratings.hardPct,  color: 'var(--gs-gold)' },
    { pct: ratings.goodPct,  color: 'var(--gs-green)' },
    { pct: ratings.easyPct,  color: 'var(--gs-green-2)' },
  ];

  const segGap = 2.5;
  let cum = 0;
  const segPaths: { el: SVGPathElement; len: number }[] = [];
  for (const seg of segs) {
    const portion = (seg.pct / 100) * arcLen;
    const visible = Math.max(0, portion - segGap);
    if (portion > 0) {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', arcD);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', seg.color);
      p.setAttribute('stroke-width', String(STROKE));
      p.setAttribute('stroke-linecap', 'butt');
      p.setAttribute('stroke-dasharray', `0 ${arcLen}`);
      p.setAttribute('stroke-dashoffset', String(-cum));
      p.style.transition = 'stroke-dasharray .9s cubic-bezier(.215,.61,.355,1)';
      svg.appendChild(p);
      segPaths.push({ el: p, len: visible });
    }
    cum += portion;
  }

  gaugeWrap.appendChild(svg);

  const accuracy = ratings.goodPct + ratings.easyPct;
  const center = gaugeWrap.createDiv({ cls: 'ov-rate-center' });
  center.createDiv({ cls: 'ov-rate-acc gs-mono', text: `${accuracy}%` });
  center.createDiv({ cls: 'ov-rate-acc-l gs-en', text: 'ACCURACY' });

  window.setTimeout(() => {
    for (const { el, len } of segPaths) {
      if (el.isConnected) el.setAttribute('stroke-dasharray', `${len} ${arcLen}`);
    }
  }, 16);

  // Legend
  const legend = rate.createDiv({ cls: 'ov-rate-legend' });
  addLegendItem(legend, 'Again', ratings.againPct, 'var(--gs-clay)');
  addLegendItem(legend, 'Hard',  ratings.hardPct,  'var(--gs-gold)');
  addLegendItem(legend, 'Good',  ratings.goodPct,  'var(--gs-green)');
  addLegendItem(legend, 'Easy',  ratings.easyPct,  'var(--gs-green-2)');
}

function addLegendItem(parent: HTMLElement, label: string, pct: number, color: string): void {
  const item = parent.createDiv({ cls: 'ov-rate-li' });
  const dot = item.createSpan({ cls: 'ov-rate-li-dot' });
  dot.style.background = color;
  item.createSpan({ cls: 'ov-rate-li-name gs-en', text: label });
  const v = item.createSpan({ cls: 'ov-rate-li-pct gs-mono', text: `${pct}%` });
  v.style.color = color;
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
    rect.style.transformBox = 'fill-box';
    rect.style.transformOrigin = 'center';
    rect.style.transform = 'scale(0)';
    rect.style.opacity = '0';
    rect.style.transition = 'transform .42s cubic-bezier(.2,.7,.3,1), opacity .28s ease-out';
    svg.appendChild(rect);

    const delay = col * 32 + row * 8 + 40;
    window.setTimeout(() => {
      if (!rect.isConnected) return;
      rect.style.transform = 'scale(1)';
      rect.style.opacity = '1';
    }, delay);
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

  tags.forEach((t, i) => {
    const btn = list.createEl('button', { cls: 'ov-tag' });
    btn.addEventListener('click', () => ctx.onNavigate('tags', { tag: t.path }));
    btn.createSpan({ cls: 'ov-tag-path', text: t.path });
    const meter = btn.createSpan({ cls: 'ov-tag-meter' });
    const fill = meter.createSpan();
    fill.style.width = '0%';
    const targetW = (t.count / max) * 100;
    window.setTimeout(() => {
      if (!fill.isConnected) return;
      fill.style.width = `${targetW}%`;
    }, i * 60 + 40);
    btn.createSpan({ cls: 'ov-tag-n gs-mono', text: String(t.count) });
  });

  const more = list.createEl('button', { cls: 'ov-tag-more' });
  more.textContent = `查看全部 ${tags.length} 个 →`;
  more.addEventListener('click', () => ctx.onNavigate('tags'));
}

// ── Weekly Review (Sunday only) ──

function renderWeeklyReview(parent: HTMLElement, w: WeeklyReview, ctx: TabContext): void {
  const tile = parent.createDiv({ cls: 'gs-card gs-hoverable ov-weekly' });
  tileHead(tile, '周回顾', 'WEEKLY REVIEW · SUNDAY');

  const body = tile.createDiv({ cls: 'ov-weekly-body' });

  // ── Metrics row ──
  const metrics = body.createDiv({ cls: 'ov-weekly-metrics' });

  // Cards this week (with trend vs last week)
  const m1 = metrics.createDiv({ cls: 'ov-weekly-metric' });
  m1.createDiv({ cls: 'ov-weekly-m-label gs-en', text: 'CARDS' });
  const v1 = m1.createDiv({ cls: 'ov-weekly-m-val gs-mono gs-tabular' });
  v1.createSpan({ text: String(w.cardsThisWeek) });
  if (w.cardsLastWeek > 0) {
    const diff = w.cardsThisWeek - w.cardsLastWeek;
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '·';
    const cls = diff > 0 ? 'ov-weekly-trend-up' : diff < 0 ? 'ov-weekly-trend-down' : 'ov-weekly-trend-flat';
    v1.createSpan({ cls: `ov-weekly-trend ${cls}`, text: `${arrow}${Math.abs(diff)}` });
  }
  m1.createDiv({ cls: 'ov-weekly-m-sub', text: `上周 ${w.cardsLastWeek}` });

  // Accuracy this week (with delta in percentage points)
  if (w.accuracyThisWeek !== null) {
    const m2 = metrics.createDiv({ cls: 'ov-weekly-metric' });
    m2.createDiv({ cls: 'ov-weekly-m-label gs-en', text: 'ACCURACY' });
    const v2 = m2.createDiv({ cls: 'ov-weekly-m-val gs-mono gs-tabular' });
    v2.createSpan({ text: `${w.accuracyThisWeek}%` });
    if (w.accuracyDelta !== null) {
      const cls = w.accuracyDelta > 0 ? 'ov-weekly-trend-up' : w.accuracyDelta < 0 ? 'ov-weekly-trend-down' : 'ov-weekly-trend-flat';
      const sign = w.accuracyDelta > 0 ? '+' : '';
      v2.createSpan({ cls: `ov-weekly-trend ${cls}`, text: `${sign}${w.accuracyDelta}pp` });
    }
    m2.createDiv({ cls: 'ov-weekly-m-sub', text: w.accuracyDelta === null ? '上周无数据' : `上周 ${w.accuracyThisWeek - w.accuracyDelta}%` });
  }

  // ── Tag breakdown (best / worst) ──
  if (w.bestTags.length > 0 || w.worstTags.length > 0) {
    const tagWrap = body.createDiv({ cls: 'ov-weekly-tags' });
    if (w.bestTags.length > 0) {
      renderTagColumn(tagWrap, '最稳', 'BEST', w.bestTags, 'ov-weekly-tag-good');
    }
    if (w.worstTags.length > 0) {
      renderTagColumn(tagWrap, '最难', 'WORST', w.worstTags, 'ov-weekly-tag-bad');
    }
  }

  // ── CTA ──
  const ctaWrap = body.createDiv({ cls: 'ov-weekly-cta-wrap' });
  const cta = ctaWrap.createEl('button', { cls: 'gs-btn ov-weekly-cta' });
  cta.textContent = '查看完整统计 →';
  cta.addEventListener('click', () => ctx.onNavigate('stats'));
}

function renderTagColumn(
  parent: HTMLElement,
  zh: string,
  en: string,
  tags: Array<{ tag: string; accuracy: number; count: number }>,
  rowCls: string,
): void {
  const col = parent.createDiv({ cls: 'ov-weekly-tag-col' });
  const h = col.createDiv({ cls: 'ov-weekly-tag-h' });
  h.createSpan({ cls: 'ov-weekly-tag-h-zh', text: zh });
  h.createSpan({ cls: 'ov-weekly-tag-h-en gs-en', text: en });
  const list = col.createDiv({ cls: 'ov-weekly-tag-list' });
  for (const t of tags) {
    const row = list.createDiv({ cls: `ov-weekly-tag-row ${rowCls}` });
    row.createSpan({ cls: 'ov-weekly-tag-name', text: `#${t.tag}` });
    row.createSpan({ cls: 'ov-weekly-tag-acc gs-mono gs-tabular', text: `${t.accuracy}%` });
  }
}

// ── Helpers ──

function renderEmptyState(parent: HTMLElement, ctx: TabContext): void {
  const empty = parent.createDiv({ cls: 'gs-empty-state' });
  const icon = empty.createDiv({ cls: 'gs-empty-icon' });
  icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12L12 20l-9-9V3h8z"/><circle cx="7" cy="7" r="1.2"/></svg>`;
  empty.createDiv({ cls: 'gs-empty-title', text: '还没有卡片' });
  empty.createDiv({ cls: 'gs-empty-sub', text: '在 Obsidian 笔记中添加触发标签（默认 #grind），磨石会自动提取卡片进行间隔复习。' });
  empty.createDiv({ cls: 'gs-empty-hint', text: '#grind' });

  // Quick-start: one-click demo note. Lets the user see SRS data flow without
  // having to learn the syntax first.
  const actions = empty.createDiv({ cls: 'gs-empty-actions' });
  const demoBtn = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '创建演示笔记' });
  demoBtn.addEventListener('click', () => createDemoNote(ctx, demoBtn));
  actions.createDiv({ cls: 'gs-empty-actions-hint', text: '在 vault 根目录新建 Grindstone Demo.md（5 张示例卡）' });
}

async function createDemoNote(ctx: TabContext, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '创建中…';
  try {
    const path = pickAvailableDemoPath(ctx.app);
    const file = await ctx.app.vault.create(path, DEMO_CONTENT);
    // Metadata cache indexes asynchronously — give it a tick before scanning.
    await new Promise(r => setTimeout(r, 200));
    await ctx.cardManager.scanFile(file);
    await ctx.store.save();
    new Notice(`已创建 ${path}（5 张示例卡）`);
    ctx.refreshTab();
  } catch (err) {
    console.error('[Grindstone] Demo creation failed:', err);
    new Notice(`创建失败：${err instanceof Error ? err.message : String(err)}`);
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function pickAvailableDemoPath(app: App): string {
  const base = `${DEMO_FILE_BASENAME}.md`;
  if (!app.vault.getAbstractFileByPath(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${DEMO_FILE_BASENAME} ${i}.md`;
    if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
  }
  return `${DEMO_FILE_BASENAME} ${Date.now()}.md`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
