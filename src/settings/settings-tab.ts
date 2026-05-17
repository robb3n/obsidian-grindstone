import { App, PluginSettingTab, Setting, setIcon, setTooltip, MarkdownRenderer } from 'obsidian';
import type GrindstonePlugin from '../main';
import {
  SrsParams, DEFAULT_SRS_PARAMS, SrsPreset, BUILTIN_PRESETS,
} from '../card/types';
import { renderSrsVisualization } from './srs-visualization';
import { DeckResetConfirmModal } from '../view/strategy-modals';
import { DEFAULT_SLOGANS } from '../view/tabs/Overview';
import { t, setLang, getLang, Lang, StringKey } from '../i18n';

function presetDescription(p: SrsPreset): string {
  return p.descriptionKey ? t(p.descriptionKey as StringKey) : p.description;
}

type SectionDef = {
  id: string;
  labelKey: StringKey;
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
      { id: 'card-id',         labelKey: 'settings.section.card_id',   icon: 'tag',       render: this.renderCardIdSection.bind(this) },
      { id: 'review-behavior', labelKey: 'settings.section.review',    icon: 'book-open', render: this.renderReviewBehaviorSection.bind(this) },
      { id: 'srs-strategy',    labelKey: 'settings.section.srs',       icon: 'sliders',   render: this.renderSrsStrategySection.bind(this) },
      { id: 'interface',       labelKey: 'settings.section.interface', icon: 'palette',   render: this.renderInterfaceSection.bind(this) },
    ];

    const iconEls = new Map<string, HTMLElement>();
    const sectionEls = new Map<string, HTMLElement>();

    // ── Sticky top nav strip ──
    const navStrip = containerEl.createDiv({ cls: 'gs-nav-strip' });

    for (const s of SECTIONS) {
      const icon = navStrip.createDiv({ cls: 'clickable-icon gs-nav-icon' });
      setIcon(icon, s.icon);
      setTooltip(icon, t(s.labelKey));
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

    // ── Scroll-spy ──
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
    setTimeout(updateActive, 0);
  }

  // ════════════════════════════════════════════════
  // Section 1: Card identification
  // ════════════════════════════════════════════════
  private renderCardIdSection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-set-section' });
    this.sectionHeader(section, t('settings.section.card_id'), t('settings.section.card_id_sub'));

    const settings = this.plugin.store.getSettings();

    new Setting(section)
      .setName(t('settings.trigger.name'))
      .setDesc(t('settings.trigger.desc'))
      .addTextArea((text) => {
        text
          .setPlaceholder('#grind\n#flashcard')
          .setValue(settings.triggerTags.join('\n'))
          .onChange(async (value) => {
            const tags = value.split('\n').map((t) => t.trim()).filter((t) => t.length > 0);
            await this.plugin.store.updateSettings({ triggerTags: tags });
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 30;
      });

    new Setting(section)
      .setName(t('settings.exclude.name'))
      .setDesc(t('settings.exclude.desc'))
      .addTextArea((text) => {
        text
          .setPlaceholder('#draft')
          .setValue(settings.excludeTags.join('\n'))
          .onChange(async (value) => {
            const tags = value.split('\n').map((t) => t.trim()).filter((t) => t.length > 0);
            await this.plugin.store.updateSettings({ excludeTags: tags });
          });
        text.inputEl.rows = 3;
        text.inputEl.cols = 30;
      });

    new Setting(section)
      .setName(t('settings.prefix.name'))
      .setDesc(t('settings.prefix.desc'))
      .addToggle((toggle) => {
        toggle.setValue(settings.prefixMatch).onChange(async (value) => {
          await this.plugin.store.updateSettings({ prefixMatch: value });
        });
      });

    new Setting(section)
      .setName(t('settings.embed.name'))
      .setDesc(t('settings.embed.desc'))
      .addToggle((toggle) => {
        toggle.setValue(settings.embedCardIds ?? false).onChange(async (value) => {
          await this.plugin.store.updateSettings({ embedCardIds: value });
        });
      });
  }

  // ════════════════════════════════════════════════
  // Section 2: Review behavior
  // ════════════════════════════════════════════════
  private renderReviewBehaviorSection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-set-section' });
    this.sectionHeader(section, t('settings.section.review'), t('settings.section.review_sub'));

    const settings = this.plugin.store.getSettings();

    new Setting(section)
      .setName(t('settings.autoshow.name'))
      .setDesc(t('settings.autoshow.desc'))
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
      .setName(t('settings.stars.name'))
      .setDesc(t('settings.stars.desc'))
      .addToggle((toggle) => {
        toggle.setValue(settings.writeStarsBack).onChange(async (value) => {
          await this.plugin.store.updateSettings({ writeStarsBack: value });
        });
      });

    new Setting(section)
      .setName(t('settings.streak.name'))
      .setDesc(t('settings.streak.desc'))
      .addToggle((toggle) => {
        toggle.setValue(settings.strictStreakMode === true).onChange(async (value) => {
          await this.plugin.store.updateSettings({ strictStreakMode: value });
        });
      });
  }

  // ════════════════════════════════════════════════
  // Section: Interface (with Language picker at top)
  // ════════════════════════════════════════════════
  private renderInterfaceSection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-set-section' });
    this.sectionHeader(section, t('settings.section.interface'), t('settings.section.interface_sub'));

    // ── Language picker (new) ──
    const langSetting = new Setting(section)
      .setName(t('settings.language.name'))
      .setDesc(t('settings.language.desc'));

    langSetting.addDropdown((dd) => {
      dd.addOption('zh', t('settings.language.zh'));
      dd.addOption('en', t('settings.language.en'));
      dd.setValue(getLang());
      dd.onChange(async (value) => {
        const newLang = value as Lang;
        if (getLang() === newLang) return;
        setLang(newLang);
        await this.plugin.store.updateSettings({ language: newLang });
        this.plugin.refreshAllWorkspaceViews();
        this.display();
      });
    });

    const settings = this.plugin.store.getSettings();

    new Setting(section)
      .setName(t('settings.slogans.name'))
      .setDesc(t('settings.slogans.desc', { defaults: DEFAULT_SLOGANS.join(' / ') }))
      .addTextArea((text) => {
        text
          .setPlaceholder(DEFAULT_SLOGANS.join('\n'))
          .setValue((settings.customSlogans ?? []).join('\n'))
          .onChange(async (value) => {
            const slogans = value.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
            await this.plugin.store.updateSettings({ customSlogans: slogans });
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 30;
      });
  }

  // ════════════════════════════════════════════════
  // Section 3: SRS strategy
  // ════════════════════════════════════════════════
  private renderSrsStrategySection(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'gs-set-section gs-set-section-strategy' });
    this.sectionHeader(section, t('settings.section.srs'), t('settings.section.srs_sub'));

    this.subsectionHeader(section, t('settings.srs.global'), t('settings.srs.global_sub'));
    this.renderGlobalDefaultPanel(section);

    this.subsectionHeader(section, t('settings.srs.per_deck'), t('settings.srs.per_deck_sub'));
    this.renderDeckStrategyPanel(section);
  }

  private subsectionHeader(section: HTMLElement, zh: string, enSub: string): void {
    const hdr = section.createDiv({ cls: 'gs-subsection-header' });
    const titleWrap = hdr.createDiv({ cls: 'gs-subsection-title-md markdown-rendered' });
    MarkdownRenderer.render(this.app, `### ${zh}`, titleWrap, '', this.plugin);
    hdr.createDiv({ cls: 'gs-subsection-sub', text: enSub });
  }

  private sectionHeader(section: HTMLElement, zh: string, enSub: string): void {
    const hdr = section.createDiv({ cls: 'gs-set-header' });
    const titleWrap = hdr.createDiv({ cls: 'gs-set-title-md markdown-rendered' });
    MarkdownRenderer.render(this.app, `## ${zh}`, titleWrap, '', this.plugin);
    hdr.createDiv({ cls: 'gs-set-sub', text: enSub });
  }

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
        const isZh = getLang() === 'zh';
        cardH.createSpan({ cls: 'gs-preset-card-name', text: isZh ? preset.name : preset.nameEn });
        card.createDiv({ cls: 'gs-preset-card-desc', text: presetDescription(preset) });

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
      labelKey: StringKey;
      min: number;
      max: number;
      step: number;
      fmt?: (v: number) => string;
    };

    const sameDayLabel = () => t('settings.srs.param.same_day');

    const PARAM_GROUPS: { labelKey: StringKey; params: ParamDef[] }[] = [
      {
        labelKey: 'settings.srs.group.intervals',
        params: [
          { key: 'graduatingInterval', labelKey: 'settings.srs.param.graduating', min: 1, max: 7,  step: 1, fmt: v => `${v}d` },
          { key: 'easyInterval',       labelKey: 'settings.srs.param.easy_int',   min: 1, max: 14, step: 1, fmt: v => `${v}d` },
          { key: 'againInterval',      labelKey: 'settings.srs.param.again_int',  min: 0, max: 3,  step: 1, fmt: v => v === 0 ? sameDayLabel() : `${v}d` },
          { key: 'step1Interval',      labelKey: 'settings.srs.param.step1',      min: 1, max: 14, step: 1, fmt: v => `${v}d` },
          { key: 'step2Interval',      labelKey: 'settings.srs.param.step2',      min: 2, max: 21, step: 1, fmt: v => `${v}d` },
        ],
      },
      {
        labelKey: 'settings.srs.group.ease',
        params: [
          { key: 'initialEase',     labelKey: 'settings.srs.param.initial_ease', min: 1.5, max: 3.5, step: 0.1 },
          { key: 'minEase',         labelKey: 'settings.srs.param.min_ease',     min: 1.0, max: 2.5, step: 0.1 },
          { key: 'easeBonus',       labelKey: 'settings.srs.param.ease_bonus',   min: 0,   max: 0.5, step: 0.05 },
          { key: 'easeGoodDelta',   labelKey: 'settings.srs.param.ease_good',    min: -0.1, max: 0.2, step: 0.05 },
          { key: 'easeHardPenalty', labelKey: 'settings.srs.param.ease_hard',    min: 0,   max: 0.5, step: 0.05 },
          { key: 'againPenalty',    labelKey: 'settings.srs.param.again_pen',    min: 0,   max: 0.5, step: 0.05 },
        ],
      },
      {
        labelKey: 'settings.srs.group.mult',
        params: [
          { key: 'hardMultiplier', labelKey: 'settings.srs.param.hard_mult', min: 1.0, max: 2.0, step: 0.1 },
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
        grpH.createSpan({ text: t(group.labelKey) });

        for (const p of group.params) {
          const row = grp.createDiv({ cls: 'gs-param-row' });
          const labelDiv = row.createDiv({ cls: 'gs-param-label' });
          labelDiv.createSpan({ text: t(p.labelKey) });

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
    vizH.createSpan({ text: t('settings.srs.viz') });
    const vizContainer = vizWrap.createDiv();

    const renderViz = () => {
      renderSrsVisualization(vizContainer, currentParams);
    };

    const actions = container.createDiv({ cls: 'gs-srs-actions' });

    const resetBtn = actions.createEl('button', { cls: 'gs-btn', text: t('settings.srs.reset') });
    resetBtn.addEventListener('click', async () => {
      currentParams = { ...findPreset(activePresetId).params };
      await persist();
      renderParamEditors();
      renderViz();
    });

    const saveBtn = actions.createEl('button', { cls: 'gs-btn gs-btn-primary', text: t('settings.srs.save') });
    saveBtn.addEventListener('click', async () => {
      const id = `custom-${Date.now()}`;
      const preset: SrsPreset = {
        id,
        name: t('settings.srs.custom_name', { n: customPresets.length + 1 }),
        nameEn: `Custom ${customPresets.length + 1}`,
        description: t('settings.srs.custom_desc'),
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

  private renderDeckStrategyPanel(container: HTMLElement): void {
    const tree = this.plugin.gsStore.getDeckTree();

    if (tree.length === 0) {
      container.createDiv({
        cls: 'gs-deck-strategy-empty',
        text: t('settings.srs.deck_empty'),
      });
      return;
    }

    const settings = this.plugin.store.getSettings();
    const customPresets = settings.customPresets ?? [];
    const isZh = getLang() === 'zh';
    const allPresets: Array<{ id: string; name: string }> = [
      { id: '__default__', name: t('settings.srs.default_preset') },
      ...BUILTIN_PRESETS.map(p => ({ id: p.id, name: isZh ? p.name : p.nameEn })),
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
      meta.createSpan({
        cls: 'gs-deck-strategy-count gs-mono',
        text: `${deck.count} ${isZh ? '张' : 'cards'}`,
      });

      const select = row.createEl('select', { cls: 'gs-deck-strategy-select dropdown' });
      for (const preset of allPresets) {
        const opt = select.createEl('option', { value: preset.id, text: preset.name });
        if (preset.id === currentId) opt.selected = true;
      }

      select.addEventListener('change', () => {
        const newId = select.value;
        if (newId === currentId) return;

        const targetName = allPresets.find(p => p.id === newId)?.name ?? t('settings.srs.default_preset');
        const newPresetsAll = [...BUILTIN_PRESETS, ...customPresets];
        const resolvedParams = newId === '__default__'
          ? this.plugin.gsStore.getSrsParams()
          : newPresetsAll.find(p => p.id === newId)?.params ?? this.plugin.gsStore.getSrsParams();

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

}
