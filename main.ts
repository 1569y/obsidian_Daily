import { Plugin } from "obsidian";
import { MoodNestSettingTab, normalizeMoodNestSettings } from "./src/settings";
import type { MoodNestSettings } from "./src/types";
import { registerCommands } from "./src/commands/registerCommands";
import { ArchiveService } from "./src/services/archiveService";
import { AgentService } from "./src/services/agentService";
import { AsrService } from "./src/services/asrService";
import { EmotionLogModal } from "./src/ui/modals/EmotionLogModal";

export default class MoodNestPlugin extends Plugin {
  settings!: MoodNestSettings;
  archiveService!: ArchiveService;
  agentService!: AgentService;
  asrService!: AsrService;

  async onload() {
    console.log("MoodNest loaded");

    await this.loadSettings();

    this.archiveService = new ArchiveService(this.app, this.settings);
    this.agentService = new AgentService(this.settings);
    this.asrService = new AsrService(this.app, this.manifest.id, this.settings);

    this.addSettingTab(new MoodNestSettingTab(this.app, this));
    registerCommands(this);

    this.addRibbonIcon("heart", "新建情绪记录", () => {
      new EmotionLogModal(this.app, this).open();
    });
  }

  onunload() {
    console.log("MoodNest unloaded");
  }

  async loadSettings() {
    this.settings = normalizeMoodNestSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);

    if (this.agentService) {
      this.agentService.updateSettings(this.settings);
    }

    if (this.asrService) {
      this.asrService.updateSettings(this.settings);
    }
  }
}
