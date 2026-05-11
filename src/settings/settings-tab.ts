import { App, PluginSettingTab, Setting } from 'obsidian';
import type GrindstonePlugin from '../main';

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
      .setDesc('复习评分后在源文件行首写入星号:Hard=⭐️⭐️, Good=⭐️, Easy=无。')
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
  }
}
