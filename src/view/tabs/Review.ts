import { TabContext } from './types';
import { renderDeckTable } from './Decks';

export function renderReview(container: HTMLElement, ctx: TabContext): void {
  const dueCards = ctx.store.getDueCards();
  const dueCount = dueCards.length;
  const newCount = ctx.store.getDueNewCount();
  const streak = ctx.store.getOverviewStats().streak;
  const sessions = ctx.store.getRecentSessions(7);

  // ── Page Head ──
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  headL.createDiv({ cls: 'gs-pagehead-eyebrow gs-en', text: 'REVIEW \u00B7 复习' });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: '复习' });
  const headR = head.createDiv({ cls: 'gs-pagehead-r' });
  headR.createSpan({ cls: 'gs-pill gs-pill-clay', text: `${dueCount} 待复习` });
  headR.createSpan({ cls: 'gs-pill', text: `连续 ${streak} 天` });

  // ── Page Body ──
  const page = container.createDiv({ cls: 'gs-page rv-page' });

  // Tabs
  let activeTab = 'launch';
  const tabs = page.createDiv({ cls: 'rv-tabs' });
  const sectionWrap = page.createDiv({ cls: 'rv-section-wrap' });

  const SECTIONS = [
    { id: 'launch', zh: '启动', en: 'PRE-FLIGHT' },
    { id: 'decks', zh: '卡组', en: 'DECKS' },
    { id: 'debrief', zh: '复盘', en: 'DEBRIEF' },
  ];

  const renderTabs = () => {
    tabs.empty();
    for (const s of SECTIONS) {
      const btn = tabs.createEl('button', { cls: `rv-tab${activeTab === s.id ? ' rv-tab-on' : ''}` });
      btn.createSpan({ cls: 'rv-tab-zh', text: s.zh });
      btn.createSpan({ cls: 'rv-tab-en gs-en', text: s.en });
      btn.addEventListener('click', () => { activeTab = s.id; renderTabs(); renderSection(); });
    }
    tabs.createDiv({ cls: 'rv-tabs-rule' });
  };

  const renderSection = () => {
    sectionWrap.empty();
    if (activeTab === 'launch') renderLaunch(sectionWrap, dueCount, newCount, ctx);
    else if (activeTab === 'decks') renderDeckTable(sectionWrap, ctx);
    else if (activeTab === 'debrief') renderDebrief(sectionWrap, sessions, ctx);
  };

  renderTabs();
  renderSection();
}

// ── Launch ──

function renderLaunch(
  parent: HTMLElement,
  dueCount: number, newCount: number,
  ctx: TabContext,
): void {
  const launch = parent.createDiv({ cls: 'rv-launch' });
  const left = launch.createDiv({ cls: 'rv-launch-l' });

  // Header
  const hdr = left.createDiv({ cls: 'rv-launch-h' });
  hdr.createDiv({ cls: 'rv-launch-eyebrow gs-en', text: 'PRE-FLIGHT \u00B7 进入会话前' });
  hdr.createEl('h2', { cls: 'rv-launch-title', text: '今日复习' });
  hdr.createEl('p', { cls: 'rv-launch-sub', text: '由 SRS 调度的到期队列 \u00B7 评分计入统计、影响后续间隔' });

  // Auto queue card
  const autoCard = left.createDiv({ cls: 'rv-auto-card' });
  const autoH = autoCard.createDiv({ cls: 'rv-auto-h' });
  const autoHL = autoH.createDiv({ cls: 'rv-auto-h-l' });
  autoHL.createSpan({ cls: 'rv-auto-zh', text: 'SRS 调度的到期队列' });
  autoHL.createSpan({ cls: 'rv-auto-en gs-en', text: '由 SM-2 调度 \u00B7 不可手动配置' });
  autoH.createSpan({ cls: 'rv-auto-pill gs-mono', text: '计入统计' });

  const autoGrid = autoCard.createDiv({ cls: 'rv-auto-grid' });
  addAutoCell(autoGrid, String(dueCount), '到期 \u00B7 DUE');
  addAutoCell(autoGrid, String(newCount), '新卡 \u00B7 NEW');
  addAutoCell(autoGrid, `~${Math.round(dueCount * 1.4)}m`, '预计 \u00B7 ETA');

  autoCard.createDiv({ cls: 'rv-auto-foot gs-en', text: 'Again / Hard / Good / Easy 的评分会写回卡片，决定下次到期时间。' });

  // CTA button
  const cta = left.createEl('button', { cls: 'rv-launch-cta' });
  cta.createSpan({ cls: 'rv-launch-cta-zh', text: '开始今日复习' });
  const ctaMeta = cta.createSpan({ cls: 'rv-launch-cta-meta gs-mono' });
  ctaMeta.textContent = `${dueCount} cards \u00B7 ~${Math.round(dueCount * 1.4)}m \u00B7 tracked`;
  cta.innerHTML += `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  cta.addEventListener('click', () => ctx.startReviewModal());

  // Keyboard hints
  const kbds = left.createDiv({ cls: 'rv-launch-kbds gs-en' });
  kbds.createSpan({ text: 'SPACE 翻面' });
  kbds.createSpan({ text: '\u00B7' });
  kbds.createSpan({ text: '1\u20144 评分' });
  kbds.createSpan({ text: '\u00B7' });
  kbds.createSpan({ text: 'ESC 暂停' });

}

function addAutoCell(parent: HTMLElement, value: string, label: string): void {
  const cell = parent.createDiv({ cls: 'rv-auto-cell' });
  cell.createDiv({ cls: 'rv-auto-num gs-mono', text: value });
  cell.createDiv({ cls: 'rv-auto-cap', text: label });
}

// ── History ──

function renderHistory(parent: HTMLElement, sessions: any[]): void {
  const hist = parent.createDiv({ cls: 'rv-history' });

  // KPI strip
  const totalCards = sessions.reduce((a: number, s: any) => a + s.cards, 0);
  const totalMin = sessions.reduce((a: number, s: any) => a + s.minutes, 0);
  const activeDays = sessions.filter((s: any) => s.cards > 0).length;

  const strip = hist.createDiv({ cls: 'rv-history-strip' });
  addHistKPI(strip, '近 7 日复习', 'CARDS', String(totalCards));
  addHistKPI(strip, '累计时长', 'MINUTES', `${totalMin}m`);
  addHistKPI(strip, '活跃天数', 'ACTIVE', `${activeDays} / 7`);
  addHistKPI(strip, '平均每日', 'AVG / DAY', String(Math.round(totalCards / 7)));

  // Session list
  const list = hist.createEl('ul', { cls: 'rv-history-list' });
  for (const s of sessions) {
    const row = list.createEl('li', { cls: `rv-hist-row${s.cards === 0 ? ' rv-hist-skip' : ''}` });
    const dateDiv = row.createDiv({ cls: 'rv-hist-date' });
    dateDiv.createSpan({ cls: 'rv-hist-date-d gs-mono', text: s.date });

    if (s.cards === 0) {
      row.createDiv({ cls: 'rv-hist-empty gs-en', text: '\u2014 rest day \u00B7 留白 \u2014' });
    } else {
      const meta = row.createDiv({ cls: 'rv-hist-meta' });
      const nSpan = meta.createSpan({ cls: 'rv-hist-n gs-mono' });
      nSpan.textContent = String(s.cards);
      nSpan.createSpan({ text: ' 张' });
      const mSpan = meta.createSpan({ cls: 'rv-hist-m gs-mono' });
      mSpan.textContent = String(s.minutes);
      mSpan.createSpan({ text: 'm' });

      // Rating bar
      const barDiv = row.createDiv({ cls: 'rv-hist-bar' });
      if (s.ratings) renderRatingBar(barDiv, s.ratings, s.cards);

      // Scope
      row.createDiv({ cls: 'rv-hist-scope gs-mono', text: s.scope?.join(' + ') || '' });
    }
  }
}

function addHistKPI(parent: HTMLElement, zh: string, en: string, value: string): void {
  const kpi = parent.createDiv({ cls: 'rv-histkpi' });
  kpi.createDiv({ cls: 'rv-histkpi-num gs-mono gs-tabular', text: value });
  const label = kpi.createDiv({ cls: 'rv-histkpi-l' });
  label.createSpan({ cls: 'rv-histkpi-zh', text: zh });
  label.createSpan({ cls: 'rv-histkpi-en gs-en', text: en });
}

function renderRatingBar(parent: HTMLElement, ratings: Record<string, number>, total: number): void {
  const bar = parent.createDiv({ cls: 'rv-ratebar' });
  const segs = [
    { k: 'again', v: ratings.again ?? 0, c: 'var(--gs-clay)' },
    { k: 'hard', v: ratings.hard ?? 0, c: 'var(--gs-gold)' },
    { k: 'good', v: ratings.good ?? 0, c: 'var(--gs-green)' },
    { k: 'easy', v: ratings.easy ?? 0, c: 'var(--gs-green-2)' },
  ];
  for (const s of segs) {
    if (s.v > 0) {
      const seg = bar.createDiv({ cls: 'rv-ratebar-seg' });
      seg.style.flex = String(s.v);
      seg.style.background = s.c;
      seg.createSpan({ cls: 'rv-ratebar-n gs-mono', text: String(s.v) });
    }
  }
}

// ── Debrief ──

function renderDebrief(parent: HTMLElement, sessions: any[], ctx: TabContext): void {
  const last = sessions.find((s: any) => s.cards > 0);
  if (!last) {
    parent.createDiv({ cls: 'rv-debrief-empty', text: '尚无可复盘的会话' });
    return;
  }

  const debrief = parent.createDiv({ cls: 'rv-debrief' });
  const r = last.ratings;
  const accuracy = r ? Math.round(((r.good + r.easy) / last.cards) * 100) : 0;

  // Header
  const hdr = debrief.createEl('header', { cls: 'rv-debrief-h' });
  const hdrL = hdr.createDiv();
  hdrL.createDiv({ cls: 'rv-debrief-eyebrow gs-en', text: `DEBRIEF \u00B7 上次会话 \u00B7 ${last.date}` });
  hdrL.createEl('h2', { cls: 'rv-debrief-title', text: `${last.cards} 张 \u00B7 ${last.minutes} 分钟` });
  hdrL.createEl('p', { cls: 'rv-debrief-scope gs-mono', text: last.scope?.join(' + ') || '' });

  const accDiv = hdr.createDiv({ cls: 'rv-debrief-acc' });
  const accNum = accDiv.createDiv({ cls: 'rv-debrief-acc-num gs-mono' });
  accNum.textContent = String(accuracy);
  accNum.createSpan({ text: '%' });
  const accLabel = accDiv.createDiv({ cls: 'rv-debrief-acc-l' });
  accLabel.createSpan({ text: '正确率' });
  accLabel.createSpan({ cls: 'gs-en', text: 'ACCURACY' });

  // Rating grid
  if (r) {
    const grid = debrief.createDiv({ cls: 'rv-debrief-grid' });
    addDebriefRate(grid, 'Again', '重来', '1', r.again ?? 0, last.cards, 'var(--gs-clay)');
    addDebriefRate(grid, 'Hard', '难', '2', r.hard, last.cards, 'var(--gs-gold)');
    addDebriefRate(grid, 'Good', '可', '3', r.good, last.cards, 'var(--gs-green)');
    addDebriefRate(grid, 'Easy', '易', '4', r.easy, last.cards, 'var(--gs-green-2)');
  }

  // Distribution bar
  if (r) {
    const barSection = debrief.createDiv({ cls: 'rv-debrief-bar' });
    barSection.createDiv({ cls: 'rv-debrief-bar-h gs-en', text: 'DISTRIBUTION' });
    renderRatingBar(barSection, r, last.cards);
  }

  // Actions
  const actions = debrief.createDiv({ cls: 'rv-debrief-actions' });
  const btnOverview = actions.createEl('button', { cls: 'gs-btn', text: '返回概览' });
  btnOverview.addEventListener('click', () => ctx.onNavigate('overview'));
  const btnStats = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '查看完整统计 →' });
  btnStats.addEventListener('click', () => ctx.onNavigate('stats'));

  // History (merged below debrief)
  renderHistory(debrief, sessions);
}

function addDebriefRate(parent: HTMLElement, label: string, zh: string, key: string, value: number, total: number, color: string): void {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const card = parent.createDiv({ cls: 'rv-debrief-rate' });
  card.style.setProperty('--c', color);
  const hdr = card.createDiv({ cls: 'rv-debrief-rate-h' });
  hdr.createSpan({ cls: 'rv-debrief-rate-zh', text: zh });
  hdr.createSpan({ cls: 'rv-debrief-rate-en gs-en', text: label });
  hdr.createEl('kbd', { cls: 'rv-kbd', text: key });
  card.createDiv({ cls: 'rv-debrief-rate-num gs-mono', text: String(value) });
  card.createDiv({ cls: 'rv-debrief-rate-pct gs-mono', text: `${pct}%` });
}
