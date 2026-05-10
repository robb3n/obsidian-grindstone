import { TabContext } from './types';
import { countUp } from '../anim';

export function renderStats(container: HTMLElement, ctx: TabContext): void {
  let range = 30;
  const rangeDays: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, 'all': 365 };

  // ── Page Head ──
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  headL.createDiv({ cls: 'gs-pagehead-eyebrow gs-en', text: 'WORKSPACE \u00B7 STATS' });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: '统计' });

  const headR = head.createDiv({ cls: 'gs-pagehead-r' });
  const rangeDiv = headR.createDiv({ cls: 'st-range' });

  const page = container.createDiv({ cls: 'gs-page st-page' });

  const renderAll = () => {
    rangeDiv.empty();
    for (const r of ['7d', '30d', '90d', 'all']) {
      const btn = rangeDiv.createEl('button', {
        cls: `st-range-btn${rangeDays[r] === range ? ' st-range-btn-on' : ''}`,
        text: r,
      });
      btn.addEventListener('click', () => { range = rangeDays[r]; renderAll(); });
    }

    page.empty();
    const kpi = ctx.store.getStatsKPI(range);
    const trend = ctx.store.getReviewTrend(range);
    const accByTag = ctx.store.getAccuracyByTag();
    const forgetting = ctx.store.getForgettingCurve();
    const heatmap = ctx.store.get12WeekHeatmap();
    const minutes = ctx.store.getStudyMinutesTrend(range);

    // ── KPI Row ──
    const kpis = page.createDiv({ cls: 'st-kpis' });
    addKPI(kpis, 'REVIEWED', '复习卡片', kpi.reviewed, '张', kpi.reviewedDelta, 0);
    addKPI(kpis, 'STUDY TIME', '学习时长', kpi.studyMinutes, '分钟', kpi.studyMinutesDelta, 80);
    addKPI(kpis, 'ACTIVE DAYS', '活跃天数', kpi.activeDays, `/ ${range}天`, kpi.activeDaysDelta, 160);
    addKPI(kpis, 'ACCURACY', '平均准确率', kpi.accuracy, '%', kpi.accuracyDelta, 240);

    // ── Row 1: Trend + Accuracy ──
    const row1 = page.createDiv({ cls: 'st-row st-row-2-1' });
    renderTrendCard(row1, trend);
    renderAccuracyCard(row1, accByTag);

    // ── Row 2: Forgetting + Heatmap + Minutes ──
    const row2 = page.createDiv({ cls: 'st-row st-row-3' });
    renderForgetCard(row2, forgetting);
    renderHeatmapCard(row2, heatmap);
    renderMinutesCard(row2, minutes);
  };

  renderAll();
}

function addKPI(parent: HTMLElement, en: string, zh: string, value: number, unit: string, delta: number | null, delay: number): void {
  const tile = parent.createDiv({ cls: 'st-kpi gs-card gs-hoverable gs-rise' });
  tile.style.animationDelay = `${delay}ms`;
  tile.createDiv({ cls: 'st-kpi-eyebrow gs-en', text: en });
  tile.createDiv({ cls: 'st-kpi-zh', text: zh });
  const num = tile.createDiv({ cls: 'st-kpi-num gs-mono' });
  const valSpan = num.createSpan();
  countUp(valSpan, value, 900, delay, (n) => n.toLocaleString());
  num.createSpan({ cls: 'st-kpi-unit', text: unit });

  if (delta !== null) {
    const trend = delta >= 0 ? 'up' : 'down';
    const deltaEl = tile.createDiv({ cls: `st-kpi-delta st-kpi-delta-${trend} gs-en` });
    deltaEl.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10"><path d="${trend === 'up' ? 'M2 7l3-3 3 3' : 'M2 3l3 3 3-3'}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    deltaEl.appendText(delta >= 0 ? `+${delta}%` : `${delta}%`);
  }
}

/** Simple bucket-average downsample for large datasets. */
function downsample(data: number[], targetPoints: number): number[] {
  if (data.length <= targetPoints) return data;
  const bucketSize = data.length / targetPoints;
  const result: number[] = [];
  for (let i = 0; i < targetPoints; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    result.push(Math.round(sum / (end - start)));
  }
  return result;
}

function renderTrendCard(parent: HTMLElement, data: Array<{ date: string; count: number }>): void {
  const card = parent.createDiv({ cls: 'st-card gs-card' });
  const head = card.createDiv({ cls: 'st-card-head' });
  const headL = head.createDiv({ cls: 'st-card-head-l' });
  headL.createDiv({ cls: 'st-card-en gs-en', text: 'REVIEW TREND' });
  headL.createDiv({ cls: 'st-card-zh', text: '复习量趋势' });

  const body = card.createDiv({ cls: 'st-card-body st-chart' });
  const W = 720, H = 200, P = { l: 32, r: 16, t: 16, b: 24 };
  const rawValues = data.map(d => d.count);
  const values = downsample(rawValues, 200);
  const max = Math.max(...values, 1);
  const xs = values.map((_, i) => P.l + (i / Math.max(1, values.length - 1)) * (W - P.l - P.r));
  const ys = values.map(v => P.t + (1 - v / max) * (H - P.t - P.b));
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.width = '100%';
  svg.style.height = '200px';

  // Grid lines
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    const y = P.t + g * (H - P.t - P.b);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(P.l)); line.setAttribute('x2', String(W - P.r));
    line.setAttribute('y1', String(y)); line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--gs-line)'); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }

  // Area
  if (values.length > 1) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = 'st-trend-grad';
    grad.setAttribute('x1', '0'); grad.setAttribute('x2', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('y2', '1');
    const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', 'var(--gs-green)'); s1.setAttribute('stop-opacity', '0.22');
    const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', 'var(--gs-green)'); s2.setAttribute('stop-opacity', '0');
    grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); svg.appendChild(defs);

    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', `M${xs[0]},${H - P.b} L${points.replace(/ /g, ' L')} L${xs[xs.length - 1]},${H - P.b} Z`);
    area.setAttribute('fill', 'url(#st-trend-grad)');
    svg.appendChild(area);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', 'M' + points.replace(/ /g, ' L'));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', 'var(--gs-green)');
    line.setAttribute('stroke-width', '1.8'); line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);
  }

  // Dots
  for (let i = 0; i < values.length; i++) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(xs[i])); c.setAttribute('cy', String(ys[i]));
    c.setAttribute('r', '2.4'); c.setAttribute('fill', 'var(--gs-green)');
    svg.appendChild(c);
  }

  body.appendChild(svg);
}

function renderAccuracyCard(parent: HTMLElement, data: Array<{ tag: string; accuracy: number; reviewCount: number }>): void {
  const card = parent.createDiv({ cls: 'st-card gs-card' });
  const head = card.createDiv({ cls: 'st-card-head' });
  const headL = head.createDiv({ cls: 'st-card-head-l' });
  headL.createDiv({ cls: 'st-card-en gs-en', text: 'ACCURACY BY TAG' });
  headL.createDiv({ cls: 'st-card-zh', text: '标签准确率' });

  const body = card.createDiv({ cls: 'st-card-body st-acc' });
  const sorted = [...data].sort((a, b) => b.accuracy - a.accuracy).slice(0, 10);

  for (const t of sorted) {
    const tone = t.accuracy >= 85 ? 'green' : t.accuracy >= 70 ? 'gold' : 'clay';
    const parts = t.tag.split('/');
    const leaf = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join(' / ');

    const row = body.createDiv({ cls: 'st-acc-row' });
    const label = row.createDiv({ cls: 'st-acc-l' });
    label.createDiv({ cls: 'st-acc-leaf', text: leaf });
    if (parentPath) label.createDiv({ cls: 'st-acc-parent gs-en', text: parentPath });

    const barWrap = row.createDiv({ cls: 'st-acc-bar-wrap' });
    const bar = barWrap.createDiv({ cls: `st-acc-bar st-acc-bar-${tone}` });
    bar.style.width = `${t.accuracy}%`;

    const pct = row.createDiv({ cls: `st-acc-pct gs-mono st-acc-pct-${tone}` });
    pct.textContent = String(t.accuracy);
    pct.createSpan({ text: '%' });

    row.createDiv({ cls: 'st-acc-n gs-mono', text: `n=${t.reviewCount}` });
  }
}

function renderForgetCard(parent: HTMLElement, data: Array<{ intervalDays: number; retention: number; sampleSize: number }>): void {
  const card = parent.createDiv({ cls: 'st-card gs-card' });
  const head = card.createDiv({ cls: 'st-card-head' });
  const headL = head.createDiv({ cls: 'st-card-head-l' });
  headL.createDiv({ cls: 'st-card-en gs-en', text: 'FORGETTING CURVE' });
  headL.createDiv({ cls: 'st-card-zh', text: '记忆曲线' });

  const body = card.createDiv({ cls: 'st-card-body st-chart' });

  if (data.length === 0) {
    body.createDiv({ cls: 'gs-placeholder', text: '数据不足' });
    return;
  }

  const W = 320, H = 200, P = { l: 30, r: 12, t: 14, b: 24 };
  const maxD = Math.max(...data.map(p => p.intervalDays), 1);
  const xs = data.map(p => P.l + (Math.log(Math.max(1, p.intervalDays)) / Math.log(maxD)) * (W - P.l - P.r));
  const ys = data.map(p => P.t + (1 - p.retention / 100) * (H - P.t - P.b));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width = '100%'; svg.style.height = '200px';

  // Line
  if (data.length > 1) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M' + xs.map((x, i) => `${x},${ys[i]}`).join(' L'));
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'var(--gs-clay)'); path.setAttribute('stroke-width', '1.8');
    svg.appendChild(path);
  }

  // Dots
  for (let i = 0; i < data.length; i++) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(xs[i])); c.setAttribute('cy', String(ys[i]));
    c.setAttribute('r', '3'); c.setAttribute('fill', 'var(--gs-card)');
    c.setAttribute('stroke', 'var(--gs-clay)'); c.setAttribute('stroke-width', '1.6');
    svg.appendChild(c);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(xs[i])); text.setAttribute('y', String(H - 6));
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '9');
    text.setAttribute('fill', 'var(--gs-ink-3)'); text.setAttribute('font-family', 'var(--gs-font-mono)');
    text.textContent = `${data[i].intervalDays}d`;
    svg.appendChild(text);
  }

  body.appendChild(svg);

  const legend = body.createDiv({ cls: 'st-fc-legend' });
  const left = legend.createDiv();
  left.innerHTML = '<span class="st-fc-dot"></span>实际记忆保持';
  legend.createDiv({ cls: 'gs-en st-fc-axis', text: 'X: INTERVAL (LOG) \u00B7 Y: RETENTION' });
}

function renderHeatmapCard(parent: HTMLElement, cells: number[]): void {
  const card = parent.createDiv({ cls: 'st-card gs-card' });
  const head = card.createDiv({ cls: 'st-card-head' });
  const headL = head.createDiv({ cls: 'st-card-head-l' });
  headL.createDiv({ cls: 'st-card-en gs-en', text: 'STUDY HEATMAP' });
  headL.createDiv({ cls: 'st-card-zh', text: '打卡热力图' });

  const body = card.createDiv({ cls: 'st-card-body st-chart' });
  const cols = 12, rows = 7, cell = 14, gap = 3;
  const palette = ['var(--gs-line)', 'var(--gs-green-soft)', '#9bbcaa', '#5b8d75', 'var(--gs-green)'];
  const labels = ['一', '', '三', '', '五', '', '日'];
  const W = cols * (cell + gap) - gap + 16;
  const H = rows * (cell + gap) - gap + 18;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width = '100%'; svg.style.height = 'auto';

  for (let r = 0; r < rows; r++) {
    if (labels[r]) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '0'); text.setAttribute('y', String(r * (cell + gap) + cell - 3));
      text.setAttribute('font-size', '8'); text.setAttribute('fill', 'var(--gs-ink-3)');
      text.textContent = labels[r];
      svg.appendChild(text);
    }
  }

  for (let i = 0; i < cells.length; i++) {
    const c = Math.floor(i / rows), r = i % rows;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(c * (cell + gap) + 14)); rect.setAttribute('y', String(r * (cell + gap)));
    rect.setAttribute('width', String(cell)); rect.setAttribute('height', String(cell));
    rect.setAttribute('rx', '2.5'); rect.setAttribute('fill', palette[Math.min(4, Math.max(0, cells[i]))]);
    svg.appendChild(rect);
  }

  body.appendChild(svg);

  const legend = body.createDiv({ cls: 'st-hm-legend' });
  legend.createSpan({ cls: 'gs-en', text: 'LESS' });
  for (const c of palette) {
    const dot = legend.createSpan({ cls: 'st-hm-dot' });
    dot.style.background = c;
  }
  legend.createSpan({ cls: 'gs-en', text: 'MORE' });
}

function renderMinutesCard(parent: HTMLElement, data: Array<{ date: string; minutes: number }>): void {
  const card = parent.createDiv({ cls: 'st-card gs-card' });
  const head = card.createDiv({ cls: 'st-card-head' });
  const headL = head.createDiv({ cls: 'st-card-head-l' });
  headL.createDiv({ cls: 'st-card-en gs-en', text: 'STUDY MINUTES' });
  headL.createDiv({ cls: 'st-card-zh', text: '学习时长' });

  const body = card.createDiv({ cls: 'st-card-body st-chart' });
  const values = data.map(d => d.minutes);
  const W = 320, H = 200, P = { l: 26, r: 8, t: 14, b: 24 };
  const max = Math.max(...values, 1);
  const bw = (W - P.l - P.r) / values.length;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width = '100%'; svg.style.height = '200px';

  for (let i = 0; i < values.length; i++) {
    const h = (values[i] / max) * (H - P.t - P.b);
    const x = P.l + i * bw;
    const y = H - P.b - h;
    const isWeekend = (i % 7 === 5 || i % 7 === 6);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x + 0.5)); rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(bw - 1)); rect.setAttribute('height', String(Math.max(0, h)));
    rect.setAttribute('rx', '1.5');
    rect.setAttribute('fill', values[i] === 0 ? 'var(--gs-line)' : (isWeekend ? 'var(--gs-gold)' : 'var(--gs-green-2)'));
    rect.setAttribute('opacity', values[i] === 0 ? '0.5' : '1');
    svg.appendChild(rect);
  }

  body.appendChild(svg);

  const legend = body.createDiv({ cls: 'st-mb-legend gs-en' });
  const wd = legend.createDiv();
  wd.innerHTML = '<span class="st-mb-dot" style="background:var(--gs-green-2)"></span> WEEKDAY';
  const we = legend.createDiv();
  we.innerHTML = '<span class="st-mb-dot" style="background:var(--gs-gold)"></span> WEEKEND';
  const activeMin = values.filter(v => v > 0);
  const avg = activeMin.length > 0 ? Math.round(activeMin.reduce((a, b) => a + b, 0) / activeMin.length) : 0;
  const avgDiv = legend.createDiv({ cls: 'st-mb-avg' });
  avgDiv.innerHTML = `AVG <strong class="gs-mono">${avg}</strong> min/active day`;
}
