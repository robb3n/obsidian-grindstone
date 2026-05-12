import { Component, MarkdownRenderer, TFile } from 'obsidian';
import { Rating } from '../../card/types';
import { ReviewEngine, formatInterval } from '../../review/review-engine';
import { TabContext } from './types';
import { countUp } from '../anim';

const RATING_DEFS: { rating: Rating; zh: string; en: string; key: string; cls: string }[] = [
  { rating: 'again', zh: '重来', en: 'Again', key: '1', cls: 'rv-live-r-again' },
  { rating: 'hard',  zh: '难',   en: 'Hard',  key: '2', cls: 'rv-live-r-hard' },
  { rating: 'good',  zh: '可',   en: 'Good',  key: '3', cls: 'rv-live-r-good' },
  { rating: 'easy',  zh: '易',   en: 'Easy',  key: '4', cls: 'rv-live-r-easy' },
];

export function renderReview(container: HTMLElement, ctx: TabContext): void {
  const engine = ctx.getReviewEngine();

  if (engine && !engine.isComplete()) {
    renderLiveReview(container, engine, ctx);
  } else if (engine && engine.isComplete()) {
    renderLiveComplete(container, engine, ctx);
  } else {
    renderPreFlight(container, ctx);
  }
}

// ═══════════════════════════════════════════════════════
// Pre-Flight (original review tab)
// ═══════════════════════════════════════════════════════

function renderPreFlight(container: HTMLElement, ctx: TabContext): void {
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
  addAutoCell(autoGrid, dueCount, '到期 \u00B7 DUE', undefined, 0);
  addAutoCell(autoGrid, newCount, '新卡 \u00B7 NEW', undefined, 60);
  addAutoCell(autoGrid, Math.round(dueCount * 1.4), '预计 · ETA', (n) => `~${n}m`, 120);

  autoCard.createDiv({ cls: 'rv-auto-foot gs-en', text: 'Again / Hard / Good / Easy 的评分会写回卡片，决定下次到期时间。' });

  // CTA button — starts inline review
  const cta = left.createEl('button', { cls: 'rv-launch-cta' });
  cta.createSpan({ cls: 'rv-launch-cta-zh', text: '开始今日复习' });
  const ctaMeta = cta.createSpan({ cls: 'rv-launch-cta-meta gs-mono' });
  ctaMeta.textContent = `${dueCount} cards \u00B7 ~${Math.round(dueCount * 1.4)}m \u00B7 tracked`;
  cta.innerHTML += `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  cta.addEventListener('click', () => ctx.startInlineReview());

  // Keyboard hints
  const kbds = left.createDiv({ cls: 'rv-launch-kbds gs-en' });
  kbds.createSpan({ text: 'SPACE 翻面' });
  kbds.createSpan({ text: '\u00B7' });
  kbds.createSpan({ text: '1\u20144 评分' });
  kbds.createSpan({ text: '\u00B7' });
  kbds.createSpan({ text: 'ESC 暂停' });
}

function addAutoCell(
  parent: HTMLElement,
  value: number | string,
  label: string,
  format?: (n: number) => string,
  delay = 0,
): void {
  const cell = parent.createDiv({ cls: 'rv-auto-cell' });
  const num = cell.createDiv({ cls: 'rv-auto-num gs-mono' });
  if (typeof value === 'number') {
    countUp(num, value, 900, delay, format);
  } else {
    num.textContent = value;
  }
  cell.createDiv({ cls: 'rv-auto-cap', text: label });
}

// ═══════════════════════════════════════════════════════
// Live Review (master-detail split layout)
// Left: session context (matches pre-flight style)
// Right: active card
// ═══════════════════════════════════════════════════════

function renderLiveReview(container: HTMLElement, engine: ReviewEngine, ctx: TabContext): void {
  const item = engine.getCurrentItem()!;
  const pos = engine.getPosition();
  const autoShow = engine.isAutoShow();
  const component = new Component();
  component.load();

  let answerShown = autoShow;
  let cardDisplayedAt = Date.now();

  const doneCount = pos.current - 1;
  const remaining = pos.total - pos.current + 1;

  // ── Page Head (same style as pre-flight) ──
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  headL.createDiv({ cls: 'gs-pagehead-eyebrow gs-en', text: `IN SESSION \u00B7 ${pos.current} / ${pos.total}` });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: '复习' });
  const headR = head.createDiv({ cls: 'gs-pagehead-r' });
  headR.createSpan({ cls: 'gs-pill gs-pill-green', text: `${doneCount} 已完成` });
  headR.createSpan({ cls: 'gs-pill gs-pill-clay', text: `${remaining} 剩余` });

  // Progress bar
  const progressBar = container.createDiv({ cls: 'rv-live-progress' });
  progressBar.createDiv({ cls: 'rv-live-progress-fill' }).style.width = `${engine.getProgress() * 100}%`;

  // ── Split layout (same grid as rv-launch) ──
  const split = container.createDiv({ cls: 'gs-page rv-live-split' });

  // ── LEFT: Session context (mirrors pre-flight style) ──
  const left = split.createDiv({ cls: 'rv-live-left' });

  // Header (matches rv-launch-h)
  const hdr = left.createDiv({ cls: 'rv-launch-h' });
  hdr.createDiv({ cls: 'rv-launch-eyebrow gs-en', text: 'IN SESSION \u00B7 复习中' });
  hdr.createEl('h2', { cls: 'rv-launch-title', text: '今日复习' });
  hdr.createEl('p', { cls: 'rv-launch-sub', text: `共 ${pos.total} 张 \u00B7 已完成 ${doneCount} \u00B7 剩余 ${remaining}` });

  // Session stats card (matches rv-auto-card style)
  const autoCard = left.createDiv({ cls: 'rv-auto-card' });
  const autoH = autoCard.createDiv({ cls: 'rv-auto-h' });
  const autoHL = autoH.createDiv({ cls: 'rv-auto-h-l' });
  autoHL.createSpan({ cls: 'rv-auto-zh', text: '当前进度' });
  autoHL.createSpan({ cls: 'rv-auto-en gs-en', text: `CARD ${pos.current} OF ${pos.total}` });
  autoH.createSpan({ cls: 'rv-auto-pill gs-mono', text: `${Math.round(engine.getProgress() * 100)}%` });

  const autoGrid = autoCard.createDiv({ cls: 'rv-auto-grid' });
  addAutoCell(autoGrid, `${item.card.interval}d`, '间隔 \u00B7 INTERVAL');
  addAutoCell(autoGrid, item.card.ease.toFixed(2), '难度 \u00B7 EF');
  addAutoCell(autoGrid, `${item.card.reviewCount}`, '复习 \u00B7 REVIEWS');

  // Keyboard hints (matches rv-launch-kbds style)
  const kbds = left.createDiv({ cls: 'rv-launch-kbds gs-en' });
  kbds.createSpan({ text: 'SPACE 翻面' });
  kbds.createSpan({ text: '\u00B7' });
  kbds.createSpan({ text: '1\u20144 评分' });
  kbds.createSpan({ text: '\u00B7' });
  kbds.createSpan({ text: 'ESC 退出' });

  // Exit link (subtle, not a big button)
  const exitLink = left.createEl('button', { cls: 'rv-live-exit gs-en', text: '\u2190 EXIT SESSION' });
  exitLink.addEventListener('click', () => {
    component.unload();
    ctx.endInlineReview();
  });

  // ── RIGHT: Active card ──
  const right = split.createDiv({ cls: 'rv-live-right' });
  const card = right.createDiv({ cls: 'rv-live-card gs-card' });

  // Tags (tags already include #, don't add another)
  const tagRow = card.createDiv({ cls: 'rv-live-tags' });
  const uniqueTags = [...new Set(item.card.tags)];
  for (const tag of uniqueTags) {
    const display = tag.startsWith('#') ? tag : `#${tag}`;
    tagRow.createSpan({ cls: 'rv-live-tag', text: display });
  }

  // Question
  const questionEl = card.createDiv({ cls: 'rv-live-question' });
  MarkdownRenderer.render(ctx.app, item.card.blockTitle, questionEl, item.card.file, component);

  // Answer area
  const answerWrap = card.createDiv({ cls: 'rv-live-answer' });

  // Section label row
  const labelRow = card.createDiv({ cls: 'rv-live-labels' });
  const labelLeft2 = labelRow.createSpan({ cls: 'rv-live-label-l gs-en' });
  const labelRight2 = labelRow.createSpan({ cls: 'rv-live-label-r gs-en' });

  const updateLabels = () => {
    labelLeft2.textContent = answerShown ? 'ANSWER' : 'QUESTION';
    labelRight2.textContent = answerShown ? '' : 'SPACE 显示答案';
  };
  updateLabels();

  if (autoShow) {
    loadInlineAnswer(answerWrap, item, ctx, component);
  }

  // ── Action area (inside card) ──
  const actionArea = card.createDiv({ cls: 'rv-live-action-area' });

  // Show answer button
  const showAnswerBtn = actionArea.createEl('button', { cls: 'rv-live-show-btn' });
  showAnswerBtn.createSpan({ text: '显示答案' });
  showAnswerBtn.createEl('kbd', { cls: 'rv-kbd gs-mono', text: 'SPACE' });
  if (autoShow) showAnswerBtn.style.display = 'none';

  // Rating buttons
  const rateRow = actionArea.createDiv({ cls: 'rv-live-ratings' });
  if (!autoShow) rateRow.style.display = 'none';

  const previews = engine.previewIntervals();
  for (const def of RATING_DEFS) {
    const btn = rateRow.createEl('button', { cls: `rv-live-r ${def.cls}` });
    const topRow = btn.createDiv({ cls: 'rv-live-r-top' });
    topRow.createSpan({ cls: 'rv-live-r-zh', text: def.zh });
    topRow.createEl('kbd', { cls: 'rv-kbd gs-mono', text: def.key });
    btn.createDiv({ cls: 'rv-live-r-en gs-en', text: def.en });
    btn.createDiv({ cls: 'rv-live-r-interval gs-mono', text: previews[def.rating] });
    btn.addEventListener('click', () => doRate(def.rating));
  }

  // Toggle answer
  const toggleAnswer = async () => {
    if (!answerShown) {
      answerShown = true;
      await loadInlineAnswer(answerWrap, item, ctx, component);
      showAnswerBtn.style.display = 'none';
      rateRow.style.display = '';
      updateLabels();
    }
  };

  showAnswerBtn.addEventListener('click', toggleAnswer);

  // Rate handler
  const doRate = async (rating: Rating) => {
    const elapsed = Date.now() - cardDisplayedAt;
    await engine.rate(rating, elapsed);
    component.unload();
    ctx.refreshTab();
  };

  // Keyboard handler
  const keyHandler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.code === 'Space' && !answerShown) {
      e.preventDefault();
      toggleAnswer();
    } else if (answerShown) {
      const map: Record<string, Rating> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
      const rating = map[e.key];
      if (rating) {
        e.preventDefault();
        doRate(rating);
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      component.unload();
      ctx.endInlineReview();
    }
  };

  document.addEventListener('keydown', keyHandler);
  component.register(() => document.removeEventListener('keydown', keyHandler));
}

async function loadInlineAnswer(
  container: HTMLElement,
  item: { id: string; card: { file: string; blockTitle: string; tags: string[] } & Record<string, any> },
  ctx: TabContext,
  component: Component,
): Promise<void> {
  container.empty();
  container.createDiv({ cls: 'rv-live-divider' });
  const md = container.createDiv({ cls: 'rv-live-answer-md' });
  const blockContent = await ctx.cardManager.getBlockContent(item.card as any, item.id);
  await MarkdownRenderer.render(ctx.app, blockContent, md, item.card.file, component);
}

// ═══════════════════════════════════════════════════════
// Live Complete (session finished)
// ═══════════════════════════════════════════════════════

function renderLiveComplete(container: HTMLElement, engine: ReviewEngine, ctx: TabContext): void {
  const pos = engine.getPosition();

  // Header
  const head = container.createDiv({ cls: 'gs-pagehead' });
  const headL = head.createDiv({ cls: 'gs-pagehead-l' });
  headL.createDiv({ cls: 'gs-pagehead-eyebrow gs-en', text: 'SESSION COMPLETE' });
  headL.createEl('h1', { cls: 'gs-pagehead-title', text: '复习完成' });

  // Progress bar (full)
  const progressBar = container.createDiv({ cls: 'rv-live-progress' });
  progressBar.createDiv({ cls: 'rv-live-progress-fill' }).style.width = '100%';

  // Completion content
  const done = container.createDiv({ cls: 'rv-live-done' });
  done.createDiv({ cls: 'rv-live-done-eyebrow gs-en', text: 'SESSION COMPLETE' });
  done.createEl('h2', { cls: 'rv-live-done-title', text: '本次会话完成' });
  done.createEl('p', { cls: 'rv-live-done-sub', text: `${pos.total} 张 \u00B7 所有到期卡片已复习` });

  const actions = done.createDiv({ cls: 'rv-live-done-actions' });
  const backBtn = actions.createEl('button', { cls: 'gs-btn', text: '返回复习' });
  backBtn.addEventListener('click', () => ctx.endInlineReview());
  const statsBtn = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '查看统计 →' });
  statsBtn.addEventListener('click', () => {
    ctx.endInlineReview();
    ctx.onNavigate('stats');
  });
}

// ═══════════════════════════════════════════════════════
// History & Debrief (unchanged)
// ═══════════════════════════════════════════════════════

function renderHistory(parent: HTMLElement, sessions: any[]): void {
  const hist = parent.createDiv({ cls: 'rv-history' });

  const totalCards = sessions.reduce((a: number, s: any) => a + s.cards, 0);
  const totalMin = sessions.reduce((a: number, s: any) => a + s.minutes, 0);
  const activeDays = sessions.filter((s: any) => s.cards > 0).length;

  const strip = hist.createDiv({ cls: 'rv-history-strip' });
  addHistKPI(strip, '近 7 日复习', 'CARDS', String(totalCards));
  addHistKPI(strip, '累计时长', 'MINUTES', `${totalMin}m`);
  addHistKPI(strip, '活跃天数', 'ACTIVE', `${activeDays} / 7`);
  addHistKPI(strip, '平均每日', 'AVG / DAY', String(Math.round(totalCards / 7)));

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

      const barDiv = row.createDiv({ cls: 'rv-hist-bar' });
      if (s.ratings) renderRatingBar(barDiv, s.ratings, s.cards);

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

function renderDebrief(parent: HTMLElement, sessions: any[], ctx: TabContext): void {
  const last = sessions.find((s: any) => s.cards > 0);
  if (!last) {
    parent.createDiv({ cls: 'rv-debrief-empty', text: '尚无可复盘的会话' });
    return;
  }

  const debrief = parent.createDiv({ cls: 'rv-debrief' });
  const r = last.ratings;
  const accuracy = r ? Math.round(((r.good + r.easy) / last.cards) * 100) : 0;

  // ── Section 1: 上次会话 ──
  const sec1Head = debrief.createDiv({ cls: 'rv-section-head' });
  sec1Head.createEl('h2', { cls: 'rv-section-title', text: '上次会话' });
  sec1Head.createDiv({ cls: 'rv-section-sub gs-mono', text: `${last.date} \u00B7 ${last.minutes} 分钟` });

  const hdr = debrief.createEl('header', { cls: 'rv-debrief-h' });
  const hdrL = hdr.createDiv();
  hdrL.createEl('h2', { cls: 'rv-debrief-title', text: `${last.cards} 张 \u00B7 ${last.minutes} 分钟` });
  hdrL.createEl('p', { cls: 'rv-debrief-scope gs-mono', text: last.scope?.join(' + ') || '' });

  const accDiv = hdr.createDiv({ cls: 'rv-debrief-acc' });
  const accNum = accDiv.createDiv({ cls: 'rv-debrief-acc-num gs-mono' });
  accNum.textContent = String(accuracy);
  accNum.createSpan({ text: '%' });
  const accLabel = accDiv.createDiv({ cls: 'rv-debrief-acc-l' });
  accLabel.createSpan({ text: '正确率' });
  accLabel.createSpan({ cls: 'gs-en', text: 'ACCURACY' });

  if (r) {
    const grid = debrief.createDiv({ cls: 'rv-debrief-grid' });
    addDebriefRate(grid, 'Again', '重来', '1', r.again ?? 0, last.cards, 'var(--gs-clay)');
    addDebriefRate(grid, 'Hard', '难', '2', r.hard, last.cards, 'var(--gs-gold)');
    addDebriefRate(grid, 'Good', '可', '3', r.good, last.cards, 'var(--gs-green)');
    addDebriefRate(grid, 'Easy', '易', '4', r.easy, last.cards, 'var(--gs-green-2)');
  }

  if (r) {
    const barSection = debrief.createDiv({ cls: 'rv-debrief-bar' });
    barSection.createDiv({ cls: 'rv-debrief-bar-h gs-en', text: 'DISTRIBUTION' });
    renderRatingBar(barSection, r, last.cards);
  }

  const actions = debrief.createDiv({ cls: 'rv-debrief-actions' });
  const btnOverview = actions.createEl('button', { cls: 'gs-btn', text: '返回概览' });
  btnOverview.addEventListener('click', () => ctx.onNavigate('overview'));
  const btnStats = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '查看完整统计 →' });
  btnStats.addEventListener('click', () => ctx.onNavigate('stats'));

  // ── Section 2: 历史与累计 ──
  const sec2Head = debrief.createDiv({ cls: 'rv-section-head rv-section-head-2' });
  sec2Head.createEl('h2', { cls: 'rv-section-title', text: '历史与累计' });
  sec2Head.createDiv({ cls: 'rv-section-sub gs-mono', text: '近 7 日 \u00B7 RECENT 7 DAYS' });

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
