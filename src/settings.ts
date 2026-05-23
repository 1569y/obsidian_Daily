import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type MoodNestPlugin from "../main";
import type {
  MoodNestSettings,
  AgentPersona,
  AgentProviderProfile,
  AgentProviderType,
  AgentTier,
  SttTier,
  EmbeddedSttModel,
} from "./types";
import { WhisperCppAssetManager } from "./services/whisperCppAssetManager";

const DEFAULT_AGENT_PROFILE_ID = "default-agent-profile";

const DEFAULT_AGENT_PROFILE: AgentProviderProfile = {
  id: DEFAULT_AGENT_PROFILE_ID,
  name: "默认 Provider",
  providerType: "openai_compatible",
  baseUrl: "https://aihubmix.com/v1/chat/completions",
  apiKey: "",
  model: "coding-glm-5-free",
  enabled: true,
};

export const DEFAULT_SETTINGS: MoodNestSettings = {
  rootFolder: "MoodNest",
  dailyFolder: "Daily",
  useExternalAI: false,
  musicVolume: 0.85,
  generatedSoundVolume: 0.85,
  enableOnlineSound: false,
  trustedOnlineSoundUrls: [],
  generatedSoundPresets: [],

  agentTier: "rule_based",
  agentPersona: "balanced_supporter",

  agentProfiles: [{ ...DEFAULT_AGENT_PROFILE }],
  activeAgentProfileId: DEFAULT_AGENT_PROFILE_ID,

  sttTier: "embedded_local",
  sttApiBaseUrl: "",
  sttApiKey: "",
  sttApiModel: "whisper-1",

  sttEmbeddedModel: "base",
};

const SILICONFLOW_STT_ENDPOINT =
  "https://api.siliconflow.cn/v1/audio/transcriptions";
const SILICONFLOW_STT_MODELS = [
  "FunAudioLLM/SenseVoiceSmall",
  "TeleAI/TeleSpeechASR",
] as const;

interface LegacyMoodNestSettings extends Partial<MoodNestSettings> {
  agentBaseUrl?: unknown;
  agentApiKey?: unknown;
  agentModel?: unknown;
}

export function normalizeMoodNestSettings(data: unknown): MoodNestSettings {
  const saved = isRecord(data) ? (data as LegacyMoodNestSettings) : {};
  const merged: MoodNestSettings = {
    rootFolder: asNonEmptyString(saved.rootFolder, DEFAULT_SETTINGS.rootFolder),
    dailyFolder: asNonEmptyString(saved.dailyFolder, DEFAULT_SETTINGS.dailyFolder),
    useExternalAI:
      typeof saved.useExternalAI === "boolean"
        ? saved.useExternalAI
        : DEFAULT_SETTINGS.useExternalAI,
    groundingAudioFolder: asOptionalNonEmptyString(saved.groundingAudioFolder),
    groundingImageFolder: asOptionalNonEmptyString(saved.groundingImageFolder),
    musicVolume: asUnitVolume(saved.musicVolume, DEFAULT_SETTINGS.musicVolume ?? 0.85),
    generatedSoundVolume: asUnitVolume(
      saved.generatedSoundVolume,
      DEFAULT_SETTINGS.generatedSoundVolume ?? 0.85
    ),
    enableOnlineSound:
      typeof saved.enableOnlineSound === "boolean"
        ? saved.enableOnlineSound
        : DEFAULT_SETTINGS.enableOnlineSound,
    trustedOnlineSoundUrls: asStringArray(saved.trustedOnlineSoundUrls),
    generatedSoundPresets: asGeneratedSoundPresets(saved.generatedSoundPresets),
    agentTier: normalizeAgentTier(saved.agentTier),
    agentPersona: normalizeAgentPersona(saved.agentPersona),
    agentProfiles: normalizeAgentProfiles(saved),
    activeAgentProfileId: "",
    sttTier: normalizeSttTier(saved.sttTier),
    sttApiBaseUrl: asString(saved.sttApiBaseUrl),
    sttApiKey: asString(saved.sttApiKey),
    sttApiModel: asNonEmptyString(
      saved.sttApiModel,
      DEFAULT_SETTINGS.sttApiModel
    ),
    sttEmbeddedModel: normalizeEmbeddedSttModel(saved.sttEmbeddedModel),
  };

  merged.activeAgentProfileId = normalizeActiveAgentProfileId(
    saved.activeAgentProfileId,
    merged.agentProfiles
  );

  return merged;
}

function normalizeAgentProfiles(
  saved: LegacyMoodNestSettings
): AgentProviderProfile[] {
  if (Array.isArray(saved.agentProfiles) && saved.agentProfiles.length > 0) {
    const profiles = saved.agentProfiles
      .map((profile, index) => normalizeAgentProfile(profile, index))
      .filter((profile): profile is AgentProviderProfile => profile !== null);

    if (profiles.length > 0) {
      return profiles;
    }
  }

  return [buildLegacyAgentProfile(saved)];
}

function normalizeAgentProfile(
  value: unknown,
  index: number
): AgentProviderProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: asNonEmptyString(value.id, `agent-profile-${index + 1}`),
    name: asNonEmptyString(value.name, `Provider ${index + 1}`),
    providerType: normalizeAgentProviderType(value.providerType),
    baseUrl: asString(value.baseUrl),
    apiKey: asString(value.apiKey),
    model: asString(value.model),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
  };
}

function buildLegacyAgentProfile(
  saved: LegacyMoodNestSettings
): AgentProviderProfile {
  return {
    ...DEFAULT_AGENT_PROFILE,
    baseUrl: asNonEmptyString(
      saved.agentBaseUrl,
      DEFAULT_AGENT_PROFILE.baseUrl
    ),
    apiKey: asString(saved.agentApiKey),
    model: asNonEmptyString(saved.agentModel, DEFAULT_AGENT_PROFILE.model),
  };
}

function normalizeActiveAgentProfileId(
  activeId: unknown,
  profiles: AgentProviderProfile[]
): string {
  if (
    typeof activeId === "string" &&
    profiles.some((profile) => profile.id === activeId)
  ) {
    return activeId;
  }

  const firstEnabled = profiles.find((profile) => profile.enabled);
  return firstEnabled?.id ?? profiles[0]?.id ?? "";
}

function normalizeAgentProviderType(value: unknown): AgentProviderType {
  return value === "openai_compatible" ? value : "openai_compatible";
}

function normalizeAgentTier(value: unknown): AgentTier {
  return value === "api" || value === "rule_based"
    ? value
    : DEFAULT_SETTINGS.agentTier;
}

function normalizeAgentPersona(value: unknown): AgentPersona {
  return value === "gentle_companion" ||
    value === "calm_organizer" ||
    value === "balanced_supporter"
    ? value
    : DEFAULT_SETTINGS.agentPersona;
}

function normalizeSttTier(value: unknown): SttTier {
  return value === "api" || value === "embedded_local"
    ? value
    : DEFAULT_SETTINGS.sttTier;
}

function normalizeEmbeddedSttModel(value: unknown): EmbeddedSttModel {
  return value === "tiny" || value === "base" || value === "small"
    ? value
    : DEFAULT_SETTINGS.sttEmbeddedModel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNonEmptyString(value: unknown, fallback: string): string {
  const text = asString(value);
  return text.length > 0 ? text : fallback;
}

function asOptionalNonEmptyString(value: unknown): string | undefined {
  const text = asString(value);
  return text.length > 0 ? text : undefined;
}

function asUnitVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((entry) => asString(entry))
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

function asGeneratedSoundPresets(
  value: unknown
): MoodNestSettings["generatedSoundPresets"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const name = asString(item.name);
      const preset = asString(item.preset);
      const duration =
        typeof item.duration === "number" && Number.isFinite(item.duration)
          ? item.duration
          : 30;
      const keywords = asStringArray(item.keywords) ?? [];
      const id = asString(item.id);
      const keywordInput = asString(item.keywordInput);
      const createdAt = asString(item.createdAt);
      const resolvedPreset = asString(item.resolvedPreset);
      const displayLabel = asString(item.displayLabel);
      const helperText = asString(item.helperText);
      const seed =
        typeof item.seed === "number" && Number.isFinite(item.seed)
          ? item.seed
          : undefined;

      if (!name || !preset) {
        return null;
      }

      return {
        id: id || undefined,
        name,
        keywordInput: keywordInput || undefined,
        createdAt: createdAt || undefined,
        preset,
        resolvedPreset: resolvedPreset || undefined,
        displayLabel: displayLabel || undefined,
        helperText: helperText || undefined,
        seed,
        keywords,
        duration,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export class MoodNestSettingTab extends PluginSettingTab {
  plugin: MoodNestPlugin;

  constructor(app: App, plugin: MoodNestPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const assetManager = new WhisperCppAssetManager(
      this.app,
      this.plugin.manifest.id,
      this.plugin.settings
    );

    containerEl.createEl("h2", { text: "MoodNest 设置" });

    new Setting(containerEl)
      .setName("根目录")
      .setDesc("用于存放 MoodNest 所有情绪笔记的根文件夹")
      .addText((text) =>
        text
          .setPlaceholder("MoodNest")
          .setValue(this.plugin.settings.rootFolder)
          .onChange(async (value) => {
            this.plugin.settings.rootFolder = value.trim() || "MoodNest";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("情绪记录目录")
      .setDesc("用于存放日常情绪记录")
      .addText((text) =>
        text
          .setPlaceholder("Daily")
          .setValue(this.plugin.settings.dailyFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyFolder = value.trim() || "Daily";
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "声音与落地资源" });

    new Setting(containerEl)
      .setName("本地音乐文件夹")
      .setDesc(
        "可选。填写后，MoodNest 会优先从这里扫描 mp3 / wav / ogg / m4a。推荐填写 vault 内相对路径，例如 MoodNestAssets/Grounding/listen。Windows 绝对路径如 D:\\... 仅在桌面端支持；如果不可用，会退回默认资源。"
      )
      .addText((text) =>
        text
          .setPlaceholder(".obsidian/plugins/moodnest/Assets/Grounding/listen")
          .setValue(this.plugin.settings.groundingAudioFolder ?? "")
          .onChange(async (value) => {
            const next = value.trim();
            this.plugin.settings.groundingAudioFolder = next || undefined;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("本地图片文件夹")
      .setDesc(
        "可选。填写后，MoodNest 会优先从这里随机抽取视觉落点图片。推荐填写 vault 内相对路径，例如 MoodNestAssets/Grounding/see。留空时会使用插件默认图片或渐变卡片。"
      )
      .addText((text) =>
        text
          .setPlaceholder(".obsidian/plugins/moodnest/Assets/Grounding/see")
          .setValue(this.plugin.settings.groundingImageFolder ?? "")
          .onChange(async (value) => {
            const next = value.trim();
            this.plugin.settings.groundingImageFolder = next || undefined;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("开启在线声音")
      .setDesc("默认关闭。只有你主动开启并填入可信 URL 后，随机在线声音才会启用。")
      .addToggle((toggle) =>
        toggle
          .setValue(!!this.plugin.settings.enableOnlineSound)
          .onChange(async (value) => {
            this.plugin.settings.enableOnlineSound = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("可信在线声音 URL")
      .setDesc(
        "每行一个 URL。默认不会联网。只有开启在线声音并添加信任的 URL 后，MoodNest 才会尝试播放。推荐使用电台提供的 PLS / M3U 链接，或能直接播放的 HTTPS MP3/AAC stream。Direct stream 链接可能会随服务器变化失效。"
      )
      .addTextArea((text) => {
        text
          .setPlaceholder(
            "https://ice5.somafm.com/groovesalad-128-mp3\nhttps://ice5.somafm.com/dronezone-128-mp3\nhttps://ice5.somafm.com/deepspaceone-128-mp3\nhttps://ice5.somafm.com/missioncontrol-128-mp3\nhttps://ice5.somafm.com/fluid-128-mp3"
          )
          .setValue((this.plugin.settings.trustedOnlineSoundUrls ?? []).join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.trustedOnlineSoundUrls = value
              .split(/\r?\n/)
              .map((item) => item.trim())
              .filter((item) => item.length > 0);
            await this.plugin.saveSettings();
          });

        text.inputEl.rows = 4;
        text.inputEl.style.width = "100%";
      });

    const onlineUrlHelpEl = containerEl.createEl("p");
    onlineUrlHelpEl.style.margin = "-4px 0 16px 0";
    onlineUrlHelpEl.style.fontSize = "12px";
    onlineUrlHelpEl.style.lineHeight = "1.6";
    onlineUrlHelpEl.style.color = "var(--text-muted)";
    onlineUrlHelpEl.setText(
      "你可以从 SomaFM 的 Direct Stream Links、Icecast Directory、streamURL.link 这类网站查找可用 stream URL。上面的地址只是测试示例，不会默认写入设置；更稳定时优先使用电台提供的 PLS / M3U，Direct stream 如果失效，需要你手动更新。"
    );

    containerEl.createEl("h3", { text: "Agent 设置" });

    new Setting(containerEl)
      .setName("Agent 档位")
      .setDesc("免费规则版开箱即用；API 智能版需要配置接口")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("rule_based", "免费规则版")
          .addOption("api", "API 智能版")
          .setValue(this.plugin.settings.agentTier)
          .onChange(async (value) => {
            this.plugin.settings.agentTier = value as AgentTier;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName("Agent 人格")
      .setDesc("选择 MoodNest 的回应风格")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("gentle_companion", "温柔陪伴者")
          .addOption("calm_organizer", "冷静整理者")
          .addOption("balanced_supporter", "平衡支持者")
          .setValue(this.plugin.settings.agentPersona)
          .onChange(async (value) => {
            this.plugin.settings.agentPersona = value as AgentPersona;
            await this.plugin.saveSettings();
          })
      );

    if (this.plugin.settings.agentTier === "api") {
      containerEl.createEl("h4", { text: "Agent API 配置" });
      this.renderAgentProviderProfiles(containerEl);
    }

    containerEl.createEl("h3", { text: "语音转写设置" });

    new Setting(containerEl)
      .setName("STT 档位")
      .setDesc("内置本地版由插件自己管理模型；API 版走在线语音转写接口")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("embedded_local", "内置本地版")
          .addOption("api", "API 版")
          .setValue(this.plugin.settings.sttTier)
          .onChange(async (value) => {
            this.plugin.settings.sttTier = value as SttTier;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.sttTier === "embedded_local") {
      containerEl.createEl("h4", { text: "内置本地转写" });

      const statusEl = containerEl.createDiv();
      statusEl.style.marginBottom = "12px";
      statusEl.style.padding = "10px 12px";
      statusEl.style.borderRadius = "8px";
      statusEl.style.background = "var(--background-secondary)";
      statusEl.setText("正在检查本地资源状态……");

      void this.renderEmbeddedStatus(statusEl, assetManager);

      new Setting(containerEl)
        .setName("内置模型大小")
        .setDesc("模型越大，效果通常更好，但下载和运行也更重")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("tiny", "tiny（更快）")
            .addOption("base", "base（推荐）")
            .addOption("small", "small（更准更重）")
            .setValue(this.plugin.settings.sttEmbeddedModel)
            .onChange(async (value) => {
              const nextModel = value as EmbeddedSttModel;
              const exists = await assetManager.modelExists(nextModel);

              if (!exists) {
                const shouldDownload = window.confirm(
                  `${nextModel} 模型还没有下载。现在下载吗？`
                );

                if (shouldDownload) {
                  new Notice(`开始下载 ${nextModel} 模型……`);
                  try {
                    await assetManager.downloadModel(nextModel);
                    new Notice(`${nextModel} 模型下载完成。`);
                  } catch (error) {
                    console.error(error);
                    new Notice(`下载 ${nextModel} 模型失败。`);
                    this.display();
                    return;
                  }
                } else {
                  this.display();
                  return;
                }
              }

              this.plugin.settings.sttEmbeddedModel = nextModel;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      new Setting(containerEl)
        .setName("资源操作")
        .setDesc("默认资源会下载：当前平台转写引擎 + base 模型")
        .addButton((button) =>
          button.setButtonText("下载默认资源").onClick(async () => {
            new Notice("开始下载默认资源……");
            try {
              await assetManager.downloadDefaultResources();
              new Notice("默认资源下载完成。");
            } catch (error) {
              console.error(error);
              new Notice("下载默认资源失败，请查看控制台。");
            }
            this.display();
          })
        )
        .addButton((button) =>
          button.setButtonText("下载当前模型").onClick(async () => {
            const model = this.plugin.settings.sttEmbeddedModel;
            new Notice(`开始下载 ${model} 模型……`);
            try {
              await assetManager.downloadModel(model);
              new Notice(`${model} 模型下载完成。`);
            } catch (error) {
              console.error(error);
              new Notice(`下载 ${model} 模型失败。`);
            }
            this.display();
          })
        )
        .addButton((button) =>
          button.setButtonText("打开资源目录").onClick(async () => {
            try {
              await assetManager.openResourceDir();
            } catch (error) {
              console.error(error);
              new Notice("打开资源目录失败。");
            }
          })
        );

      new Setting(containerEl)
        .setName("删除资源")
        .setDesc("可以删除当前模型，或一次清空所有模型文件")
        .addButton((button) =>
          button.setButtonText("删除当前模型").onClick(async () => {
            const model = this.plugin.settings.sttEmbeddedModel;
            const ok = window.confirm(`确定删除当前模型 ${model} 吗？`);

            if (!ok) return;

            try {
              await assetManager.removeModel(model);
              new Notice(`${model} 模型已删除。`);
            } catch (error) {
              console.error(error);
              new Notice(`删除 ${model} 模型失败。`);
            }
            this.display();
          })
        )
        .addButton((button) =>
          button.setButtonText("删除全部模型").onClick(async () => {
            const ok = window.confirm("确定删除 tiny / base / small 全部模型吗？");

            if (!ok) return;

            try {
              await assetManager.removeAllModels();
              new Notice("全部模型已删除。");
            } catch (error) {
              console.error(error);
              new Notice("删除全部模型失败。");
            }
            this.display();
          })
        );
    }

    if (this.plugin.settings.sttTier === "api") {
      const apiTipEl = containerEl.createDiv();
      apiTipEl.style.marginBottom = "12px";
      apiTipEl.style.padding = "10px 12px";
      apiTipEl.style.borderRadius = "8px";
      apiTipEl.style.background = "var(--background-secondary)";
      apiTipEl.style.lineHeight = "1.6";
      apiTipEl.createEl("div", {
        text: "SiliconFlow 可直接复用下面三项：Base URL、API Key、Model。",
      });
      apiTipEl.createEl("div", {
        text: `默认地址：${SILICONFLOW_STT_ENDPOINT}`,
      });
      apiTipEl.createEl("div", {
        text: `常用模型：${SILICONFLOW_STT_MODELS.join(" ｜ ")}`,
      });

      new Setting(containerEl)
        .setName("STT API Base URL")
        .setDesc("在线语音转写接口地址")
        .addText((text) =>
          text
            .setPlaceholder(SILICONFLOW_STT_ENDPOINT)
            .setValue(this.plugin.settings.sttApiBaseUrl)
            .onChange(async (value) => {
              this.plugin.settings.sttApiBaseUrl = value.trim();
              await this.plugin.saveSettings();
            })
        )
        .addButton((button) =>
          button.setButtonText("填入 SiliconFlow").onClick(async () => {
            this.plugin.settings.sttApiBaseUrl = SILICONFLOW_STT_ENDPOINT;
            await this.plugin.saveSettings();
            this.display();
          })
        );

      new Setting(containerEl)
        .setName("STT API Key")
        .setDesc("在线语音转写接口密钥")
        .addText((text) =>
          text
            .setPlaceholder("请输入 STT API Key")
            .setValue(this.plugin.settings.sttApiKey)
            .onChange(async (value) => {
              this.plugin.settings.sttApiKey = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("STT API Model")
        .setDesc("可手填任意模型，也可以直接套用下面的 SiliconFlow 预设")
        .addDropdown((dropdown) => {
          dropdown.addOption("", "选择 SiliconFlow 预设模型");

          for (const model of SILICONFLOW_STT_MODELS) {
            dropdown.addOption(model, model);
          }

          const currentModel = this.plugin.settings.sttApiModel.trim();
          dropdown.setValue(
            SILICONFLOW_STT_MODELS.includes(
              currentModel as (typeof SILICONFLOW_STT_MODELS)[number]
            )
              ? currentModel
              : ""
          );

          dropdown.onChange(async (value) => {
            if (!value) {
              return;
            }

            this.plugin.settings.sttApiModel = value;
            await this.plugin.saveSettings();
            this.display();
          });
        })
        .addText((text) =>
          text
            .setPlaceholder(SILICONFLOW_STT_MODELS[0])
            .setValue(this.plugin.settings.sttApiModel)
            .onChange(async (value) => {
              this.plugin.settings.sttApiModel = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }
  }

  private renderAgentProviderProfiles(containerEl: HTMLElement): void {
    const profiles = this.plugin.settings.agentProfiles;

    new Setting(containerEl)
      .setName("当前激活 Provider")
      .setDesc("API 智能版只使用这里选中的一套配置；v1 不做自动切换")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "未选择");

        for (const profile of profiles) {
          dropdown.addOption(
            profile.id,
            `${profile.name}${profile.enabled ? "" : "（已停用）"}`
          );
        }

        dropdown
          .setValue(this.plugin.settings.activeAgentProfileId)
          .onChange(async (value) => {
            this.plugin.settings.activeAgentProfileId = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("Provider 列表")
      .setDesc("保存多套兼容 OpenAI 聊天接口的配置，手动选择当前使用哪一套")
      .addButton((button) =>
        button.setButtonText("新增 Provider").onClick(async () => {
          const profile = this.createAgentProviderProfile();
          this.plugin.settings.agentProfiles.push(profile);
          this.plugin.settings.activeAgentProfileId = profile.id;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (profiles.length === 0) {
      containerEl.createEl("p", {
        text: "还没有 Provider。点击上面的按钮新增一套配置。",
      });
      return;
    }

    profiles.forEach((profile, index) => {
      containerEl.createEl("h5", { text: `${index + 1}. ${profile.name}` });

      new Setting(containerEl)
        .setName("名称")
        .setDesc("只用于在设置页里区分不同 provider")
        .addText((text) =>
          text
            .setPlaceholder("例如 Aihubmix 免费额度")
            .setValue(profile.name)
            .onChange(async (value) => {
              profile.name = value.trim() || `Provider ${index + 1}`;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Provider 类型")
        .setDesc("v1 先支持兼容 OpenAI 聊天接口的 provider")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("openai_compatible", "OpenAI-compatible")
            .setValue(profile.providerType)
            .onChange(async (value) => {
              profile.providerType = value as AgentProviderType;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Base URL")
        .setDesc("兼容 OpenAI 接口格式的聊天地址")
        .addText((text) =>
          text
            .setPlaceholder("https://aihubmix.com/v1/chat/completions")
            .setValue(profile.baseUrl)
            .onChange(async (value) => {
              profile.baseUrl = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("API Key")
        .setDesc("这套 provider 的接口密钥")
        .addText((text) =>
          text
            .setPlaceholder("请输入 API Key")
            .setValue(profile.apiKey)
            .onChange(async (value) => {
              profile.apiKey = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Model")
        .setDesc("例如 coding-glm-5-free")
        .addText((text) =>
          text
            .setPlaceholder("coding-glm-5-free")
            .setValue(profile.model)
            .onChange(async (value) => {
              profile.model = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("启用")
        .setDesc("关闭后即使被选为当前激活项，也会安全退回规则版")
        .addToggle((toggle) =>
          toggle.setValue(profile.enabled).onChange(async (value) => {
            profile.enabled = value;
            await this.plugin.saveSettings();
            this.display();
          })
        )
        .addButton((button) =>
          button.setButtonText("删除").onClick(async () => {
            const ok = window.confirm(`确定删除 ${profile.name} 吗？`);
            if (!ok) return;

            this.plugin.settings.agentProfiles =
              this.plugin.settings.agentProfiles.filter(
                (item) => item.id !== profile.id
              );

            if (this.plugin.settings.activeAgentProfileId === profile.id) {
              const nextProfile = this.plugin.settings.agentProfiles.find(
                (item) => item.enabled
              );
              this.plugin.settings.activeAgentProfileId =
                nextProfile?.id ?? this.plugin.settings.agentProfiles[0]?.id ?? "";
            }

            await this.plugin.saveSettings();
            this.display();
          })
        );
    });
  }

  private createAgentProviderProfile(): AgentProviderProfile {
    const id = `agent-profile-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return {
      id,
      name: "新 Provider",
      providerType: "openai_compatible",
      baseUrl: "",
      apiKey: "",
      model: "",
      enabled: true,
    };
  }

  private async renderEmbeddedStatus(
    statusEl: HTMLElement,
    assetManager: WhisperCppAssetManager
  ): Promise<void> {
    try {
      const status = await assetManager.getStatus();

      statusEl.empty();
      statusEl.createEl("div", {
        text: `当前平台：${status.platformKey}`,
      });
      statusEl.createEl("div", {
        text: `引擎状态：${status.binaryExists ? "已下载" : "未下载"}`,
      });
      statusEl.createEl("div", {
        text: `当前模型（${status.selectedModel}）：${
          status.selectedModelExists ? "已下载" : "未下载"
        }`,
      });
      statusEl.createEl("div", {
        text: `tiny：${status.models.tiny ? "已下载" : "未下载"} ｜ base：${
          status.models.base ? "已下载" : "未下载"
        } ｜ small：${status.models.small ? "已下载" : "未下载"}`,
      });
      statusEl.createEl("div", {
        text: `资源目录：${status.resourceRoot}`,
      });

      if (!status.autoBinarySupported) {
        const tip = statusEl.createEl("div", {
          text: "当前平台暂未接入自动下载引擎；模型仍可下载。",
        });
        tip.style.marginTop = "6px";
        tip.style.color = "var(--text-muted)";
      }
    } catch (error) {
      console.error(error);
      statusEl.setText("检查本地资源状态失败，请查看控制台。");
    }
  }
}
