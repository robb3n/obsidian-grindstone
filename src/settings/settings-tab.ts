import { App, PluginSettingTab, Setting } from 'obsidian';
import type GrindstonePlugin from '../main';
import {
  SrsParams, DEFAULT_SRS_PARAMS, SrsPreset, BUILTIN_PRESETS,
} from '../card/types';
import { renderSrsVisualization } from './srs-visualization';

export class GrindstoneSettingTab extends PluginSettingTab {
  plugin: GrindstonePlugin;

  constructor(app: App, plugin: GrindstonePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Grindstone Settings' });

    const settings = this.plugin.store.getSettings();

    new Setting(containerEl)
      .setName('触发标签')
      .setDesc('包含这些标签的行会被识别为复习卡片。每行一个标签,带 # 前缀。')
      .addTextArea((text) => {
        text
          .setPlaceholder('#考研数学\n#408')
          .setValue(settings.triggerTags.join('\n'))
          .onChange(async (value) => {
            const tags = value.split('\n').map((t) => t.trim()).filter((t) => t.length > 0);
            await this.plugin.store.updateSettings({ triggerTags: tags });
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 30;
      });

    new Setting(containerEl)
      .setName('排除标签')
      .setDesc('包含这些标签的行会被跳过。每行一个标签。')
      .addTextArea((text) => {
        text
          .setPlaceholder('#草稿')
          .setValue(settings.excludeTags.join('\n'))
          .onChange(async (value) => {
            const tags = value.split('\n').map((t) => t.trim()).filter((t) => t.length > 0);
            await this.plugin.store.updateSettings({ excludeTags: tags });
          });
        text.inputEl.rows = 3;
        text.inputEl.cols = 30;
      });

    new Setting(containerEl)
      .setName('前缀匹配')
      .setDesc('启用后,配置 #考研数学 将匹配 #考研数学/高数/极限 等子标签。')
      .addToggle((toggle) => {
        toggle.setValue(settings.prefixMatch).onChange(async (value) => {
          await this.plugin.store.updateSettings({ prefixMatch: value });
        });
      });

    new Setting(containerEl)
      .setName('评分回写星号')
      .setDesc('复习评分后在源文件行首写入星号:Again=⭐️⭐️⭐️, Hard=⭐️⭐️, Good=⭐️, Easy=无。')
      .addToggle((toggle) => {
        toggle.setValue(settings.writeStarsBack).onChange(async (value) => {
          await this.plugin.store.updateSettings({ writeStarsBack: value });
        });
      });

    new Setting(containerEl)
      .setName('嵌入卡片 ID')
      .setDesc('在触发标签行末尾嵌入 HTML 注释形式的稳定 ID（推荐）。关闭后退回哈希 ID，文件重命名或标题修改会导致 SRS 数据丢失。')
      .addToggle((toggle) => {
        toggle.setValue(settings.embedCardIds ?? true).onChange(async (value) => {
          await this.plugin.store.updateSettings({ embedCardIds: value });
        });
      });

    new Setting(containerEl)
      .setName('默认显示内容的标签')
      .setDesc('包含这些标签的卡片在复习时自动展开全部内容。每行一个标签。')
      .addTextArea((text) => {
        text
          .setPlaceholder('#Grind')
          .setValue(settings.autoShowTags.join('\n'))
          .onChange(async (value) => {
            const tags = value.split('\n').map((t) => t.trim()).filter((t) => t.length > 0);
            await this.plugin.store.updateSettings({ autoShowTags: tags });
          });
        text.inputEl.rows = 3;
        text.inputEl.cols = 30;
      });

    // ── SRS Strategy Section ──

    this.renderSrsSection(containerEl);
  }

  private renderSrsSection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-srs-section' });
    const hdr = section.createDiv({ cls: 'gs-srs-header' });
    hdr.createEl('h2', { text: 'SRS 策略（全局默认）' });
    hdr.createDiv({ cls: 'gs-srs-sub gs-en', text: 'GLOBAL DEFAULT · 未绑定策略的卡组使用此参数' });

    const settings = this.plugin.store.getSettings();
    let currentParams: SrsParams = { ...(settings.srsParams ?? DEFAULT_SRS_PARAMS) };
    let activePresetId = settings.activePresetId ?? 'sm2-default';
    const customPresets: SrsPreset[] = [...(settings.customPresets ?? [])];

    // ── Preset selector ──
    const presetWrap = section.createDiv({ cls: 'gs-preset-grid' });

    const allPresets = (): SrsPreset[] => [...BUILTIN_PRESETS, ...customPresets];

    const renderPresets = () => {
      presetWrap.empty();
      for (const preset of allPresets()) {
        const card = presetWrap.createDiv({
          cls: `gs-preset-card${activePresetId === preset.id ? ' gs-preset-card-active' : ''}`,
        });
        const cardH = card.createDiv({ cls: 'gs-preset-card-h' });
        cardH.createSpan({ cls: 'gs-preset-card-name', text: preset.name });
        cardH.createSpan({ cls: 'gs-preset-card-en gs-en', text: preset.nameEn });
        card.createDiv({ cls: 'gs-preset-card-desc', text: preset.description });

        if (!preset.builtin) {
          const del = card.createEl('button', { cls: 'gs-preset-del', text: '×' });
          del.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx = customPresets.findIndex(p => p.id === preset.id);
            if (idx >= 0) customPresets.splice(idx, 1);
            if (activePresetId === preset.id) activePresetId = 'sm2-default';
            currentParams = { ...findPreset(activePresetId).params };
            await persist();
            renderPresets();
            renderParamEditors();
            renderViz();
          });
        }

        card.addEventListener('click', async () => {
          activePresetId = preset.id;
          currentParams = { ...preset.params };
          await persist();
          renderPresets();
          renderParamEditors();
          renderViz();
        });
      }
    };

    const findPreset = (id: string): SrsPreset => {
      return allPresets().find(p => p.id === id) ?? BUILTIN_PRESETS[0];
    };

    // ── Parameter editors ──
    const paramWrap = section.createDiv({ cls: 'gs-param-wrap' });

    type ParamDef = {
      key: keyof SrsParams;
      zh: string;
      en: string;
      min: number;
      max: number;
      step: number;
      fmt?: (v: number) => string;
    };

    const PARAM_GROUPS: { zh: string; en: string; params: ParamDef[] }[] = [
      {
        zh: '间隔参数', en: 'INTERVALS',
        params: [
          { key: 'graduatingInterval', zh: '首次 Good 间隔', en: 'Graduating', min: 1, max: 7, step: 1, fmt: v => `${v}d` },
          { key: 'easyInterval', zh: '首次 Easy 间隔', en: 'Easy', min: 1, max: 14, step: 1, fmt: v => `${v}d` },
          { key: 'againInterval', zh: 'Again 间隔', en: 'Again', min: 0, max: 3, step: 1, fmt: v => v === 0 ? '当日重来' : `${v}d` },
          { key: 'step1Interval', zh: '第二次 Good 间隔', en: 'Step 1', min: 1, max: 14, step: 1, fmt: v => `${v}d` },
          { key: 'step2Interval', zh: '第二次 Easy 间隔', en: 'Step 2', min: 2, max: 21, step: 1, fmt: v => `${v}d` },
        ],
      },
      {
        zh: 'Ease 参数', en: 'EASE FACTORS',
        params: [
          { key: 'initialEase', zh: '初始 Ease', en: 'Initial', min: 1.5, max: 3.5, step: 0.1 },
          { key: 'minEase', zh: '最低 Ease', en: 'Minimum', min: 1.0, max: 2.5, step: 0.1 },
          { key: 'easeBonus', zh: 'Easy 加成', en: 'Easy +', min: 0, max: 0.5, step: 0.05 },
          { key: 'easeGoodDelta', zh: 'Good 变化', en: 'Good Δ', min: -0.1, max: 0.2, step: 0.05 },
          { key: 'easeHardPenalty', zh: 'Hard 惩罚', en: 'Hard −', min: 0, max: 0.5, step: 0.05 },
          { key: 'againPenalty', zh: 'Again 惩罚', en: 'Again −', min: 0, max: 0.5, step: 0.05 },
        ],
      },
      {
        zh: '乘数', en: 'MULTIPLIERS',
        params: [
          { key: 'hardMultiplier', zh: 'Hard 乘数', en: 'Hard ×', min: 1.0, max: 2.0, step: 0.1 },
        ],
      },
    ];

    // Slider value references for live update
    const valueEls = new Map<keyof SrsParams, HTMLElement>();

    const renderParamEditors = () => {
      paramWrap.empty();
      valueEls.clear();

      for (const group of PARAM_GROUPS) {
        const grp = paramWrap.createDiv({ cls: 'gs-param-group' });
        const grpH = grp.createDiv({ cls: 'gs-param-group-h' });
        grpH.createSpan({ text: group.zh });
        grpH.createSpan({ cls: 'gs-en', text: group.en });

        for (const p of group.params) {
          const row = grp.createDiv({ cls: 'gs-param-row' });
          const labelDiv = row.createDiv({ cls: 'gs-param-label' });
          labelDiv.createSpan({ text: p.zh });
          labelDiv.createSpan({ cls: 'gs-param-en gs-en', text: p.en });

          const control = row.createDiv({ cls: 'gs-param-control' });
          const slider = control.createEl('input', { cls: 'gs-param-slider' });
          slider.type = 'range';
          slider.min = String(p.min);
          slider.max = String(p.max);
          slider.step = String(p.step);
          slider.value = String(currentParams[p.key]);

          const fmt = p.fmt ?? ((v: number) => String(Math.round(v * 100) / 100));
          const valEl = control.createSpan({ cls: 'gs-param-val gs-mono', text: fmt(currentParams[p.key]) });
          valueEls.set(p.key, valEl);

          let debounceTimer: ReturnType<typeof setTimeout>;
          slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            (currentParams as unknown as Record<string, number>)[p.key] = v;
            valEl.textContent = fmt(v);
            // Mark as custom if params diverge from active preset
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              renderViz();
            }, 80);
          });

          slider.addEventListener('change', async () => {
            await persist();
          });
        }
      }
    };

    // ── Visualization ──
    const vizWrap = section.createDiv({ cls: 'gs-srs-viz-wrap' });
    const vizH = vizWrap.createDiv({ cls: 'gs-srs-viz-h' });
    vizH.createSpan({ text: '间隔增长预览' });
    vizH.createSpan({ cls: 'gs-en', text: 'INTERVAL PROJECTION' });
    const vizContainer = vizWrap.createDiv();

    const renderViz = () => {
      renderSrsVisualization(vizContainer, currentParams);
    };

    // ── Action buttons ──
    const actions = section.createDiv({ cls: 'gs-srs-actions' });

    const resetBtn = actions.createEl('button', { cls: 'gs-btn', text: '重置为预设' });
    resetBtn.addEventListener('click', async () => {
      currentParams = { ...findPreset(activePresetId).params };
      await persist();
      renderParamEditors();
      renderViz();
    });

    const saveBtn = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: '保存为自定义预设' });
    saveBtn.addEventListener('click', async () => {
      const id = `custom-${Date.now()}`;
      const preset: SrsPreset = {
        id,
        name: `自定义 ${customPresets.length + 1}`,
        nameEn: `Custom ${customPresets.length + 1}`,
        description: '用户自定义参数',
        params: { ...currentParams },
        builtin: false,
      };
      customPresets.push(preset);
      activePresetId = id;
      await persist();
      renderPresets();
    });

    // ── Persistence helper ──
    const persist = async () => {
      await this.plugin.store.updateSettings({
        srsParams: { ...currentParams },
        activePresetId,
        customPresets: customPresets.map(p => ({ ...p })),
      });
    };

    // Initial render
    renderPresets();
    renderParamEditors();
    renderViz();
  }
}
