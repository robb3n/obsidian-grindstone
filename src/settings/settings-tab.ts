import { App, PluginSettingTab, Setting, setIcon, setTooltip, MarkdownRenderer, Notice } from 'obsidian';
import type GrindstonePlugin from '../main';
import {
  SrsParams, DEFAULT_SRS_PARAMS, SrsPreset, BUILTIN_PRESETS,
} from '../card/types';
import { renderSrsVisualization } from './srs-visualization';
import { DeckResetConfirmModal } from '../view/strategy-modals';
import { buildCardsCsv, buildReviewLogsCsv, triggerDownload, todayStamp } from '../util/csv-export';

type SectionDef = {
  id: string;
  zh: string;
  icon: string;
  render: (container: HTMLElement) => void;
};

export class GrindstoneSettingTab extends PluginSettingTab {
  plugin: GrindstonePlugin;

  constructor(app: App, plugin: GrindstonePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('gs-settings');

    const SECTIONS: SectionDef[] = [
      { id: 'card-id',         zh: '卡片识别', icon: 'tag',        render: this.renderCardIdSection.bind(this) },
      { id: 'review-behavior', zh: '复习行为', icon: 'book-open',  render: this.renderReviewBehaviorSection.bind(this) },
      { id: 'srs-strategy',    zh: 'SRS 策略', icon: 'sliders',    render: this.renderSrsStrategySection.bind(this) },
      { id: 'data-export',     zh: '数据导出', icon: 'download',   render: this.renderDataExportSection.bind(this) },
    ];

    // Maps from section id to nav-icon / section-element. Declared before
    // listeners that reference them (click handlers fire after both maps are populated).
    const iconEls = new Map<string, HTMLElement>();
    const sectionEls = new Map<string, HTMLElement>();

    // ── Sticky top nav strip ──
    const navStrip = containerEl.createDiv({ cls: 'gs-nav-strip' });

    for (const s of SECTIONS) {
      const icon = navStrip.createDiv({ cls: 'clickable-icon gs-nav-icon' });
      setIcon(icon, s.icon);
      setTooltip(icon, s.zh);
      icon.addEventListener('click', () => {
        const target = sectionEls.get(s.id);
        if (target) {
          const stripH = navStrip.getBoundingClientRect().height;
          const rect = target.getBoundingClientRect();
          const containerRect = containerEl.getBoundingClientRect();
          containerEl.scrollBy({ top: rect.top - containerRect.top - stripH - 8, behavior: 'smooth' });
        }
      });
      iconEls.set(s.id, icon);
    }

    // ── Content area: render each section ──
    for (const s of SECTIONS) {
      const sectionEl = containerEl.createDiv({ cls: 'gs-section-anchor' });
      sectionEls.set(s.id, sectionEl);
      s.render(sectionEl);
    }

    // ── Scroll-spy: highlight active nav icon based on which section is in viewport ──
    const updateActive = () => {
      const stripBottom = navStrip.getBoundingClientRect().bottom;
      let activeId = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = sectionEls.get(s.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - stripBottom < 24) activeId = s.id;
      }
      for (const [id, el] of iconEls) {
        el.toggleClass('is-active', id === activeId);
      }
    };

    containerEl.addEventListener('scroll', updateActive, { passive: true });
    // Initial state — after a tick so layout is settled.
    setTimeout(updateActive, 0);
  }

  // ════════════════════════════════════════════════
  // Section 1: 卡片识别
  // ════════════════════════════════════════════════
  private renderCardIdSection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-set-section' });
    this.sectionHeader(section, '卡片识别', 'CARD IDENTIFICATION · 哪些 tag 行算卡片、ID 怎么生成');

    const settings = this.plugin.store.getSettings();

    new Setting(section)
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

    new Setting(section)
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

    new Setting(section)
      .setName('前缀匹配')
      .setDesc('启用后,配置 #考研数学 将匹配 #考研数学/高数/极限 等子标签。')
      .addToggle((toggle) => {
        toggle.setValue(settings.prefixMatch).onChange(async (value) => {
          await this.plugin.store.updateSettings({ prefixMatch: value });
        });
      });

    new Setting(section)
      .setName('嵌入卡片 ID')
      .setDesc('⚠ 会修改你的笔记。开启后在触发行尾添加 <!-- gs:xxxxxxxx --> 注释（一次性，每张卡一个）。复习历史会随重命名、移动、编辑而保留；关闭则退回基于文件路径 + 题面哈希的 ID，重命名或改标题会丢历史。')
      .addToggle((toggle) => {
        toggle.setValue(settings.embedCardIds ?? false).onChange(async (value) => {
          await this.plugin.store.updateSettings({ embedCardIds: value });
        });
      });
  }

  // ════════════════════════════════════════════════
  // Section 2: 复习行为
  // ════════════════════════════════════════════════
  private renderReviewBehaviorSection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-set-section' });
    this.sectionHeader(section, '复习行为', 'REVIEW BEHAVIOR · 复习时的交互与回写');

    const settings = this.plugin.store.getSettings();

    new Setting(section)
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

    new Setting(section)
      .setName('评分回写星号')
      .setDesc('⚠ 会修改你的笔记。每次评分后在触发行首写入星号: Again=⭐️⭐️⭐️ / Hard=⭐️⭐️ / Good=⭐️ / Easy=（清除）。')
      .addToggle((toggle) => {
        toggle.setValue(settings.writeStarsBack).onChange(async (value) => {
          await this.plugin.store.updateSettings({ writeStarsBack: value });
        });
      });

    new Setting(section)
      .setName('周日显示周回顾')
      .setDesc('每周日在概览页顶部展示本周 vs 上周的复习量、准确率变化、最稳/最难标签。关闭后即使周日也不显示。')
      .addToggle((toggle) => {
        toggle.setValue(settings.weeklyReviewEnabled !== false).onChange(async (value) => {
          await this.plugin.store.updateSettings({ weeklyReviewEnabled: value });
        });
      });
  }

  // ════════════════════════════════════════════════
  // Section 3: SRS 策略 (h3 sub-sections, flat layout)
  // ════════════════════════════════════════════════
  private renderSrsStrategySection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-set-section gs-set-section-strategy' });
    this.sectionHeader(section, 'SRS 策略', 'SRS STRATEGY · 间隔算法与每卡组覆盖');

    // ── 全局默认 ──
    this.subsectionHeader(section, '全局默认', 'GLOBAL DEFAULT · 未绑定策略的卡组使用此参数');
    this.renderGlobalDefaultPanel(section);

    // ── 卡组策略 ──
    this.subsectionHeader(section, '卡组策略', 'PER-DECK · 顶级标签使用不同策略时在此覆盖');
    this.renderDeckStrategyPanel(section);
  }

  // ── Helper: subsection header (h3, markdown-rendered for theme inheritance) ──
  private subsectionHeader(section: HTMLElement, zh: string, enSub: string): void {
    const hdr = section.createDiv({ cls: 'gs-subsection-header' });
    const titleWrap = hdr.createDiv({ cls: 'gs-subsection-title-md markdown-rendered' });
    MarkdownRenderer.render(this.app, `### ${zh}`, titleWrap, '', this.plugin);
    hdr.createDiv({ cls: 'gs-subsection-sub gs-en', text: enSub });
  }

  // ── Helper: section header ──
  // Render the title as real markdown so it inherits the user's theme (Blue Topaz,
  // Style Settings, etc.) — incl. underline/color decorations that scope to
  // .markdown-rendered. The settings tab itself isn't in that scope by default.
  private sectionHeader(section: HTMLElement, zh: string, enSub: string): void {
    const hdr = section.createDiv({ cls: 'gs-set-header' });
    const titleWrap = hdr.createDiv({ cls: 'gs-set-title-md markdown-rendered' });
    MarkdownRenderer.render(this.app, `## ${zh}`, titleWrap, '', this.plugin);
    hdr.createDiv({ cls: 'gs-set-sub gs-en', text: enSub });
  }

  // ── 全局默认: preset cards + param editors + visualization (flat layout) ──
  private renderGlobalDefaultPanel(container: HTMLElement): void {
    const settings = this.plugin.store.getSettings();
    let currentParams: SrsParams = { ...(settings.srsParams ?? DEFAULT_SRS_PARAMS) };
    let activePresetId = settings.activePresetId ?? 'sm2-default';
    const customPresets: SrsPreset[] = [...(settings.customPresets ?? [])];

    const presetWrap = container.createDiv({ cls: 'gs-preset-grid' });
    const allPresets = (): SrsPreset[] => [...BUILTIN_PRESETS, ...customPresets];

    const findPreset = (id: string): SrsPreset => {
      return allPresets().find(p => p.id === id) ?? BUILTIN_PRESETS[0];
    };

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

    const paramWrap = container.createDiv({ cls: 'gs-param-wrap' });

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

    const vizWrap = container.createDiv({ cls: 'gs-srs-viz-wrap' });
    const vizH = vizWrap.createDiv({ cls: 'gs-srs-viz-h' });
    vizH.createSpan({ text: '间隔增长预览' });
    vizH.createSpan({ cls: 'gs-en', text: 'INTERVAL PROJECTION' });
    const vizContainer = vizWrap.createDiv();

    const renderViz = () => {
      renderSrsVisualization(vizContainer, currentParams);
    };

    const actions = container.createDiv({ cls: 'gs-srs-actions' });

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

    const persist = async () => {
      await this.plugin.store.updateSettings({
        srsParams: { ...currentParams },
        activePresetId,
        customPresets: customPresets.map(p => ({ ...p })),
      });
    };

    renderPresets();
    renderParamEditors();
    renderViz();
  }

  // ── Tab content: 卡组策略 (per-deck override list) ──
  private renderDeckStrategyPanel(container: HTMLElement): void {
    const tree = this.plugin.gsStore.getDeckTree();

    if (tree.length === 0) {
      container.createDiv({
        cls: 'gs-deck-strategy-empty',
        text: '暂无卡组。添加触发标签并在笔记中使用后，顶级标签会出现在此处。',
      });
      return;
    }

    const settings = this.plugin.store.getSettings();
    const customPresets = settings.customPresets ?? [];
    const allPresets: Array<{ id: string; name: string }> = [
      { id: '__default__', name: '全局默认' },
      ...BUILTIN_PRESETS.map(p => ({ id: p.id, name: p.name })),
      ...customPresets.map(p => ({ id: p.id, name: p.name })),
    ];

    const list = container.createDiv({ cls: 'gs-deck-strategy-list' });

    for (const deck of tree) {
      const overrides = this.plugin.store.getSettings().deckSrsOverrides ?? {};
      const currentValue = overrides[deck.fullTag];
      const currentId = currentValue === undefined
        ? '__default__'
        : (typeof currentValue === 'string' ? currentValue : '__default__');

      const row = list.createDiv({ cls: 'gs-deck-strategy-row' });
      const meta = row.createDiv({ cls: 'gs-deck-strategy-meta' });
      meta.createSpan({ cls: 'gs-deck-strategy-name', text: '#' + deck.fullTag });
      meta.createSpan({ cls: 'gs-deck-strategy-count gs-mono', text: `${deck.count} 张` });

      const select = row.createEl('select', { cls: 'gs-deck-strategy-select dropdown' });
      for (const preset of allPresets) {
        const opt = select.createEl('option', { value: preset.id, text: preset.name });
        if (preset.id === currentId) opt.selected = true;
      }

      select.addEventListener('change', () => {
        const newId = select.value;
        if (newId === currentId) return;

        const targetName = allPresets.find(p => p.id === newId)?.name ?? '全局默认';
        const newPresetsAll = [...BUILTIN_PRESETS, ...customPresets];
        const resolvedParams = newId === '__default__'
          ? this.plugin.gsStore.getSrsParams()
          : newPresetsAll.find(p => p.id === newId)?.params ?? this.plugin.gsStore.getSrsParams();

        // Revert select visually until user confirms — modal handles the actual write.
        select.value = currentId;

        new DeckResetConfirmModal(
          this.app,
          deck.fullTag,
          targetName,
          resolvedParams,
          this.plugin.gsStore,
          () => this.display(),
        ).open();
      });
    }
  }

  // ════════════════════════════════════════════════
  // Section 4: 数据导出
  // ════════════════════════════════════════════════
  private renderDataExportSection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-set-section' });
    this.sectionHeader(section, '数据导出', 'DATA EXPORT · 导出卡片与复习历史为 CSV');

    new Setting(section)
      .setName('导出全部数据')
      .setDesc('将卡片状态和复习历史导出为两个 CSV 文件（UTF-8 BOM，Excel 直接打开中文不乱码）。文件保存到浏览器默认下载目录。')
      .addButton((btn) => {
        btn.setButtonText('导出 CSV')
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText('导出中…');
            try {
              const cards = this.plugin.store.getAllCards();
              const logs = this.plugin.store.getReviewLogs();
              const stamp = todayStamp();

              const cardsCsv = buildCardsCsv(cards);
              triggerDownload(`grindstone-cards-${stamp}.csv`, cardsCsv);

              // Yield to let the first download fire before building the second
              // payload — avoids a single long synchronous burst on large vaults.
              await new Promise((r) => setTimeout(r, 50));

              const logsCsv = buildReviewLogsCsv(logs);
              triggerDownload(`grindstone-review-logs-${stamp}.csv`, logsCsv);

              new Notice(
                `已导出 ${Object.keys(cards).length} 张卡片 / ${logs.length} 条复习记录`,
              );
            } catch (e) {
              console.error('[Grindstone] CSV export failed', e);
              new Notice('导出失败,详见控制台');
            } finally {
              btn.setDisabled(false);
              btn.setButtonText('导出 CSV');
            }
          });
      });
  }
}
