import { Plugin } from 'obsidian';
import { PluginData, CardData, DEFAULT_DATA, GrindstoneSettings, DEFAULT_SETTINGS } from '../card/types';

export class DataStore {
  private data: PluginData;
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.data = { ...DEFAULT_DATA, cards: {} };
  }

  async load(): Promise<void> {
    const raw = await this.plugin.loadData();
    if (raw) {
      this.data = {
        version: raw.version ?? 1,
        settings: { ...DEFAULT_SETTINGS, ...raw.settings },
        cards: raw.cards ?? {},
      };
    }
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.data);
  }

  getSettings(): GrindstoneSettings {
    return this.data.settings;
  }

  async updateSettings(s: Partial<GrindstoneSettings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...s };
    await this.save();
  }

  getCard(id: string): CardData | undefined {
    return this.data.cards[id];
  }

  getAllCards(): Record<string, CardData> {
    return this.data.cards;
  }

  setCard(id: string, card: CardData): void {
    this.data.cards[id] = card;
  }

  deleteCard(id: string): void {
    delete this.data.cards[id];
  }

  /** Get cards due today or earlier (and not disabled). */
  getDueCards(today: string): Array<{ id: string; card: CardData }> {
    const result: Array<{ id: string; card: CardData }> = [];
    for (const [id, card] of Object.entries(this.data.cards)) {
      if (card.disabled) continue;
      if (card.due <= today) {
        result.push({ id, card });
      }
    }
    return result;
  }
}
