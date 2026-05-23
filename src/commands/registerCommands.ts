import { Notice } from "obsidian";
import type MoodNestPlugin from "../../main";
import { EmotionLogModal } from "../ui/modals/EmotionLogModal";

export function registerCommands(plugin: MoodNestPlugin) {
  plugin.addCommand({
    id: "open-emotion-log",
    name: "新建情绪记录",
    callback: () => {
      new EmotionLogModal(plugin.app, plugin).open();
    },
  });

  plugin.addCommand({
    id: "open-first-aid",
    name: "打开情绪急救",
    callback: () => {
      new Notice("情绪急救功能即将上线。");
    },
  });

  plugin.addCommand({
    id: "open-comfort-chat",
    name: "打开安抚对话",
    callback: () => {
      new Notice("安抚对话功能即将上线。");
    },
  });
}