import { CardState, Rating, SrsParams } from '../card/types';
import { schedule } from '../srs/sm2';

interface SimPoint {
  review: number;
  interval: number;
  ease: number;
}

function simulate(params: SrsParams, ratings: Rating[], count: number): SimPoint[] {
  let state: CardState = { interval: 0, ease: params.initialEase, reviewCount: 0 };
  const points: SimPoint[] = [];
  for (let i = 0; i < count; i++) {
    const rating = ratings[i % ratings.length];
    state = schedule(state, rating, params);
    points.push({ review: i + 1, interval: state.interval, ease: state.ease });
  }
  return points;
}

const SERIES = [
  { label: '全 Good', ratings: ['good'] as Rating[], color: 'var(--gs-green, #1f4d3a)' },
  { label: '全 Easy', ratings: ['easy'] as Rating[], color: 'var(--gs-green-2, #6fa68b)' },
  { label: 'Good/Hard 交替', ratings: ['good', 'hard'] as Rating[], color: 'var(--gs-gold, #b8956a)' },
  { label: 'Again → 恢复', ratings: ['again', 'good', 'good', 'good', 'good', 'good', 'good', 'good', 'good', 'good'] as Rating[], color: 'var(--gs-clay, #b83420)' },
];

const STEPS = 10;

export function renderSrsVisualization(container: HTMLElement, params: SrsParams): void {
  container.empty();
  container.addClass('gs-srs-viz');

  // Simulate all series
  const allSeries = SERIES.map(s => ({
    ...s,
    points: simulate(params, s.ratings, STEPS),
  }));

  // Chart dimensions
  const W = 480, H = 200;
  const PAD = { top: 16, right: 16, bottom: 28, left: 48 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const maxInterval = Math.max(10, ...allSeries.flatMap(s => s.points.map(p => p.interval)));

  const xScale = (review: number) => PAD.left + ((review - 1) / (STEPS - 1)) * cw;
  const yScale = (interval: number) => PAD.top + ch - (interval / maxInterval) * ch;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'gs-srs-chart');
  svg.style.width = '100%';
  svg.style.maxWidth = `${W}px`;

  // Grid lines
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = PAD.top + (ch / gridSteps) * i;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(PAD.left));
    line.setAttribute('x2', String(W - PAD.right));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--gs-line, #e0ddd6)');
    line.setAttribute('stroke-width', '0.5');
    svg.appendChild(line);

    const val = Math.round(maxInterval * (1 - i / gridSteps));
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(PAD.left - 6));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'gs-srs-chart-label');
    label.textContent = `${val}d`;
    svg.appendChild(label);
  }

  // X-axis labels
  for (let i = 0; i < STEPS; i++) {
    const x = xScale(i + 1);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(x));
    label.setAttribute('y', String(H - 6));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'gs-srs-chart-label');
    label.textContent = String(i + 1);
    svg.appendChild(label);
  }

  // Lines + dots
  for (const series of allSeries) {
    const pathParts = series.points.map((p, i) => {
      const x = xScale(p.review);
      const y = yScale(p.interval);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathParts.join(' '));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', series.color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    for (const p of series.points) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(xScale(p.review)));
      circle.setAttribute('cy', String(yScale(p.interval)));
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', series.color);
      svg.appendChild(circle);
    }
  }

  container.appendChild(svg);

  // Legend
  const legend = container.createDiv({ cls: 'gs-srs-legend' });
  for (const s of allSeries) {
    const item = legend.createDiv({ cls: 'gs-srs-legend-item' });
    const dot = item.createSpan({ cls: 'gs-srs-legend-dot' });
    dot.style.background = s.color;
    item.createSpan({ text: s.label });
  }

  // Key callouts
  const callouts = container.createDiv({ cls: 'gs-srs-callouts' });
  const goodSeries = allSeries[0].points;
  const easySeries = allSeries[1].points;

  const addCallout = (label: string, value: string) => {
    const c = callouts.createDiv({ cls: 'gs-srs-callout' });
    c.createSpan({ cls: 'gs-srs-callout-val gs-mono', text: value });
    c.createSpan({ cls: 'gs-srs-callout-label', text: label });
  };

  addCallout('5×Good 间隔', `${goodSeries[4]?.interval ?? 0} 天`);
  addCallout('10×Good 间隔', `${goodSeries[9]?.interval ?? 0} 天`);
  addCallout('5×Easy 间隔', `${easySeries[4]?.interval ?? 0} 天`);

  // Again recovery: how many Good reviews to recover to baseline from Again
  const againSeries = allSeries[3].points;
  const baseline = goodSeries[0]?.interval ?? 1;
  const recoveryIdx = againSeries.findIndex((p, i) => i > 0 && p.interval >= baseline);
  const recoveryLabel = recoveryIdx > 0 ? `${recoveryIdx} 次 Good` : '—';
  addCallout('Again 恢复', recoveryLabel);
}
