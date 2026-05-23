import { App, normalizePath } from "obsidian";
import type {
  ActionCompletionLog,
  AgentResult,
  EmotionEntry,
  MoodNestSettings,
  SuggestedActionArchiveItem,
} from "../types";
import { FolderService } from "./folderService";

export class ArchiveService {
  private folderService: FolderService;

  constructor(private app: App, private settings: MoodNestSettings) {
    this.folderService = new FolderService(app);
  }

  async createEmotionLog(
    rawText: string,
    agentResult?: AgentResult,
    completedActions: ActionCompletionLog[] = [],
    suggestedActions: SuggestedActionArchiveItem[] = []
  ): Promise<EmotionEntry> {
    const now = new Date();
    const createdAt = now.toISOString();
    const date = createdAt.slice(0, 10);
    const safeTime = createdAt.replace(/[:.]/g, "-");

    const folderPath = normalizePath(
      `${this.settings.rootFolder}/${this.settings.dailyFolder}`
    );

    await this.folderService.ensureFolder(folderPath);

    const entry: EmotionEntry = {
      id: `emotion-${safeTime}`,
      createdAt,
      rawText,
      archivePath: "",
    };

    const fileName = `${date}-${entry.id}.md`;
    const filePath = normalizePath(`${folderPath}/${fileName}`);
    entry.archivePath = filePath;

    const content = this.buildNote(
      entry,
      agentResult,
      completedActions,
      suggestedActions
    );
    await this.app.vault.create(filePath, content);

    return entry;
  }

  async saveAudioBlob(audioBlob: Blob): Promise<string> {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const safeTime = now.toISOString().replace(/[:.]/g, "-");

    const folderPath = normalizePath(`${this.settings.rootFolder}/Audio`);
    await this.folderService.ensureFolder(folderPath);

    const fileName = `${date}-audio-${safeTime}.webm`;
    const filePath = normalizePath(`${folderPath}/${fileName}`);

    const arrayBuffer = await audioBlob.arrayBuffer();
    await this.app.vault.createBinary(filePath, arrayBuffer);

    return filePath;
  }

  private buildNote(
    entry: EmotionEntry,
    agentResult?: AgentResult,
    completedActions: ActionCompletionLog[] = [],
    suggestedActions: SuggestedActionArchiveItem[] = []
  ): string {
    const frontmatter = `---
type: emotion-log
id: ${entry.id}
created_at: ${entry.createdAt}
---
`;

    const sections: string[] = [
      frontmatter,
      "# 情绪记录",
      "",
      "## 对话原文",
      entry.rawText,
    ];

    if (agentResult) {
      const { analysis, reply } = agentResult;
      const modeMap: Record<string, string> = {
        comfort: "接住",
        clarify: "收窄",
        organize: "整理",
      };

      sections.push(
        "",
        "## MoodNest 分析",
        `- 总结：${analysis.summary}`,
        `- 情绪：${analysis.emotions.length > 0 ? analysis.emotions.join("、") : "未记录"}`,
        `- 强度：${analysis.intensity}/10`,
        `- 触发点：${analysis.triggers.length > 0 ? analysis.triggers.join("、") : "未记录"}`,
        `- 相关人物：${analysis.people.length > 0 ? analysis.people.join("、") : "未记录"}`,
        `- 当前需要：${analysis.needs.length > 0 ? analysis.needs.join("、") : "未记录"}`,
        `- 推荐模式：${modeMap[analysis.recommendedMode] ?? analysis.recommendedMode}`,
        `- 风险等级：${analysis.riskLevel}`,
        `- 场景标签：${analysis.sceneTags.length > 0 ? analysis.sceneTags.join("、") : "未记录"}`,
        `- 支持焦点：${analysis.supportFocus || "未记录"}`,
        `- 回复目标：${analysis.responseGoal || "未记录"}`,
        `- 应对方向：${
          analysis.copingDirection.length > 0
            ? analysis.copingDirection.join("、")
            : "未记录"
        }`,
        "",
        "## MoodNest 回复",
        reply.followUpPrompt
          ? `${reply.message}\n\n${reply.followUpPrompt}`
          : reply.message
      );
    } else {
      sections.push(
        "",
        "## MoodNest 分析",
        "- 本次归档未包含最终分析。"
      );
    }

    if (completedActions.length > 0) {
      sections.push("", "## 今天完成的小动作", "");
      completedActions.forEach((item) => {
        sections.push(`- ${this.humanizeActionLabel(item.actionLabel)}  `);
        const time = this.formatTime(item.completedAt);
        if (time) {
          sections.push(`  时间：${time}`);
        }
      });
    }

    const pendingTasks = suggestedActions.filter(
      (item) =>
        item.kind === "task" &&
        item.status !== "completed" &&
        item.status !== "dismissed" &&
        (item.addToJournal || item.status === "selected")
    );
    if (pendingTasks.length > 0) {
      sections.push("", "## 接下来可以做的小任务", "");
      pendingTasks.forEach((item) => {
        sections.push(`- [ ] ${item.label}`);
      });
    }

    const pendingSuggested = suggestedActions.filter(
      (item) =>
        item.kind !== "task" &&
        item.status !== "completed" &&
        item.status !== "dismissed"
    );
    if (pendingSuggested.length > 0) {
      sections.push("", "## 稍后可以试试", "");
      pendingSuggested.forEach((item) => {
        sections.push(`- [ ] ${item.label}`);
      });
    }

    sections.push(
      "",
      "## 备注",
      "- 右侧行动卡允许跳过或只做一点点。",
      "- 这里只记录真实做过的小动作，不把没做完的部分当成失败。"
    );

    return sections.join("\n");
  }

  private humanizeActionLabel(label: string): string {
    const map: Record<string, string> = {
      "打开一个文件但不开始做": "打开了一个文件，但没有要求自己马上开始做。",
      "把手机反扣 30 秒": "把手机反扣了一会儿，让自己先停了一下。",
      "站起来 10 秒": "站起来待了一小会儿，让身体先动了一下。",
      "喝一口水": "喝了一口水，让自己先缓了一下。",
      "看一眼窗外": "看了一眼窗外，让注意力先离开脑子里一会儿。",
      "摸一下桌面边缘": "摸了一下桌面边缘，让自己先碰到一点真实的东西。",
      "把肩膀放下来": "把肩膀放下来了一点，没有再一直绷着。",
      "跟着呼了一轮气": "跟着呼了一轮气，让身体先慢下来一点。",
      "碰到一个真实的东西": "碰到一个真实的东西，提醒自己现在就在这里。",
      "听了一小段音乐": "听了一小段音乐，让注意力先离开脑子里的紧绷。",
      "听了一个身边的声音": "听了一个身边的声音，让注意力落到一个真实声音上。",
      "看了一眼眼前的东西": "看了一眼眼前的东西，把注意力先落回到眼前。",
    };

    return map[label] ?? `${label}。`;
  }

  private formatTime(isoString: string): string {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
}
