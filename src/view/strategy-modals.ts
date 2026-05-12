import { App, Modal } from 'obsidian';
import { GrindstoneStore } from '../store/GrindstoneStore';
import { BUILTIN_PRESETS, SrsPreset, DeckResetMode, SrsParams } from '../card/types';

// ── Reset Confirmation Modal ──
//
// Triggered when assigning a non-default strategy to a deck — prompts the user
// to choose how existing cards under that deck should adapt to new SRS params.

export class DeckResetConfirmModal extends Modal {
  private deckTag: string;
  private strategyName: string;
  private newParams: SrsParams;
  private gsStore: GrindstoneStore;
  private selectedMode: DeckResetMode = 'gradual';
  private onDone?: () => void;

  constructor(
    app: App,
    deckTag: string,
    strategyName: string,
    newParams: SrsParams,
    gsStore: GrindstoneStore,
    onDone?: () => void,
  ) {
    super(app);
    this.deckTag = deckTag;
    this.strategyName = strategyName;
    this.newParams = newParams;
    this.gsStore = gsStore;
    this.onDone = onDone;
  }

  onOpen(): void {
    this.modalEl.addClass('dk-reset-modal');
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: `切换策略: ${this.strategyName}` });
    contentEl.createDiv({
      cls: 'dk-reset-desc',
      text: `将 #${this.deckTag} 卡组的复习策略切换为「${this.strategyName}」。选择如何处理已有卡片：`,
    });

    const options: Array<{ mode: DeckResetMode; zh: string; en: string; desc: string; warning?: string }> = [
      {
        mode: 'gradual',
        zh: '渐进过渡',
        en: 'GRADUAL',
        desc: '仅后续复习使用新参数，已有卡片自然适应',
      },
      {
        mode: 'reset-ease',
        zh: '重置 Ease',
        en: 'RESET EASE',
        desc: `卡组内所有卡片的 Ease 重置为 ${this.newParams.initialEase}，保留间隔和进度`,
      },
      {
        mode: 'full-reset',
        zh: '完全重置',
        en: 'FULL RESET',
        desc: '卡片的 Ease、间隔、进度全部归零，相当于从头开始',
        warning: '此操作不可逆，所有复习进度将丢失',
      },
    ];

    const optionsWrap = contentEl.createDiv({ cls: 'dk-reset-options' });
    for (const opt of options) {
      const el = optionsWrap.createDiv({
        cls: `dk-reset-option${opt.mode === this.selectedMode ? ' dk-reset-option-active' : ''}`,
      });
      const header = el.createDiv({ cls: 'dk-reset-option-h' });
      const radio = header.createSpan({ cls: 'dk-reset-radio' });
      if (opt.mode === this.selectedMode) radio.addClass('dk-reset-radio-on');
      header.createSpan({ cls: 'dk-reset-option-zh', text: opt.zh });
      header.createSpan({ cls: 'dk-reset-option-en gs-en', text: opt.en });
      el.createDiv({ cls: 'dk-reset-option-desc', text: opt.desc });
      if (opt.warning) {
        el.createDiv({ cls: 'dk-reset-warning', text: `⚠ ${opt.warning}` });
      }

      el.addEventListener('click', () => {
        this.selectedMode = opt.mode;
        optionsWrap.querySelectorAll('.dk-reset-option').forEach(e => e.removeClass('dk-reset-option-active'));
        optionsWrap.querySelectorAll('.dk-reset-radio').forEach(e => e.removeClass('dk-reset-radio-on'));
        el.addClass('dk-reset-option-active');
        radio.addClass('dk-reset-radio-on');
      });
    }

    const actions = contentEl.createDiv({ cls: 'dk-reset-actions' });
    const cancelBtn = actions.createEl('button', { cls: 'gs-btn', text: '取消' });
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '确认切换' });
    confirmBtn.addEventListener('click', async () => {
      const presetValue = this.strategyName === '全局默认' ? null : this.findPresetId();
      await this.gsStore.setDeckStrategy(this.deckTag, presetValue);
      await this.gsStore.resetDeckCards(this.deckTag, this.selectedMode, this.newParams);
      this.close();
      this.onDone?.();
    });
  }

  private findPresetId(): string | null {
    const allPresets: SrsPreset[] = [
      ...BUILTIN_PRESETS,
      ...(this.gsStore.getRawStore().getSettings().customPresets ?? []),
    ];
    return allPresets.find(p => p.name === this.strategyName)?.id ?? null;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
