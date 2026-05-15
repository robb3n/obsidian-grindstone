import { App, Modal } from 'obsidian';
import { DataStore } from '../storage/data-store';

type WriteMode = 'readonly' | 'ids' | 'ids-stars';

interface ModeOption {
  mode: WriteMode;
  zh: string;
  en: string;
  desc: string;
  warning?: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: 'readonly',
    zh: '完全只读',
    en: 'READ-ONLY',
    desc: '不修改任何笔记。卡片身份由文件路径 + 题面哈希推导。',
    warning: '重命名文件或修改卡片标题会导致复习历史丢失。',
  },
  {
    mode: 'ids',
    zh: '嵌入卡片 ID',
    en: 'EMBED IDS',
    desc: '在触发标签行尾添加 <!-- gs:xxxxxxxx --> 注释（一次性）。复习历史在重命名、移动、编辑后依然保留。',
  },
  {
    mode: 'ids-stars',
    zh: '嵌入 ID + 写回星号',
    en: 'EMBED IDS + WRITE STARS',
    desc: '在以上基础上，按评分写入 ⭐ 标记：Again=⭐⭐⭐ / Hard=⭐⭐ / Good=⭐ / Easy=（清除）。',
  },
];

export class OnboardingModal extends Modal {
  private triggerTag = '#grind';
  private mode: WriteMode = 'ids';
  private finished = false;

  constructor(
    app: App,
    private store: DataStore,
    /** Called once with true if user accepted, false if they dismissed (X / Esc / click outside). */
    private onFinish: (accepted: boolean) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('gs-onboarding-modal');
    const { contentEl } = this;
    contentEl.empty();

    // Header
    const head = contentEl.createDiv({ cls: 'gs-ob-head' });
    head.createDiv({ cls: 'gs-ob-eyebrow gs-en', text: 'WELCOME · 欢迎' });
    head.createEl('h2', { cls: 'gs-ob-title', text: '磨石 Grindstone' });
    head.createEl('p', {
      cls: 'gs-ob-sub',
      text: '基于内联标签的间隔重复 — 笔记中含有触发标签的行会变成复习卡片。',
    });

    // ── Section 1: trigger tag ──
    const sec1 = contentEl.createDiv({ cls: 'gs-ob-section' });
    const sec1H = sec1.createDiv({ cls: 'gs-ob-section-h' });
    sec1H.createSpan({ cls: 'gs-ob-section-zh', text: '触发标签' });
    sec1H.createSpan({ cls: 'gs-ob-section-en gs-en', text: 'TRIGGER TAG' });

    const tagInput = sec1.createEl('input', { cls: 'gs-ob-input', type: 'text' });
    tagInput.value = this.triggerTag;
    tagInput.placeholder = '#grind';
    tagInput.addEventListener('input', () => {
      this.triggerTag = tagInput.value.trim();
    });

    sec1.createDiv({
      cls: 'gs-ob-hint',
      text: '稍后可在 Settings 里添加更多触发标签或排除规则。',
    });

    // ── Section 2: write mode ──
    const sec2 = contentEl.createDiv({ cls: 'gs-ob-section' });
    const sec2H = sec2.createDiv({ cls: 'gs-ob-section-h' });
    sec2H.createSpan({ cls: 'gs-ob-section-zh', text: '与笔记的交互方式' });
    sec2H.createSpan({ cls: 'gs-ob-section-en gs-en', text: 'NOTE WRITEBACK' });

    sec2.createDiv({
      cls: 'gs-ob-hint',
      text: '默认情况下，磨石把 vault 视为只读。下列两项会修改你的笔记，按需开启。',
    });

    const optionsWrap = sec2.createDiv({ cls: 'gs-ob-options' });
    for (const opt of MODE_OPTIONS) {
      const el = optionsWrap.createDiv({
        cls: `gs-ob-option${opt.mode === this.mode ? ' gs-ob-option-active' : ''}`,
        attr: { 'data-mode': opt.mode },
      });
      const header = el.createDiv({ cls: 'gs-ob-option-h' });
      const radio = header.createSpan({ cls: 'gs-ob-radio' });
      if (opt.mode === this.mode) radio.addClass('gs-ob-radio-on');
      header.createSpan({ cls: 'gs-ob-option-zh', text: opt.zh });
      header.createSpan({ cls: 'gs-ob-option-en gs-en', text: opt.en });
      if (opt.mode === 'ids') {
        header.createSpan({ cls: 'gs-ob-option-rec gs-en', text: 'RECOMMENDED' });
      }
      el.createDiv({ cls: 'gs-ob-option-desc', text: opt.desc });
      if (opt.warning) {
        el.createDiv({ cls: 'gs-ob-warning', text: `⚠ ${opt.warning}` });
      }

      el.addEventListener('click', () => {
        this.mode = opt.mode;
        optionsWrap.querySelectorAll('.gs-ob-option').forEach(e => e.removeClass('gs-ob-option-active'));
        optionsWrap.querySelectorAll('.gs-ob-radio').forEach(e => e.removeClass('gs-ob-radio-on'));
        el.addClass('gs-ob-option-active');
        radio.addClass('gs-ob-radio-on');
      });
    }

    // ── Actions ──
    const actions = contentEl.createDiv({ cls: 'gs-ob-actions' });
    const startBtn = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '开始使用 →' });
    startBtn.addEventListener('click', () => this.finish());
  }

  private async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;

    const triggerTags = this.triggerTag.length > 0 ? [this.triggerTag] : ['#grind'];
    await this.store.updateSettings({
      triggerTags,
      embedCardIds: this.mode !== 'readonly',
      writeStarsBack: this.mode === 'ids-stars',
      _onboardingDone: true,
    });
    this.close();
    await this.onFinish(true);
  }

  onClose(): void {
    this.contentEl.empty();
    // Dismiss-without-accept (X / Esc / click outside): leave _onboardingDone unset
    // and signal the host to disable the plugin. Re-enabling re-prompts.
    //
    // Defer to next tick: self-disabling from within a modal lifecycle hook is
    // a known Obsidian quirk — the plugin can be unloaded before the modal
    // finishes tearing down, which silently swallows the disable. Letting the
    // current call stack unwind first avoids that race.
    if (!this.finished) {
      this.finished = true;
      window.setTimeout(() => { void this.onFinish(false); }, 0);
    }
  }
}
