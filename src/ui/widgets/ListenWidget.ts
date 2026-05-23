import type { App } from "obsidian";

import type { GeneratedSoundPreset } from "../../types";
import {
  basenameWithoutExt,
  getGroundingResourceUrl,
  readGroundingBinary,
  resolveGroundingAssetFiles,
} from "../../services/groundingAssetResolver";
import {
  GROUNDING_AUDIO_FOLDERS,
  GROUNDING_IMAGE_FOLDERS,
  GROUNDING_LISTEN_HINTS,
} from "../actionPanelRegistry";

type AudioItem = {
  path: string;
  name: string;
  basename: string;
};

type GeneratedPresetId =
  | "rain"
  | "ocean"
  | "forest"
  | "ethereal"
  | "white_noise"
  | "warm"
  | "pluck"
  | "soft_bell";

type KeywordResolvedPreset = {
  presetId: GeneratedPresetId;
  matchedKeyword: string | null;
};

type GeneratedSoundSourceResolution = KeywordResolvedPreset & {
  intentSource: "preset" | "keyword" | "custom";
  displayLabel: string;
  helperText?: string;
  seed: number;
  customPresetId?: string;
};

export type SoundCardTabId =
  | "surrounding_sound"
  | "my_music"
  | "generated_sound"
  | "online_radio";

export type ListenCardSubmission = {
  tabId: "surrounding_sound" | "my_music";
  values: string[];
};

type ListenWidgetOptions = {
  app: App;
  onContinue: (submission: ListenCardSubmission) => void;
  onSwapAction?: () => void | Promise<void>;
  initialTab?: SoundCardTabId;
  onTabChange?: (tabId: SoundCardTabId) => void;
  onSkip?: () => void;
  onContinueChat?: () => void | Promise<void>;
  onOpenSettings?: () => void | Promise<void>;
  onSaveGeneratedPreset?: (
    preset: GeneratedSoundPreset
  ) => void | Promise<void>;
  onDeleteGeneratedPreset?: (
    preset: GeneratedSoundPreset
  ) => void | Promise<void>;
  configuredAudioFolder?: string;
  configuredImageFolder?: string;
  audioFolders?: string[];
  imageFolders?: string[];
  musicVolume?: number;
  generatedSoundVolume?: number;
  enableOnlineSound?: boolean;
  trustedOnlineSoundUrls?: string[];
  generatedSoundPresets?: GeneratedSoundPreset[];
};

const MUSIC_REFLECTION_HINTS = [
  "慢慢的钢琴",
  "像下雨",
  "有点空",
  "节奏很轻",
  "像一小团雾",
  "身体好像松一点",
];

const SURROUNDING_SOUND_PLACEHOLDERS = [
  "空调声",
  "键盘声",
  "外面的车声",
  "衣服摩擦声",
  "远处人声",
];

const TAB_LABELS: Record<SoundCardTabId, string> = {
  surrounding_sound: "身边声音",
  my_music: "我的音乐",
  generated_sound: "生成声音",
  online_radio: "随机在线",
};

const GENERATED_PRESETS: Array<{ id: GeneratedPresetId; label: string }> = [
  { id: "rain", label: "雨声" },
  { id: "ocean", label: "海浪" },
  { id: "forest", label: "森林" },
  { id: "ethereal", label: "空灵" },
  { id: "white_noise", label: "白噪" },
  { id: "warm", label: "温暖一点" },
];

const KEYWORD_PRESET_RULES: Array<{
  terms: string[];
  presetId: GeneratedPresetId;
  hint: string;
}> = [
  { terms: ["雨", "下雨", "雨声"], presetId: "rain", hint: "会往雨声的方向调一点。" },
  { terms: ["海", "海浪"], presetId: "ocean", hint: "会往海浪的方向调一点。" },
  { terms: ["森林", "鸟", "风"], presetId: "forest", hint: "会往森林和风声的方向调一点。" },
  { terms: ["空", "空灵", "空一点"], presetId: "ethereal", hint: "会往更空一点的氛围调。" },
  { terms: ["白噪", "噪声"], presetId: "white_noise", hint: "会往更均匀的白噪方向调。" },
  { terms: ["温暖", "暖一点"], presetId: "warm", hint: "会往更暖一点的底色调。" },
  { terms: ["吉他", "弦", "拨弦"], presetId: "pluck", hint: "会生成一点像拨弦的轻声音，不是真实吉他。" },
  { terms: ["钢琴", "琴"], presetId: "soft_bell", hint: "会生成一点像轻钢琴或钟音的质感，不是真实钢琴录音。" },
];

// Sound card resource strategy:
// - MoodNest does not bundle third-party music by default.
// - "身边声音" still works even when zero local music is available.
// - Users can point groundingAudioFolder to their own local music folder.
// - Online sound must be explicitly enabled by users with trusted URLs.
export class ListenWidget {
  private root: HTMLDivElement;
  private tabButtons = new Map<SoundCardTabId, HTMLButtonElement>();
  private bodyEl: HTMLDivElement;
  private bannerEl: HTMLParagraphElement | null = null;
  private activeTabId: SoundCardTabId = "surrounding_sound";

  private surroundingInputEls: HTMLInputElement[] = [];
  private musicTextareaEl: HTMLTextAreaElement | null = null;
  private generatedKeywordEl: HTMLInputElement | null = null;
  private generatedKeywordInput = "";

  private continueButtonEl: HTMLButtonElement | null = null;
  private playButtonEl: HTMLButtonElement | null = null;
  private randomButtonEl: HTMLButtonElement | null = null;
  private playerStatusEl: HTMLParagraphElement | null = null;
  private currentTrackEl: HTMLParagraphElement | null = null;
  private progressEl: HTMLInputElement | null = null;
  private timeEl: HTMLParagraphElement | null = null;
  private pickerEl: HTMLSelectElement | null = null;
  private playerLabelEl: HTMLSpanElement | null = null;
  private playerCoverEl: HTMLDivElement | null = null;
  private playerCardEl: HTMLDivElement | null = null;
  private currentCoverPath: string | null = null;
  private coverImagePaths: string[] = [];

  private generatedStatusEl: HTMLParagraphElement | null = null;
  private generateButtonEl: HTMLButtonElement | null = null;
  private saveGeneratedButtonEl: HTMLButtonElement | null = null;
  private generatedPresetButtons = new Map<GeneratedPresetId, HTMLButtonElement>();
  private generatedCustomPresetButtons = new Map<string, HTMLButtonElement>();
  private generatedPlayerCardEl: HTMLDivElement | null = null;
  private generatedPlayerCoverEl: HTMLDivElement | null = null;
  private generatedPlayerLabelEl: HTMLSpanElement | null = null;
  private generatedPlayerTitleEl: HTMLParagraphElement | null = null;
  private generatedProgressEl: HTMLInputElement | null = null;
  private generatedTimeEl: HTMLParagraphElement | null = null;
  private generatedPlayerStatusEl: HTMLParagraphElement | null = null;
  private generatedStartedAt = 0;
  private generatedTickTimer: number | null = null;

  private onlineStatusEl: HTMLParagraphElement | null = null;
  private onlineSummaryEl: HTMLParagraphElement | null = null;
  private onlineRandomButtonEl: HTMLButtonElement | null = null;
  private onlinePlayButtonEl: HTMLButtonElement | null = null;

  private audioEl: HTMLAudioElement | null = null;
  private audioFiles: AudioItem[] = [];
  private currentAudio: AudioItem | null = null;
  private currentAudioUrl: string | null = null;
  private isSeeking = false;

  private onlineAudioEl: HTMLAudioElement | null = null;
  private selectedOnlineUrl: string | null = null;
  private currentOnlineAudioUrl: string | null = null;

  private audioContext: AudioContext | null = null;
  private generatedStopTimer: number | null = null;
  private generatedCleanupFns: Array<() => void> = [];
  private generatedIsPlaying = false;
  private generatedPreset: GeneratedPresetId = "rain";
  private lastSoundIntentSource: "preset" | "keyword" | "custom" = "preset";
  private generatedDuration = 30;
  private generatedHintPresetButtonEl: HTMLButtonElement | null = null;
  private generatedDeleteModeButtonEl: HTMLButtonElement | null = null;
  private savedGeneratedPresets: GeneratedSoundPreset[] = [];
  private selectedGeneratedCustomPresetId: string | null = null;
  private generatedDeleteMode = false;

  private inlineFallbackMessage: string | null = null;
  private assetBannerMessage: string | null = null;
  private onlineIsLoading = false;

  constructor(mountEl: HTMLElement, private options: ListenWidgetOptions) {
    if (
      options.initialTab === "my_music" ||
      options.initialTab === "surrounding_sound" ||
      options.initialTab === "generated_sound" ||
      options.initialTab === "online_radio"
    ) {
      this.activeTabId = options.initialTab;
    }

    this.savedGeneratedPresets = [...(options.generatedSoundPresets ?? [])];

    this.root = mountEl.createDiv();
    this.root.style.display = "grid";
    this.root.style.gap = "12px";
    this.root.style.maxWidth = "100%";
    this.root.style.minWidth = "0";

    this.bannerEl = this.root.createEl("p");
    this.bannerEl.style.margin = "0";
    this.bannerEl.style.fontSize = "13px";
    this.bannerEl.style.lineHeight = "1.6";
    this.bannerEl.style.color = "#65717c";
    this.bannerEl.style.display = "none";

    const tabRow = this.root.createDiv();
    tabRow.style.display = "flex";
    tabRow.style.flexWrap = "wrap";
    tabRow.style.gap = "8px";

    (Object.keys(TAB_LABELS) as SoundCardTabId[]).forEach((tabId) => {
      const buttonEl = tabRow.createEl("button", { text: TAB_LABELS[tabId] });
      this.styleTabButton(buttonEl, tabId === this.activeTabId);
      buttonEl.addEventListener("click", () => this.setActiveTab(tabId));
      this.tabButtons.set(tabId, buttonEl);
    });
    this.syncTabButtons();

    this.bodyEl = this.root.createDiv();
    this.bodyEl.style.display = "grid";
    this.bodyEl.style.gap = "12px";
    this.bodyEl.style.maxWidth = "100%";
    this.bodyEl.style.minWidth = "0";

    void Promise.all([this.loadAudioFiles(), this.loadCoverImages()]).finally(() =>
      this.renderActiveTab()
    );
    this.renderActiveTab();
  }

  destroy(): void {
    this.stopPlayback();
    this.stopOnlinePlayback();
    void this.stopGeneratedSound();

    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = "";
      this.audioEl = null;
    }

    if (this.onlineAudioEl) {
      this.onlineAudioEl.pause();
      this.onlineAudioEl.src = "";
      this.onlineAudioEl = null;
      this.currentOnlineAudioUrl = null;
    }

    this.cleanupAudioUrl();
    this.root.detach();
  }

  private setActiveTab(tabId: SoundCardTabId): void {
    if (tabId === "my_music" && this.audioFiles.length === 0) {
      this.inlineFallbackMessage = "暂时没找到本地音频，先用身边声音也可以。";
      this.activeTabId = "surrounding_sound";
    } else {
      this.inlineFallbackMessage = null;
      this.activeTabId = tabId;
    }

    if (this.activeTabId !== "my_music") {
      this.stopPlayback();
    }
    if (this.activeTabId !== "online_radio") {
      this.stopOnlinePlayback();
    }
    if (this.activeTabId !== "generated_sound") {
      void this.stopGeneratedSound();
    }

    this.syncTabButtons();
    this.renderActiveTab();
    this.options.onTabChange?.(this.activeTabId);
    this.logLocalEvent(`tab_${tabId}`);
  }

  private syncTabButtons(): void {
    this.tabButtons.forEach((buttonEl, tabId) => {
      if (tabId === "online_radio") {
        buttonEl.style.display = this.shouldShowOnlineRadioTab() ? "" : "none";
      }
      this.styleTabButton(buttonEl, tabId === this.activeTabId);
    });
  }

  private shouldShowOnlineRadioTab(): boolean {
    return !!this.options.enableOnlineSound && this.getTrustedOnlineUrls().length > 0;
  }

  private styleTabButton(buttonEl: HTMLButtonElement, selected: boolean): void {
    buttonEl.style.height = "36px";
    buttonEl.style.borderRadius = "999px";
    buttonEl.style.padding = "0 14px";
    buttonEl.style.border = selected
      ? "1px solid rgba(76, 107, 95, 0.36)"
      : "1px solid rgba(118, 128, 145, 0.12)";
    buttonEl.style.background = selected
      ? "rgba(220, 232, 227, 0.96)"
      : "rgba(255,255,255,0.92)";
    buttonEl.style.color = "#23303a";
  }

  private stylePrimaryButton(buttonEl: HTMLButtonElement): void {
    buttonEl.className = "moodnest-flow-button";
    buttonEl.style.height = "38px";
    buttonEl.style.borderRadius = "14px";
    buttonEl.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    buttonEl.style.background = "#dce8e3";
    buttonEl.style.color = "#23303a";
    buttonEl.style.fontWeight = "600";
    buttonEl.style.fontSize = "14px";
    buttonEl.style.minWidth = "88px";
    buttonEl.style.padding = "0 14px";
    buttonEl.style.maxWidth = "100%";
    buttonEl.style.whiteSpace = "nowrap";
    buttonEl.style.flex = "0 0 auto";
  }

  private styleSecondaryButton(buttonEl: HTMLButtonElement): void {
    buttonEl.style.height = "38px";
    buttonEl.style.borderRadius = "14px";
    buttonEl.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    buttonEl.style.background = "rgba(255,255,255,0.92)";
    buttonEl.style.color = "#55636d";
    buttonEl.style.fontSize = "14px";
    buttonEl.style.fontWeight = "500";
    buttonEl.style.padding = "0 12px";
    buttonEl.style.maxWidth = "100%";
    buttonEl.style.whiteSpace = "nowrap";
    buttonEl.style.outline = "none";
  }

  private styleFlowSecondaryButton(
    buttonEl: HTMLButtonElement,
    compact = false
  ): void {
    buttonEl.className = `moodnest-flow-button${compact ? " compact" : ""}`;
    buttonEl.style.height = "38px";
    buttonEl.style.minWidth = compact ? "72px" : "88px";
    buttonEl.style.padding = "0 14px";
    buttonEl.style.borderRadius = "14px";
    buttonEl.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    buttonEl.style.background = "rgba(255,255,255,0.92)";
    buttonEl.style.color = "#55636d";
    buttonEl.style.fontSize = "14px";
    buttonEl.style.fontWeight = "500";
    buttonEl.style.whiteSpace = "nowrap";
    buttonEl.style.flex = "0 0 auto";
  }

  private styleLinkButton(buttonEl: HTMLButtonElement): void {
    buttonEl.type = "button";
    buttonEl.style.appearance = "none";
    buttonEl.style.padding = "0";
    buttonEl.style.border = "none";
    buttonEl.style.background = "transparent";
    buttonEl.style.color = "#73808a";
    buttonEl.style.fontSize = "12px";
    buttonEl.style.lineHeight = "1.5";
    buttonEl.style.cursor = "pointer";
    buttonEl.style.textDecoration = "none";
    buttonEl.style.boxShadow = "none";
    buttonEl.style.height = "auto";
    buttonEl.style.minHeight = "0";
    buttonEl.style.display = "inline-flex";
    buttonEl.style.alignItems = "center";
    buttonEl.style.justifyContent = "center";
    buttonEl.style.verticalAlign = "middle";
    buttonEl.style.maxWidth = "100%";
  }

  private styleInfoCard(cardEl: HTMLDivElement): void {
    cardEl.style.display = "grid";
    cardEl.style.gap = "10px";
    cardEl.style.padding = "14px";
    cardEl.style.borderRadius = "18px";
    cardEl.style.background = "rgba(255,255,255,0.78)";
    cardEl.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    cardEl.style.boxShadow = "0 8px 18px rgba(30, 35, 45, 0.04)";
  }

  private styleTextarea(textareaEl: HTMLTextAreaElement): void {
    textareaEl.style.width = "100%";
    textareaEl.style.boxSizing = "border-box";
    textareaEl.style.resize = "vertical";
    textareaEl.style.minHeight = "108px";
    textareaEl.style.borderRadius = "14px";
    textareaEl.style.border = "1px solid rgba(118, 128, 145, 0.14)";
    textareaEl.style.padding = "12px 14px";
    textareaEl.style.background = "rgba(255,255,255,0.92)";
    textareaEl.style.fontSize = "14px";
    textareaEl.style.lineHeight = "1.7";
  }

  private styleInput(inputEl: HTMLInputElement): void {
    inputEl.style.height = "40px";
    inputEl.style.width = "100%";
    inputEl.style.boxSizing = "border-box";
    inputEl.style.borderRadius = "12px";
    inputEl.style.border = "1px solid rgba(118, 128, 145, 0.14)";
    inputEl.style.padding = "0 12px";
    inputEl.style.background = "rgba(255,255,255,0.92)";
    inputEl.style.fontSize = "14px";
    inputEl.style.color = "#23303a";
  }

  private getMusicVolume(): number {
    const volume = this.options.musicVolume;
    return typeof volume === "number" && Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : 0.85;
  }

  private createPlayerCard(
    parent: HTMLElement,
    sourceLabel: string
  ): {
    cardEl: HTMLDivElement;
    coverEl: HTMLDivElement;
    bodyEl: HTMLDivElement;
    labelEl: HTMLSpanElement;
    titleEl: HTMLParagraphElement;
    progressEl: HTMLInputElement;
    timeEl: HTMLParagraphElement;
    controlsRow: HTMLDivElement;
    statusEl: HTMLParagraphElement;
  } {
    const cardEl = parent.createDiv();
    cardEl.style.display = "grid";
    cardEl.style.gridTemplateColumns = "minmax(0, 1fr)";
    cardEl.style.gap = "10px";
    cardEl.style.alignItems = "center";
    cardEl.style.justifyItems = "center";
    cardEl.style.padding = "16px";
    cardEl.style.borderRadius = "24px";
    cardEl.style.background =
      "linear-gradient(160deg, rgba(255,255,255,0.96), rgba(247,243,236,0.98) 58%, rgba(235,244,239,0.96))";
    cardEl.style.border = "1px solid rgba(118, 128, 145, 0.10)";
    cardEl.style.boxShadow = "0 14px 28px rgba(30, 35, 45, 0.06)";
    cardEl.style.maxWidth = "100%";
    cardEl.style.minWidth = "0";
    cardEl.style.boxSizing = "border-box";
    cardEl.style.position = "relative";
    cardEl.style.overflow = "hidden";

    const glowEl = cardEl.createDiv();
    glowEl.style.position = "absolute";
    glowEl.style.inset = "-24px";
    glowEl.style.background =
      "radial-gradient(circle at top, rgba(228, 238, 231, 0.68), transparent 56%), radial-gradient(circle at bottom right, rgba(244, 232, 220, 0.56), transparent 52%)";
    glowEl.style.filter = "blur(14px)";
    glowEl.style.pointerEvents = "none";

    const coverEl = cardEl.createDiv();
    coverEl.style.width = "112px";
    coverEl.style.height = "112px";
    coverEl.style.borderRadius = "28px";
    coverEl.style.background =
      "linear-gradient(135deg, rgba(223, 233, 228, 0.98), rgba(242, 229, 218, 0.94))";
    coverEl.style.backgroundSize = "cover";
    coverEl.style.backgroundPosition = "center";
    coverEl.style.boxShadow =
      "inset 0 1px 0 rgba(255,255,255,0.55), 0 8px 16px rgba(30,35,45,0.08)";
    coverEl.style.boxSizing = "border-box";
    coverEl.style.position = "relative";
    coverEl.style.overflow = "hidden";
    coverEl.style.zIndex = "1";

    const bodyEl = cardEl.createDiv();
    bodyEl.style.display = "grid";
    bodyEl.style.gap = "6px";
    bodyEl.style.minWidth = "0";
    bodyEl.style.maxWidth = "100%";
    bodyEl.style.width = "100%";
    bodyEl.style.boxSizing = "border-box";
    bodyEl.style.position = "relative";
    bodyEl.style.zIndex = "1";

    const labelEl = bodyEl.createEl("span", { text: sourceLabel });
    labelEl.style.justifySelf = "center";
    labelEl.style.padding = "2px 8px";
    labelEl.style.borderRadius = "999px";
    labelEl.style.background = "rgba(220, 232, 227, 0.88)";
    labelEl.style.color = "#4b6259";
    labelEl.style.fontSize = "11px";
    labelEl.style.lineHeight = "1.5";

    const titleEl = bodyEl.createEl("p");
    titleEl.style.margin = "0";
    titleEl.style.fontSize = "14px";
    titleEl.style.fontWeight = "600";
    titleEl.style.lineHeight = "1.5";
    titleEl.style.color = "#2f3d45";
    titleEl.style.whiteSpace = "nowrap";
    titleEl.style.overflow = "hidden";
    titleEl.style.textOverflow = "ellipsis";
    titleEl.style.maxWidth = "100%";
    titleEl.style.textAlign = "center";

    const progressEl = bodyEl.createEl("input");
    progressEl.type = "range";
    progressEl.min = "0";
    progressEl.max = "1000";
    progressEl.value = "0";
    progressEl.style.width = "100%";
    progressEl.style.maxWidth = "100%";
    progressEl.style.minWidth = "0";
    progressEl.style.margin = "5px 0 3px";
    progressEl.style.boxSizing = "border-box";

    const metaRow = bodyEl.createDiv();
    metaRow.style.display = "flex";
    metaRow.style.alignItems = "center";
    metaRow.style.justifyContent = "space-between";
    metaRow.style.gap = "8px";
    metaRow.style.flexWrap = "wrap";
    metaRow.style.minWidth = "0";

    const timeEl = metaRow.createEl("p", { text: "0:00 / 0:00" });
    timeEl.style.margin = "0";
    timeEl.style.fontSize = "12px";
    timeEl.style.color = "#7d8892";
    timeEl.style.minWidth = "0";

    const controlsRow = bodyEl.createDiv();
    controlsRow.style.display = "flex";
    controlsRow.style.flexWrap = "wrap";
    controlsRow.style.gap = "8px";
    controlsRow.style.maxWidth = "100%";
    controlsRow.style.minWidth = "0";
    controlsRow.style.justifyContent = "center";

    const statusEl = bodyEl.createEl("p");
    statusEl.style.margin = "0";
    statusEl.style.fontSize = "12px";
    statusEl.style.lineHeight = "1.6";
    statusEl.style.color = "#6f7b84";
    statusEl.style.textAlign = "center";

    return {
      cardEl,
      coverEl,
      bodyEl,
      labelEl,
      titleEl,
      progressEl,
      timeEl,
      controlsRow,
      statusEl,
    };
  }

  private createAuxActionRow(parent: HTMLElement): HTMLDivElement {
    const row = parent.createDiv();
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.maxWidth = "100%";
    row.style.minWidth = "0";
    return row;
  }

  private createWeakLinkRow(parent: HTMLElement): HTMLDivElement {
    const row = parent.createDiv();
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.flexWrap = "wrap";
    row.style.marginTop = "2px";
    row.style.maxWidth = "100%";
    row.style.minWidth = "0";
    return row;
  }

  private createPrimaryRow(parent: HTMLElement): HTMLDivElement {
    const row = parent.createDiv({ cls: "moodnest-action-footer" });
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.maxWidth = "100%";
    row.style.minWidth = "0";
    return row;
  }

  private styleCompactTransportButton(
    buttonEl: HTMLButtonElement,
    variant: "primary" | "secondary" | "wide" = "secondary"
  ): void {
    buttonEl.className = `moodnest-player-button ${
      variant === "wide" ? "text-icon" : "icon-only"
    }`;
    this.styleSecondaryButton(buttonEl);
    buttonEl.style.minWidth = variant === "wide" ? "78px" : "40px";
    buttonEl.style.width = variant === "wide" ? "auto" : "40px";
    buttonEl.style.height = "40px";
    buttonEl.style.padding = variant === "wide" ? "0 12px" : "0";
    buttonEl.style.borderRadius = "14px";
    buttonEl.style.fontSize = variant === "wide" ? "14px" : "17px";
    buttonEl.style.fontWeight = "600";
    buttonEl.style.lineHeight = "1";
    buttonEl.style.flex = "0 0 auto";
    buttonEl.style.display = "inline-flex";
    buttonEl.style.alignItems = "center";
    buttonEl.style.justifyContent = "center";
    buttonEl.style.gap = "6px";
    buttonEl.style.cursor = "pointer";
    if (variant === "primary") {
      buttonEl.style.background = "rgba(220, 232, 227, 0.96)";
      buttonEl.style.color = "#23303a";
      buttonEl.style.boxShadow = "0 6px 14px rgba(72, 98, 89, 0.08)";
    }
  }

  private createWeakLink(
    parent: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>
  ): void {
    const buttonEl = parent.createEl("button", { text: label });
    this.styleLinkButton(buttonEl);
    buttonEl.addEventListener("click", () => {
      void onClick();
    });
  }

  private createWeakDivider(parent: HTMLElement): void {
    const divider = parent.createEl("span", { text: "·" });
    divider.style.color = "#9aa4ad";
    divider.style.fontSize = "13px";
  }

  private logLocalEvent(event: string): void {
    console.debug(`[MoodNest action local] action=listen event=${event} api=false`);
  }

  private setBanner(text: string | null): void {
    if (!this.bannerEl) {
      return;
    }

    if (!text) {
      this.bannerEl.style.display = "none";
      this.bannerEl.setText("");
      return;
    }

    this.bannerEl.style.display = "";
    this.bannerEl.setText(text);
  }

  private renderActiveTab(): void {
    this.bodyEl.empty();
    this.setBanner(this.inlineFallbackMessage ?? this.assetBannerMessage);
    this.inlineFallbackMessage = null;

    this.surroundingInputEls = [];
    this.musicTextareaEl = null;
    this.generatedKeywordEl = null;
    this.continueButtonEl = null;
    this.playButtonEl = null;
    this.randomButtonEl = null;
    this.playerStatusEl = null;
    this.currentTrackEl = null;
    this.progressEl = null;
    this.timeEl = null;
    this.pickerEl = null;
    this.generatedDeleteModeButtonEl = null;
    this.generatedCustomPresetButtons.clear();

    if (this.activeTabId === "my_music" && this.audioFiles.length === 0) {
      this.activeTabId = "surrounding_sound";
      this.inlineFallbackMessage = "暂时没找到本地音频，先用身边声音也可以。";
      this.setBanner(this.inlineFallbackMessage);
      this.inlineFallbackMessage = null;
      this.syncTabButtons();
    }

    if (this.activeTabId === "online_radio" && !this.shouldShowOnlineRadioTab()) {
      this.activeTabId = "surrounding_sound";
      this.syncTabButtons();
    }

    switch (this.activeTabId) {
      case "surrounding_sound":
        this.renderSurroundingSoundTab();
        break;
      case "my_music":
        this.renderMyMusicTab();
        break;
      case "generated_sound":
        this.renderGeneratedSoundTab();
        break;
      case "online_radio":
        this.renderOnlineRadioTab();
        break;
    }
  }

  private renderSurroundingSoundTab(): void {
    const introEl = this.bodyEl.createEl("p", {
      text: "先听见身边一个声音。听到一个也算，不用听清楚。",
    });
    introEl.style.margin = "0";
    introEl.style.fontSize = "14px";
    introEl.style.lineHeight = "1.7";
    introEl.style.color = "#5d6973";

    const listEl = this.bodyEl.createDiv();
    listEl.style.display = "grid";
    listEl.style.gap = "8px";

    SURROUNDING_SOUND_PLACEHOLDERS.forEach((placeholder, index) => {
      const rowEl = listEl.createDiv();
      rowEl.style.display = "grid";
      rowEl.style.gridTemplateColumns = "28px 1fr";
      rowEl.style.gap = "10px";
      rowEl.style.alignItems = "center";

      const countEl = rowEl.createDiv({ text: String(index + 1) });
      countEl.style.width = "28px";
      countEl.style.height = "28px";
      countEl.style.borderRadius = "999px";
      countEl.style.display = "grid";
      countEl.style.placeItems = "center";
      countEl.style.background = "rgba(221, 231, 227, 0.95)";
      countEl.style.color = "#30404a";
      countEl.style.fontSize = "13px";
      countEl.style.fontWeight = "600";

      const inputEl = rowEl.createEl("input");
      inputEl.type = "text";
      inputEl.placeholder = `比如：${placeholder}`;
      inputEl.style.height = "40px";
      inputEl.style.borderRadius = "12px";
      inputEl.style.border = "1px solid rgba(118, 128, 145, 0.14)";
      inputEl.style.padding = "0 12px";
      inputEl.style.background = "rgba(255,255,255,0.92)";
      inputEl.style.color = "#23303a";
      inputEl.style.fontSize = "14px";
      inputEl.addEventListener("input", () => this.updateState());
      inputEl.addEventListener("keydown", (event) =>
        this.handleSurroundingEnterKey(event, index)
      );
      this.surroundingInputEls.push(inputEl);
    });

    const primaryRow = this.createPrimaryRow(this.bodyEl);
    primaryRow.style.flexWrap = "wrap";
    this.continueButtonEl = primaryRow.createEl("button", { text: "够了，继续" });
    this.stylePrimaryButton(this.continueButtonEl);
    this.continueButtonEl.addEventListener("click", () => this.submit());

    const auxRow = primaryRow;
    const hintButton = auxRow.createEl("button", { text: "给我提示" });
    this.styleFlowSecondaryButton(hintButton, true);
    hintButton.addEventListener("click", () => {
      this.logLocalEvent("starter_hint_surrounding");
      this.fillSurroundingHint();
    });

    const swapButton = auxRow.createEl("button", { text: "换个动作" });
    this.styleFlowSecondaryButton(swapButton, true);
    swapButton.addEventListener("click", () => {
      this.logLocalEvent("swap_action_surrounding");
      void this.options.onSwapAction?.();
    });

    this.updateState();
  }

  private renderMyMusicTab(): void {
    if (this.audioFiles.length === 0) {
      const fallbackCard = this.bodyEl.createDiv();
      this.styleInfoCard(fallbackCard);
      fallbackCard.createEl("p", {
        text: "还没有找到本地音频，也没关系，可以先听一个身边的声音。",
      }).style.margin = "0";
      return;
    }

    const playerCard = this.bodyEl.createDiv();
    playerCard.style.display = "grid";
    playerCard.style.gap = "10px";
    playerCard.style.width = "100%";
    playerCard.style.maxWidth = "100%";
    playerCard.style.minWidth = "0";
    playerCard.style.overflow = "hidden";
    playerCard.style.boxSizing = "border-box";

    const libraryStatusEl = playerCard.createEl("p", {
      text: `已找到 ${this.audioFiles.length} 个本地音频。`,
    });
    libraryStatusEl.style.margin = "0";
    libraryStatusEl.style.fontSize = "12px";
    libraryStatusEl.style.color = "#7a8690";
    libraryStatusEl.style.display = "none";

    const shell = this.createPlayerCard(playerCard, "本地音频");
    this.playerCardEl = shell.cardEl;
    this.playerCoverEl = shell.coverEl;
    this.playerLabelEl = shell.labelEl;
    this.currentTrackEl = shell.titleEl;
    this.progressEl = shell.progressEl;
    this.timeEl = shell.timeEl;
    this.playerStatusEl = shell.statusEl;
    this.applyCoverVisual(this.playerCoverEl, this.currentCoverPath);
    shell.titleEl.setText("当前：选一首本地音频");

    const pickerWrapEl = shell.bodyEl.createDiv();
    pickerWrapEl.style.display = "flex";
    pickerWrapEl.style.alignItems = "center";
    pickerWrapEl.style.gap = "8px";
    pickerWrapEl.style.flexWrap = "nowrap";
    pickerWrapEl.style.minWidth = "0";
    pickerWrapEl.style.width = "100%";
    pickerWrapEl.style.maxWidth = "100%";
    pickerWrapEl.style.overflow = "hidden";
    pickerWrapEl.style.boxSizing = "border-box";
    pickerWrapEl.style.marginTop = "6px";

    this.pickerEl = pickerWrapEl.createEl("select");
    this.pickerEl.style.height = "38px";
    this.pickerEl.style.borderRadius = "10px";
    this.pickerEl.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    this.pickerEl.style.padding = "0 10px";
    this.pickerEl.style.background = "rgba(255,255,255,0.96)";
    this.pickerEl.style.flex = "1 1 0";
    this.pickerEl.style.width = "100%";
    this.pickerEl.style.maxWidth = "100%";
    this.pickerEl.style.minWidth = "0";
    this.pickerEl.style.display = "block";
    this.pickerEl.style.boxSizing = "border-box";
    this.pickerEl.style.overflow = "hidden";
    this.pickerEl.style.textOverflow = "ellipsis";
    this.pickerEl.style.whiteSpace = "nowrap";
    this.pickerEl.style.outline = "none";
    this.pickerEl.style.boxShadow = "none";
    this.pickerEl.addEventListener("change", () => {
      this.logLocalEvent("select_track");
      void this.playTrackByPath(this.pickerEl?.value ?? "");
    });

    this.playButtonEl = pickerWrapEl.createEl("button", { text: "▶" });
    this.styleCompactTransportButton(this.playButtonEl, "primary");
    this.playButtonEl.style.flex = "0 0 auto";
    this.playButtonEl.title = "播放";
    this.playButtonEl.setAttribute("aria-label", "播放");
    this.playButtonEl.addEventListener("click", () => {
      void this.togglePlayPause();
    });

    this.randomButtonEl = pickerWrapEl.createEl("button", { text: "↻" });
    this.styleCompactTransportButton(this.randomButtonEl, "secondary");
    this.randomButtonEl.style.flex = "0 0 auto";
    this.randomButtonEl.title = "随机一首";
    this.randomButtonEl.setAttribute("aria-label", "随机一首");
    this.randomButtonEl.addEventListener("click", () => {
      this.logLocalEvent("random_music");
      void this.playRandomTrack();
    });

    this.progressEl.addEventListener("input", () => {
      this.isSeeking = true;
      this.updateProgressUiFromInput();
    });
    this.progressEl.addEventListener("change", () => {
      this.seekToProgress();
      this.isSeeking = false;
    });

    this.currentTrackEl.setText("当前：选一首本地音频");
    this.playerStatusEl.setText("");

    const promptTitleEl = this.bodyEl.createEl("p", {
      text: "听一小段后，可以随便写一点感受。",
    });
    promptTitleEl.style.margin = "0";
    promptTitleEl.style.fontSize = "13px";
    promptTitleEl.style.fontWeight = "600";
    promptTitleEl.style.lineHeight = "1.6";
    promptTitleEl.style.color = "#52616b";

    const promptEl = this.bodyEl.createEl("p", {
      text: "节奏、乐器、画面，或者听完后的感觉，都可以。",
    });
    promptEl.style.margin = "0";
    promptEl.style.fontSize = "13px";
    promptEl.style.lineHeight = "1.6";
    promptEl.style.color = "#6f7b84";

    this.musicTextareaEl = this.bodyEl.createEl("textarea");
    this.musicTextareaEl.rows = 4;
    this.musicTextareaEl.placeholder =
      "比如：慢慢的钢琴 / 像下雨 / 有点空 / 节奏很轻";
    this.styleTextarea(this.musicTextareaEl);
    this.musicTextareaEl.addEventListener("input", () => this.updateState());
    this.musicTextareaEl.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        (event.ctrlKey || event.metaKey) &&
        this.getActiveValues().length > 0
      ) {
        event.preventDefault();
        this.submit();
      }
    });

    const primaryRow = this.createPrimaryRow(this.bodyEl);
    primaryRow.style.flexWrap = "wrap";
    this.continueButtonEl = primaryRow.createEl("button", { text: "够了，继续" });
    this.stylePrimaryButton(this.continueButtonEl);
    this.continueButtonEl.addEventListener("click", () => this.submit());

    const auxRow = primaryRow;
    const hintButton = auxRow.createEl("button", { text: "给我提示" });
    this.styleFlowSecondaryButton(hintButton, true);
    hintButton.addEventListener("click", () => {
      this.logLocalEvent("starter_hint_music");
      this.fillMusicHint();
    });

    const swapButton = auxRow.createEl("button", { text: "换个动作" });
    this.styleFlowSecondaryButton(swapButton, true);
    swapButton.addEventListener("click", () => {
      this.logLocalEvent("swap_action_music");
      void this.options.onSwapAction?.();
    });

    this.refreshPicker();
    this.syncAudioUi(true);
    this.updateState();
  }

  private renderGeneratedSoundTab(): void {
    const generatedPlayerWrap = this.bodyEl.createDiv();
    generatedPlayerWrap.style.display = "grid";
    generatedPlayerWrap.style.gap = "10px";
    this.generatedPlayerCardEl = generatedPlayerWrap;

    const shell = this.createPlayerCard(generatedPlayerWrap, "生成声音");
    this.generatedPlayerCardEl = shell.cardEl;
    this.generatedPlayerCoverEl = shell.coverEl;
    this.generatedPlayerLabelEl = shell.labelEl;
    this.generatedPlayerTitleEl = shell.titleEl;
    this.generatedProgressEl = shell.progressEl;
    this.generatedTimeEl = shell.timeEl;
    this.generatedPlayerStatusEl = shell.statusEl;
    this.generatedProgressEl.disabled = true;
    this.generatedProgressEl.style.pointerEvents = "none";
    this.generatedPlayerTitleEl.setText(`${this.getGeneratedPresetLabel()}氛围声`);
    this.generatedPlayerStatusEl.setText("");
    this.applyCoverVisual(this.generatedPlayerCoverEl, this.currentCoverPath);

    const generatedControlsRow = shell.controlsRow;
    this.generateButtonEl = generatedControlsRow.createEl("button", {
      text: "▶ 生成",
    });
    this.styleCompactTransportButton(this.generateButtonEl, "wide");
    this.generateButtonEl.title = "生成 30 秒";
    this.generateButtonEl.setAttribute("aria-label", "生成 30 秒");
    this.generateButtonEl.addEventListener("click", () => {
      if (this.generatedIsPlaying) {
        void this.stopGeneratedSound();
        return;
      }
      void this.generateSound();
    });
    this.generatedHintPresetButtonEl = generatedControlsRow.createEl("button", {
      text: "🎲",
    });
    this.styleCompactTransportButton(this.generatedHintPresetButtonEl, "secondary");
    this.generatedHintPresetButtonEl.title = "随机一个预设";
    this.generatedHintPresetButtonEl.setAttribute("aria-label", "随机一个预设");
    this.generatedHintPresetButtonEl.addEventListener("click", () => {
      this.logLocalEvent("swap_generated_preset");
      this.cycleGeneratedPreset();
    });

    this.saveGeneratedButtonEl = generatedControlsRow.createEl("button", {
      text: "♥ 保存",
    });
    this.styleCompactTransportButton(this.saveGeneratedButtonEl, "wide");
    this.saveGeneratedButtonEl.style.minWidth = "78px";
    this.saveGeneratedButtonEl.title = "保存为常用声音";
    this.saveGeneratedButtonEl.setAttribute("aria-label", "保存为常用声音");
    this.saveGeneratedButtonEl.addEventListener("click", () => {
      void this.saveGeneratedPreset();
    });

    const presetRow = this.createAuxActionRow(shell.bodyEl);
    GENERATED_PRESETS.forEach((preset) => {
      const buttonEl = presetRow.createEl("button", { text: preset.label });
      this.styleSecondaryButton(buttonEl);
      this.stylePresetButton(buttonEl, preset.id === this.generatedPreset);
      buttonEl.addEventListener("click", () => {
        this.generatedPreset = preset.id;
        this.lastSoundIntentSource = "preset";
        this.selectedGeneratedCustomPresetId = null;
        this.syncGeneratedPresetButtons();
        this.updateGeneratedPlayerUi(this.resolveGeneratedSoundSource());
        this.logLocalEvent(`generated_preset_${preset.id}`);
      });
      this.generatedPresetButtons.set(preset.id, buttonEl);
    });

    this.savedGeneratedPresets.forEach((preset) => {
      const presetId = preset.id ?? preset.name;
      const buttonEl = presetRow.createEl("button", {
        text: preset.name,
      });
      this.styleSecondaryButton(buttonEl);
      buttonEl.title = preset.name;
      const isSelected =
        this.selectedGeneratedCustomPresetId === presetId &&
        this.lastSoundIntentSource === "custom";
      this.stylePresetButton(buttonEl, isSelected);
      if (this.generatedDeleteMode) {
        buttonEl.style.border = "1px dashed rgba(184, 115, 115, 0.44)";
        buttonEl.style.background = "rgba(252, 242, 241, 0.96)";
        buttonEl.style.color = "#7c4d4d";
      }
      buttonEl.addEventListener("click", () => {
        if (this.generatedDeleteMode) {
          void this.deleteGeneratedPreset(preset);
          return;
        }
        this.selectedGeneratedCustomPresetId = presetId;
        this.generatedPreset =
          ((preset.resolvedPreset ?? preset.preset) as GeneratedPresetId) ?? "rain";
        if (this.generatedKeywordEl) {
          this.generatedKeywordInput = preset.keywordInput ?? "";
          this.generatedKeywordEl.value = this.generatedKeywordInput;
        }
        this.lastSoundIntentSource = "custom";
        this.syncGeneratedPresetButtons();
        this.updateGeneratedPlayerUi(this.resolveGeneratedSoundSource());
        this.logLocalEvent("generated_custom_preset");
      });
      this.generatedCustomPresetButtons.set(presetId, buttonEl);
    });

    const keywordRow = shell.bodyEl.createDiv();
    keywordRow.style.display = "flex";
    keywordRow.style.alignItems = "center";
    keywordRow.style.gap = "8px";
    keywordRow.style.flexWrap = "wrap";

    this.generatedKeywordEl = keywordRow.createEl("input");
    this.generatedKeywordEl.type = "text";
    this.generatedKeywordEl.placeholder = "也可以写一个词，比如：慢一点、空一点、像下雨";
    this.generatedKeywordEl.value = this.generatedKeywordInput;
    this.styleInput(this.generatedKeywordEl);
    this.generatedKeywordEl.style.flex = "1 1 220px";
    this.generatedKeywordEl.style.minWidth = "0";
    const syncGeneratedKeywordIntent = () => {
      this.generatedKeywordInput = this.generatedKeywordEl?.value ?? "";
      this.lastSoundIntentSource =
        this.generatedKeywordInput.trim().length > 0 ? "keyword" : "preset";
      if (this.lastSoundIntentSource === "keyword") {
        this.selectedGeneratedCustomPresetId = null;
      }
      this.updateGeneratedPlayerUi(this.resolveGeneratedSoundSource());
    };
    this.generatedKeywordEl.addEventListener("input", syncGeneratedKeywordIntent);
    this.generatedKeywordEl.addEventListener("change", syncGeneratedKeywordIntent);
    this.generatedKeywordEl.addEventListener("keyup", syncGeneratedKeywordIntent);

    if (this.savedGeneratedPresets.length > 0) {
      this.generatedDeleteModeButtonEl = keywordRow.createEl("button", {
        text: this.generatedDeleteMode ? "完成" : "🗑 删除",
      });
      this.styleCompactTransportButton(this.generatedDeleteModeButtonEl, "wide");
      this.generatedDeleteModeButtonEl.style.minWidth = "78px";
      this.generatedDeleteModeButtonEl.title = this.generatedDeleteMode
        ? "退出删除模式"
        : "进入删除模式";
      this.generatedDeleteModeButtonEl.setAttribute(
        "aria-label",
        this.generatedDeleteMode ? "退出删除模式" : "进入删除模式"
      );
      this.generatedDeleteModeButtonEl.addEventListener("click", () => {
        this.generatedDeleteMode = !this.generatedDeleteMode;
        this.renderActiveTab();
      });
    } else {
      this.generatedDeleteModeButtonEl = null;
      this.generatedDeleteMode = false;
    }

    this.generatedStatusEl = shell.bodyEl.createEl("p", {
      text: "",
    });
    this.generatedStatusEl.style.margin = "0";
    this.generatedStatusEl.style.fontSize = "13px";
    this.generatedStatusEl.style.lineHeight = "1.6";
    this.generatedStatusEl.style.color = "#6b7780";

    this.syncGeneratedPresetButtons();
    this.syncGeneratedUi();
  }

  private renderOnlineRadioTab(): void {
    const urls = this.getTrustedOnlineUrls();
    const enabled = !!this.options.enableOnlineSound;

    this.onlineStatusEl = this.bodyEl.createEl("p");
    this.onlineStatusEl.style.margin = "0";
    this.onlineStatusEl.style.fontSize = "14px";
    this.onlineStatusEl.style.lineHeight = "1.7";
    this.onlineStatusEl.style.color = "#5d6973";

    if (!enabled || urls.length === 0) {
      this.onlineStatusEl.setText(
        "随机在线声音默认关闭。你可以添加自己信任的声音来源，MoodNest 不会默认连接外部音乐。"
      );

      const auxRow = this.createAuxActionRow(this.bodyEl);
      const settingsButton = auxRow.createEl("button", { text: "打开设置" });
      this.styleSecondaryButton(settingsButton);
      settingsButton.addEventListener("click", () => {
        this.logLocalEvent("open_settings_online");
        void this.options.onOpenSettings?.();
      });
      return;
    }

    this.onlineStatusEl.setText("之后只会从你自己允许的来源里随机，不会默认访问外部声音。");
    this.onlineSummaryEl = this.bodyEl.createEl("p", {
      text: `已添加 ${urls.length} 个在线声音来源。`,
    });
    this.onlineSummaryEl.style.margin = "0";
    this.onlineSummaryEl.style.fontSize = "13px";
    this.onlineSummaryEl.style.lineHeight = "1.6";
    this.onlineSummaryEl.style.color = "#6b7780";

    const auxRow = this.createAuxActionRow(this.bodyEl);
    this.onlineRandomButtonEl = auxRow.createEl("button", { text: "🎲" });
    this.styleCompactTransportButton(this.onlineRandomButtonEl, "secondary");
    this.onlineRandomButtonEl.title = "随机一个来源";
    this.onlineRandomButtonEl.setAttribute("aria-label", "随机一个来源");
    this.onlineRandomButtonEl.addEventListener("click", () => {
      this.logLocalEvent("online_random");
      this.pickRandomOnlineUrl();
    });

    this.onlinePlayButtonEl = auxRow.createEl("button", { text: "▶" });
    this.styleCompactTransportButton(this.onlinePlayButtonEl, "primary");
    this.onlinePlayButtonEl.title = "播放";
    this.onlinePlayButtonEl.setAttribute("aria-label", "播放或暂停");
    this.onlinePlayButtonEl.addEventListener("click", () => {
      void this.playOnlineSound();
    });
    if (!this.selectedOnlineUrl) {
      this.pickRandomOnlineUrl();
    }
    this.syncOnlineUi();
  }

  private stylePresetButton(
    buttonEl: HTMLButtonElement,
    selected: boolean
  ): void {
    buttonEl.className = "moodnest-sound-chip";
    buttonEl.style.height = "36px";
    buttonEl.style.padding = "0 12px";
    buttonEl.style.borderRadius = "999px";
    buttonEl.style.fontSize = "14px";
    buttonEl.style.fontWeight = "500";
    buttonEl.style.whiteSpace = "nowrap";
    buttonEl.style.maxWidth = "100%";
    buttonEl.style.border = selected
      ? "1px solid rgba(76, 107, 95, 0.36)"
      : "1px solid rgba(118, 128, 145, 0.12)";
    buttonEl.style.background = selected
      ? "rgba(220, 232, 227, 0.96)"
      : "rgba(255,255,255,0.92)";
    buttonEl.style.color = "#23303a";
    buttonEl.style.boxShadow = selected
      ? "0 4px 12px rgba(92, 120, 108, 0.08)"
      : "none";
  }

  private syncGeneratedPresetButtons(): void {
    this.generatedPresetButtons.forEach((buttonEl, presetId) => {
      this.stylePresetButton(
        buttonEl,
        this.lastSoundIntentSource !== "custom" && presetId === this.generatedPreset
      );
    });
    this.generatedCustomPresetButtons.forEach((buttonEl, presetId) => {
      this.stylePresetButton(
        buttonEl,
        this.lastSoundIntentSource === "custom" &&
          this.selectedGeneratedCustomPresetId === presetId
      );
    });
  }

  private syncGeneratedUi(): void {
    if (this.generateButtonEl) {
      this.generateButtonEl.disabled = false;
      this.generateButtonEl.setText(this.generatedIsPlaying ? "⏸" : "▶ 生成");
      this.generateButtonEl.title = this.generatedIsPlaying ? "停止生成声音" : "生成 30 秒";
      this.generateButtonEl.setAttribute(
        "aria-label",
        this.generatedIsPlaying ? "停止生成声音" : "生成 30 秒"
      );
    }
    if (this.generatedHintPresetButtonEl) {
      this.generatedHintPresetButtonEl.disabled = this.generatedIsPlaying;
    }
    if (this.saveGeneratedButtonEl) {
      this.saveGeneratedButtonEl.disabled = false;
    }
    this.updateGeneratedPlayerUi();
  }

  private async ensureAudioContext(): Promise<AudioContext | null> {
    const AnyWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = window.AudioContext ?? AnyWindow.webkitAudioContext;
    if (!Ctx) {
      return null;
    }

    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new Ctx();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  private async generateSound(): Promise<void> {
    this.logLocalEvent("generate_sound");
    const ctx = await this.ensureAudioContext();
    if (!ctx) {
      this.generatedStatusEl?.setText(
        "这个设备暂时不能生成声音，可以先用身边声音。"
      );
      return;
    }

    await this.stopGeneratedSound(false);

    const startAt = ctx.currentTime + 0.02;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 18;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.22;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(limiter);
    limiter.connect(ctx.destination);

    this.generatedCleanupFns = [
      () => masterGain.disconnect(),
      () => limiter.disconnect(),
    ];

    const resolvedPreset = this.resolveGeneratedSoundSource();
    const activePresetId = resolvedPreset.presetId;
    const resolvedPresetLabel = this.getGeneratedPresetLogLabel(activePresetId);
    const intentDetail = `displayLabel=${resolvedPreset.displayLabel} seed=${resolvedPreset.seed}`;
    const random = this.createSeededRandom(resolvedPreset.seed);
    console.debug(
      `[MoodNest generated sound] intentSource=${resolvedPreset.intentSource} ${intentDetail} resolvedPreset=${resolvedPresetLabel}`
    );

    if (activePresetId === "rain") {
      this.attachNoiseLayer(
        ctx,
        masterGain,
        0.14 + random() * 0.08,
        1400 + random() * 900,
        "lowpass",
        0.05 + random() * 0.1,
        startAt,
        {
          seed: resolvedPreset.seed + 11,
          color: "brown",
          filterQ: 0.8 + random() * 1.1,
          panRate: 0.018 + random() * 0.015,
          panDepth: 0.08 + random() * 0.08,
        }
      );
      this.attachNoiseLayer(
        ctx,
        masterGain,
        0.04 + random() * 0.05,
        3600 + random() * 1800,
        "highpass",
        0,
        startAt,
        {
          seed: resolvedPreset.seed + 29,
          color: "white",
          filterQ: 0.4 + random(),
          panRate: 0.04 + random() * 0.03,
          panDepth: 0.05 + random() * 0.07,
        }
      );
      this.attachBurstPattern(
        ctx,
        masterGain,
        [720 + random() * 180, 1080 + random() * 220],
        "sine",
        0.018 + random() * 0.01,
        0.16 + random() * 0.06,
        0.65 + random() * 0.24,
        startAt + random() * 0.12,
        {
          seed: resolvedPreset.seed + 47,
          stepJitter: 0.08,
          detuneSpread: 10,
          panSpread: 0.16 + random() * 0.14,
        }
      );
    } else if (activePresetId === "ocean") {
      this.attachNoiseLayer(
        ctx,
        masterGain,
        0.14 + random() * 0.08,
        700 + random() * 500,
        "lowpass",
        0.1 + random() * 0.12,
        startAt,
        {
          seed: resolvedPreset.seed + 61,
          color: "brown",
          filterQ: 0.6 + random() * 0.8,
        }
      );
      this.attachOscillatorLayer(
        ctx,
        masterGain,
        146 + random() * 38,
        random() > 0.45 ? "sine" : "triangle",
        0.03 + random() * 0.02,
        0.04 + random() * 0.04,
        startAt,
        {
          attackSeconds: 0.6,
          lfoDepth: 0.015 + random() * 0.02,
          filterType: "lowpass",
          filterFrequency: 360 + random() * 220,
          filterQ: 0.4 + random() * 0.5,
          panRate: 0.02 + random() * 0.03,
          panDepth: 0.12 + random() * 0.08,
        }
      );
    } else if (activePresetId === "forest") {
      this.attachNoiseLayer(
        ctx,
        masterGain,
        0.08 + random() * 0.04,
        1200 + random() * 900,
        "bandpass",
        0.2 + random() * 0.18,
        startAt,
        {
          seed: resolvedPreset.seed + 79,
          color: "pink",
          filterQ: 1.2 + random() * 1.4,
          panRate: 0.03 + random() * 0.03,
          panDepth: 0.16 + random() * 0.12,
        }
      );
      this.attachBurstPattern(
        ctx,
        masterGain,
        [880 + random() * 220, 1180 + random() * 240, 1560 + random() * 180],
        "sine",
        0.015 + random() * 0.01,
        0.22 + random() * 0.08,
        1.6 + random() * 0.5,
        startAt + random() * 0.2,
        {
          seed: resolvedPreset.seed + 97,
          stepJitter: 0.24,
          detuneSpread: 16,
          panSpread: 0.4,
        }
      );
      this.attachOscillatorLayer(
        ctx,
        masterGain,
        210 + random() * 70,
        "triangle",
        0.018 + random() * 0.014,
        0.06 + random() * 0.05,
        startAt,
        {
          attackSeconds: 0.8,
          lfoDepth: 0.012 + random() * 0.012,
          filterType: "bandpass",
          filterFrequency: 680 + random() * 260,
          filterQ: 0.8 + random() * 0.8,
          panRate: 0.04 + random() * 0.04,
          panDepth: 0.22 + random() * 0.12,
        }
      );
    } else if (activePresetId === "ethereal") {
      this.attachOscillatorLayer(
        ctx,
        masterGain,
        220 + random() * 60,
        random() > 0.5 ? "sine" : "triangle",
        0.04 + random() * 0.02,
        0.04 + random() * 0.04,
        startAt,
        {
          attackSeconds: 0.9,
          lfoDepth: 0.02 + random() * 0.02,
          filterType: "lowpass",
          filterFrequency: 1100 + random() * 900,
          filterQ: 0.4 + random() * 0.4,
          panRate: 0.03 + random() * 0.03,
          panDepth: 0.18 + random() * 0.1,
        }
      );
      this.attachOscillatorLayer(
        ctx,
        masterGain,
        330 + random() * 120,
        random() > 0.5 ? "triangle" : "sine",
        0.024 + random() * 0.02,
        0.06 + random() * 0.04,
        startAt + 0.04,
        {
          attackSeconds: 1.1,
          lfoDepth: 0.014 + random() * 0.016,
          filterType: "lowpass",
          filterFrequency: 1400 + random() * 1000,
          filterQ: 0.3 + random() * 0.5,
          panRate: 0.02 + random() * 0.02,
          panDepth: 0.12 + random() * 0.08,
        }
      );
    } else if (activePresetId === "white_noise") {
      this.attachNoiseLayer(
        ctx,
        masterGain,
        0.18 + random() * 0.06,
        1800 + random() * 1200,
        "highpass",
        0,
        startAt,
        {
          seed: resolvedPreset.seed + 113,
          color: "white",
          filterQ: 0.5 + random() * 0.5,
          panRate: 0.03 + random() * 0.04,
          panDepth: 0.08 + random() * 0.06,
        }
      );
    } else if (activePresetId === "pluck") {
      this.attachBurstPattern(
        ctx,
        masterGain,
        [
          160 + random() * 80,
          240 + random() * 80,
          300 + random() * 110,
          380 + random() * 120,
        ],
        random() > 0.55 ? "triangle" : "sine",
        0.045 + random() * 0.02,
        0.28 + random() * 0.18,
        0.62 + random() * 0.35,
        startAt,
        {
          seed: resolvedPreset.seed + 131,
          stepJitter: 0.09,
          detuneSpread: 14,
          panSpread: 0.24 + random() * 0.18,
        }
      );
      this.attachBurstPattern(
        ctx,
        masterGain,
        [280 + random() * 100, 390 + random() * 80, 470 + random() * 90],
        "sine",
        0.016 + random() * 0.014,
        0.2 + random() * 0.14,
        1.1 + random() * 0.5,
        startAt + 0.12 + random() * 0.12,
        {
          seed: resolvedPreset.seed + 149,
          stepJitter: 0.12,
          detuneSpread: 12,
          panSpread: 0.2 + random() * 0.16,
        }
      );
    } else if (activePresetId === "soft_bell") {
      this.attachBurstPattern(
        ctx,
        masterGain,
        [240 + random() * 90, 320 + random() * 100, 396 + random() * 110],
        "sine",
        0.045 + random() * 0.02,
        0.9 + random() * 0.6,
        1.8 + random() * 0.8,
        startAt,
        {
          seed: resolvedPreset.seed + 167,
          stepJitter: 0.16,
          detuneSpread: 8,
          panSpread: 0.22 + random() * 0.18,
        }
      );
      this.attachBurstPattern(
        ctx,
        masterGain,
        [500 + random() * 80, 620 + random() * 100],
        "triangle",
        0.02 + random() * 0.014,
        1.4 + random() * 0.9,
        3.0 + random() * 0.9,
        startAt + 0.18 + random() * 0.14,
        {
          seed: resolvedPreset.seed + 181,
          stepJitter: 0.18,
          detuneSpread: 6,
          panSpread: 0.18 + random() * 0.16,
        }
      );
    } else {
      this.attachOscillatorLayer(
        ctx,
        masterGain,
        176 + random() * 40,
        random() > 0.4 ? "triangle" : "sine",
        0.03 + random() * 0.018,
        0.04 + random() * 0.03,
        startAt,
        {
          attackSeconds: 0.7,
          lfoDepth: 0.016 + random() * 0.014,
          filterType: "lowpass",
          filterFrequency: 520 + random() * 260,
          filterQ: 0.4 + random() * 0.4,
          panRate: 0.02 + random() * 0.02,
          panDepth: 0.12 + random() * 0.08,
        }
      );
      this.attachOscillatorLayer(
        ctx,
        masterGain,
        260 + random() * 90,
        "sine",
        0.018 + random() * 0.014,
        0.05 + random() * 0.03,
        startAt + 0.02,
        {
          attackSeconds: 0.9,
          lfoDepth: 0.01 + random() * 0.01,
          filterType: "lowpass",
          filterFrequency: 760 + random() * 320,
          filterQ: 0.3 + random() * 0.4,
          panRate: 0.024 + random() * 0.02,
          panDepth: 0.1 + random() * 0.08,
        }
      );
      this.attachNoiseLayer(
        ctx,
        masterGain,
        0.05 + random() * 0.03,
        900 + random() * 500,
        "lowpass",
        0,
        startAt,
        {
          seed: resolvedPreset.seed + 197,
          color: "pink",
          filterQ: 0.5 + random() * 0.4,
          panRate: 0.02 + random() * 0.02,
          panDepth: 0.06 + random() * 0.05,
        }
      );
    }

    this.generatedIsPlaying = true;
    this.generatedStartedAt = startAt;
    this.refreshPlayerCover(true);
    this.generatedStatusEl?.setText(this.buildGeneratedStatus(resolvedPreset));
    this.startGeneratedProgressTimer(resolvedPreset);
    this.syncGeneratedUi();

    this.generatedStopTimer = window.setTimeout(() => {
      void this.stopGeneratedSound();
    }, this.generatedDuration * 1000);
  }

  private attachOscillatorLayer(
    ctx: AudioContext,
    destination: AudioNode,
    frequency: number,
    type: OscillatorType,
    gainValue: number,
    lfoRate = 0.05,
    startAt = ctx.currentTime,
    options?: {
      attackSeconds?: number;
      lfoDepth?: number;
      filterType?: BiquadFilterType;
      filterFrequency?: number;
      filterQ?: number;
      panRate?: number;
      panDepth?: number;
    }
  ): void {
    const boostedGain = Math.min(0.18, gainValue * 1.3);
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;

    const filter = ctx.createBiquadFilter();
    filter.type = options?.filterType ?? "lowpass";
    filter.frequency.value = options?.filterFrequency ?? Math.max(420, frequency * 4);
    filter.Q.value = options?.filterQ ?? 0.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      boostedGain,
      startAt + (options?.attackSeconds ?? 0.3)
    );

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = lfoRate;
    lfoGain.gain.value = options?.lfoDepth ?? boostedGain * 0.45;

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    const panner = ctx.createStereoPanner();
    let panLfo: OscillatorNode | null = null;
    let panLfoGain: GainNode | null = null;
    if ((options?.panDepth ?? 0) > 0) {
      panLfo = ctx.createOscillator();
      panLfoGain = ctx.createGain();
      panLfo.frequency.value = options?.panRate ?? Math.max(0.02, lfoRate * 0.5);
      panLfoGain.gain.value = Math.min(1, options?.panDepth ?? 0.18);
      panLfo.connect(panLfoGain);
      panLfoGain.connect(panner.pan);
    }

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(destination);

    oscillator.start(startAt);
    lfo.start(startAt);
    panLfo?.start(startAt);

    this.generatedCleanupFns.push(() => {
      oscillator.stop();
      lfo.stop();
      panLfo?.stop();
      oscillator.disconnect();
      filter.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      gain.disconnect();
      panLfo?.disconnect();
      panLfoGain?.disconnect();
      panner.disconnect();
    });
  }

  private attachNoiseLayer(
    ctx: AudioContext,
    destination: AudioNode,
    gainValue: number,
    filterFrequency: number,
    filterType: BiquadFilterType,
    wobbleRate = 0,
    startAt = ctx.currentTime,
    options?: {
      seed?: number;
      attackSeconds?: number;
      filterQ?: number;
      color?: "white" | "pink" | "brown";
      panRate?: number;
      panDepth?: number;
    }
  ): void {
    const boostedGain = Math.min(0.34, gainValue * 1.28);
    const bufferDuration = Math.max(2, Math.min(4, this.generatedDuration));
    const buffer = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * bufferDuration),
      ctx.sampleRate
    );
    const data = buffer.getChannelData(0);
    const random = this.createSeededRandom(
      options?.seed ?? this.createDeterministicSeed(`${filterType}:${filterFrequency}`)
    );
    let brown = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = random() * 2 - 1;
      if (options?.color === "brown") {
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = brown * 3.2;
      } else if (options?.color === "pink") {
        const slow = (random() * 2 - 1) * 0.35;
        data[i] = white * 0.7 + slow;
      } else {
        data[i] = white;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFrequency;
    filter.Q.value = options?.filterQ ?? 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      boostedGain,
      startAt + (options?.attackSeconds ?? 0.4)
    );

    source.connect(filter);
    filter.connect(gain);
    const panner = ctx.createStereoPanner();
    gain.connect(panner);
    panner.connect(destination);

    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (wobbleRate > 0) {
      lfo = ctx.createOscillator();
      lfoGain = ctx.createGain();
      lfo.frequency.value = wobbleRate;
      lfoGain.gain.value = 240;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(startAt);
    }

    let panLfo: OscillatorNode | null = null;
    let panLfoGain: GainNode | null = null;
    if ((options?.panDepth ?? 0) > 0) {
      panLfo = ctx.createOscillator();
      panLfoGain = ctx.createGain();
      panLfo.frequency.value = options?.panRate ?? 0.03;
      panLfoGain.gain.value = Math.min(1, options?.panDepth ?? 0.18);
      panLfo.connect(panLfoGain);
      panLfoGain.connect(panner.pan);
      panLfo.start(startAt);
    }

    source.start(startAt);

    this.generatedCleanupFns.push(() => {
      source.stop();
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      lfo?.stop();
      lfo?.disconnect();
      lfoGain?.disconnect();
      panLfo?.stop();
      panLfo?.disconnect();
      panLfoGain?.disconnect();
      panner.disconnect();
    });
  }

  private attachBurstPattern(
    ctx: AudioContext,
    destination: AudioNode,
    frequencies: number[],
    type: OscillatorType,
    peakGain: number,
    burstDuration: number,
    interval: number,
    startAt: number,
    options?: {
      seed?: number;
      stepJitter?: number;
      detuneSpread?: number;
      panSpread?: number;
    }
  ): void {
    const steps = Math.max(1, Math.floor(this.generatedDuration / interval));
    const boostedPeak = Math.min(0.16, peakGain * 1.35);
    const random = this.createSeededRandom(
      options?.seed ?? this.createDeterministicSeed(`${type}:${frequencies.join(",")}`)
    );

    for (let step = 0; step < steps; step += 1) {
      const burstTime =
        startAt +
        step * interval +
        (random() - 0.5) * (options?.stepJitter ?? 0);
      frequencies.forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = frequency * (0.98 + random() * 0.04);
        oscillator.detune.value =
          index * 4 + (random() - 0.5) * (options?.detuneSpread ?? 0);

        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner();
        const entryTime = burstTime + index * 0.04;
        const exitTime = entryTime + burstDuration;
        gain.gain.setValueAtTime(0.0001, entryTime);
        gain.gain.linearRampToValueAtTime(boostedPeak, entryTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, exitTime);
        panner.pan.value = (random() - 0.5) * 2 * (options?.panSpread ?? 0.2);

        oscillator.connect(gain);
        gain.connect(panner);
        panner.connect(destination);

        oscillator.start(entryTime);
        oscillator.stop(exitTime);

        this.generatedCleanupFns.push(() => {
          oscillator.disconnect();
          gain.disconnect();
          panner.disconnect();
        });
      });
    }
  }

  private async stopGeneratedSound(log = true): Promise<void> {
    if (log) {
      this.logLocalEvent("stop_generated_sound");
    }

    if (this.generatedTickTimer !== null) {
      window.clearInterval(this.generatedTickTimer);
      this.generatedTickTimer = null;
    }

    if (this.generatedStopTimer !== null) {
      window.clearTimeout(this.generatedStopTimer);
      this.generatedStopTimer = null;
    }

    this.generatedCleanupFns.forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        // ignore local audio cleanup failures
      }
    });
    this.generatedCleanupFns = [];
    this.generatedIsPlaying = false;
    this.generatedStartedAt = 0;
    this.generatedStatusEl?.setText("已经停下来了。可以换个预设，或者先这样就够。");
    this.updateGeneratedPlayerUi();
    this.syncGeneratedUi();
  }

  private getGeneratedKeywords(): string[] {
    return this.generatedKeywordInput
      .split(/[,\s，]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private async saveGeneratedPreset(): Promise<void> {
    this.logLocalEvent("save_generated_preset");
    const resolvedPreset = this.resolveGeneratedSoundSource();
    const keywordInput = this.generatedKeywordInput.trim();
    const presetName = this.buildSavedGeneratedPresetName(
      this.sanitizeGeneratedPresetLabel(resolvedPreset.displayLabel)
    );
    const record: GeneratedSoundPreset = {
      id: `generated-${Date.now()}`,
      name: presetName,
      keywordInput: keywordInput || undefined,
      createdAt: new Date().toISOString(),
      preset: this.generatedPreset,
      resolvedPreset: resolvedPreset.presetId,
      displayLabel: resolvedPreset.displayLabel,
      helperText: undefined,
      seed: resolvedPreset.seed,
      keywords: this.getGeneratedKeywords(),
      duration: this.generatedDuration,
    };

    await this.options.onSaveGeneratedPreset?.(record);
    this.savedGeneratedPresets = [
      ...this.savedGeneratedPresets.filter((item) => item.id !== record.id),
      record,
    ];
    this.activeTabId = "generated_sound";
    this.selectedGeneratedCustomPresetId = record.id ?? record.name;
    this.lastSoundIntentSource = "custom";
    this.generatedKeywordInput = record.keywordInput ?? this.generatedKeywordInput;
    this.generatedStatusEl?.setText("已经记成一个常用声音了。");
    this.renderActiveTab();
  }

  private async deleteGeneratedPreset(preset: GeneratedSoundPreset): Promise<void> {
    this.logLocalEvent("delete_generated_preset");
    await this.options.onDeleteGeneratedPreset?.(preset);

    const presetId = preset.id ?? preset.name;
    this.savedGeneratedPresets = this.savedGeneratedPresets.filter((item) => {
      const itemId = item.id ?? item.name;
      return itemId !== presetId;
    });
    if (this.savedGeneratedPresets.length === 0) {
      this.generatedDeleteMode = false;
    }

    if (this.selectedGeneratedCustomPresetId === presetId) {
      this.selectedGeneratedCustomPresetId = null;
      this.lastSoundIntentSource = "preset";
    }

    this.activeTabId = "generated_sound";
    this.generatedStatusEl?.setText("已经从常用声音里移走了。");
    this.renderActiveTab();
  }

  private cycleGeneratedPreset(): void {
    const presetOrder = GENERATED_PRESETS.map((preset) => preset.id).filter(
      (presetId): presetId is Exclude<GeneratedPresetId, "pluck" | "soft_bell"> =>
        presetId !== "pluck" && presetId !== "soft_bell"
    );
    const currentIndex = presetOrder.findIndex(
      (presetId) => presetId === this.generatedPreset
    );
    const next = presetOrder[(currentIndex + 1) % presetOrder.length] ?? presetOrder[0];
    if (!next) {
      return;
    }

    this.generatedPreset = next;
    this.lastSoundIntentSource = "preset";
    this.selectedGeneratedCustomPresetId = null;
    this.syncGeneratedPresetButtons();
    this.updateGeneratedPlayerUi(this.resolveGeneratedSoundSource());
  }

  private resolveKeywordPreset(keywordOverride?: string): KeywordResolvedPreset {
    const keywords = keywordOverride
      ? keywordOverride
          .split(/[,\s，]+/)
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : this.getGeneratedKeywords();
    for (const keyword of keywords) {
      const match = KEYWORD_PRESET_RULES.find((rule) =>
        rule.terms.some((term) => keyword.includes(term))
      );
      if (match) {
        return {
          presetId: match.presetId,
          matchedKeyword: keyword,
        };
      }
    }

    return {
      presetId: this.generatedPreset,
      matchedKeyword: null,
    };
  }

  private resolveGeneratedSoundSource(): GeneratedSoundSourceResolution {
    const keywordText = this.generatedKeywordInput.trim();
    if (
      this.lastSoundIntentSource === "custom" &&
      this.selectedGeneratedCustomPresetId
    ) {
      const preset =
        this.savedGeneratedPresets.find(
          (item) => (item.id ?? item.name) === this.selectedGeneratedCustomPresetId
        ) ?? null;
      if (preset) {
        const resolvedPresetId = this.normalizeGeneratedPresetId(
          preset.resolvedPreset ?? preset.preset
        );
        const displayLabel = this.sanitizeGeneratedPresetLabel(
          preset.displayLabel ?? preset.name
        );
        return {
          presetId: resolvedPresetId,
          matchedKeyword: preset.keywordInput?.trim() || null,
          intentSource: "custom",
          displayLabel,
          helperText: "",
          seed:
            preset.seed ??
            this.createDeterministicSeed(
              `${resolvedPresetId}:${preset.keywordInput ?? displayLabel}`
            ),
          customPresetId: this.selectedGeneratedCustomPresetId,
        };
      }
    }

    if (this.lastSoundIntentSource === "keyword" && keywordText.length > 0) {
      const resolved = this.resolveKeywordPreset(keywordText);
      return {
        ...resolved,
        intentSource: "keyword",
        displayLabel: this.sanitizeGeneratedPresetLabel(keywordText),
        helperText: this.getGeneratedHelperText(resolved.presetId, keywordText),
        seed: this.createDeterministicSeed(`${resolved.presetId}:${keywordText}`),
      };
    }

    return {
      presetId: this.generatedPreset,
      matchedKeyword: null,
      intentSource: "preset",
      displayLabel: this.getGeneratedPresetDisplayLabel(this.generatedPreset),
      helperText: this.getGeneratedHelperText(this.generatedPreset),
      seed: this.createDeterministicSeed(
        `${this.generatedPreset}:${this.getGeneratedPresetDisplayLabel(this.generatedPreset)}`
      ),
    };
  }

  private getGeneratedPresetDisplayLabel(presetId: GeneratedPresetId): string {
    return (
      GENERATED_PRESETS.find((preset) => preset.id === presetId)?.label ??
      "本地氛围声"
    );
  }

  private getGeneratedSourceLabel(
    resolvedPreset: GeneratedSoundSourceResolution
  ): string {
    return `当前：${resolvedPreset.displayLabel}`;
  }

  private buildGeneratedIdleStatus(
    resolvedPreset: GeneratedSoundSourceResolution
  ): string {
    return resolvedPreset.helperText ?? "";
  }

  private buildGeneratedStatus(
    resolvedPreset: GeneratedSoundSourceResolution
  ): string {
    return resolvedPreset.helperText ?? "正在播放生成声音……";
  }

  private getGeneratedDisplayTitle(
    resolvedPreset: GeneratedSoundSourceResolution
  ): string {
    if (
      resolvedPreset.intentSource === "keyword" ||
      resolvedPreset.intentSource === "custom"
    ) {
      return resolvedPreset.displayLabel;
    }

    const label = this.getGeneratedPresetDisplayLabel(resolvedPreset.presetId);
    return `${label}氛围声`;
  }

  private updateGeneratedPlayerUi(
    resolvedPreset?: GeneratedSoundSourceResolution
  ): void {
    const effectivePreset = resolvedPreset ?? this.resolveGeneratedSoundSource();
    this.generatedPlayerLabelEl?.setText("生成声音");
    this.generatedPlayerTitleEl?.setText(this.getGeneratedDisplayTitle(effectivePreset));

    if (this.generatedPlayerStatusEl) {
      this.generatedPlayerStatusEl.setText(
        this.generatedIsPlaying
          ? this.buildGeneratedStatus(effectivePreset)
          : this.buildGeneratedIdleStatus(effectivePreset)
      );
    }

    if (this.generatedStatusEl) {
      this.generatedStatusEl.setText(
        this.getGeneratedSourceLabel(effectivePreset)
      );
    }

    if (this.generatedProgressEl && this.generatedTimeEl) {
      if (!this.generatedIsPlaying || this.generatedStartedAt <= 0) {
        this.generatedProgressEl.value = "0";
        this.generatedTimeEl.setText(`0:00 / ${this.formatTime(this.generatedDuration)}`);
      } else if (this.audioContext) {
        const elapsed = Math.max(0, this.audioContext.currentTime - this.generatedStartedAt);
        const current = Math.min(this.generatedDuration, elapsed);
        const value =
          this.generatedDuration > 0
            ? Math.round((current / this.generatedDuration) * 1000)
            : 0;
        this.generatedProgressEl.value = String(value);
        this.generatedTimeEl.setText(
          `${this.formatTime(current)} / ${this.formatTime(this.generatedDuration)}`
        );
      }
    }
  }

  private startGeneratedProgressTimer(
    resolvedPreset: GeneratedSoundSourceResolution
  ): void {
    if (this.generatedTickTimer !== null) {
      window.clearInterval(this.generatedTickTimer);
      this.generatedTickTimer = null;
    }

    this.updateGeneratedPlayerUi(resolvedPreset);
    this.generatedTickTimer = window.setInterval(() => {
      this.updateGeneratedPlayerUi(resolvedPreset);
    }, 250);
  }

  private getGeneratedPresetLabel(): string {
    return this.getGeneratedPresetDisplayLabel(this.generatedPreset);
  }

  private sanitizeGeneratedPresetLabel(input: string): string {
    const cleaned = input
      .replace(/^(关键词[:：]\s*|当前[:：]\s*|keyword:\s*|生成[:：]\s*)+/i, "")
      .trim();
    const fallback = cleaned || this.getGeneratedPresetDisplayLabel(this.generatedPreset);
    const maxLength = /[\u3400-\u9fff]/.test(fallback) ? 12 : 24;
    return fallback.slice(0, maxLength).trim();
  }

  private normalizeGeneratedPresetId(value: string): GeneratedPresetId {
    if (value === "wave") {
      return "ocean";
    }
    if (value === "airy") {
      return "ethereal";
    }
    if (
      value === "rain" ||
      value === "ocean" ||
      value === "forest" ||
      value === "ethereal" ||
      value === "white_noise" ||
      value === "warm" ||
      value === "pluck" ||
      value === "soft_bell"
    ) {
      return value;
    }
    return "rain";
  }

  private createDeterministicSeed(input: string): number {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private createSeededRandom(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  private getGeneratedHelperText(
    presetId: GeneratedPresetId,
    keywordText?: string
  ): string {
    void presetId;
    void keywordText;
    return "";
  }

  private buildSavedGeneratedPresetName(baseLabel: string): string {
    const existing = new Set(this.savedGeneratedPresets.map((item) => item.name));
    if (!existing.has(baseLabel)) {
      return baseLabel;
    }

    let suffix = 2;
    while (existing.has(`${baseLabel} ${suffix}`)) {
      suffix += 1;
    }
    return `${baseLabel} ${suffix}`;
  }

  private getGeneratedPresetLogLabel(presetId: GeneratedPresetId): string {
    switch (presetId) {
      case "ocean":
        return "wave";
      case "ethereal":
        return "airy";
      default:
        return presetId;
    }
  }

  private getTrustedOnlineUrls(): string[] {
    return (this.options.trustedOnlineSoundUrls ?? []).filter(
      (url) => typeof url === "string" && url.trim().length > 0
    );
  }

  private pickRandomOnlineUrl(): void {
    const urls = this.getTrustedOnlineUrls();
    if (urls.length === 0) {
      this.selectedOnlineUrl = null;
      this.currentOnlineAudioUrl = null;
      this.syncOnlineUi();
      return;
    }

    const pool = urls.filter((url) => url !== this.selectedOnlineUrl);
    const candidates = pool.length > 0 ? pool : urls;
    this.selectedOnlineUrl =
      candidates[Math.floor(Math.random() * candidates.length)] ?? urls[0] ?? null;
    this.syncOnlineUi();
  }

  private async playOnlineSound(): Promise<void> {
    this.logLocalEvent("online_play");
    if (!this.selectedOnlineUrl) {
      this.onlineStatusEl?.setText("还没有可播放的在线声音来源。");
      return;
    }

    if (!this.onlineAudioEl) {
      this.onlineAudioEl = new Audio();
      this.onlineAudioEl.volume = this.getMusicVolume();
      this.onlineAudioEl.addEventListener("play", () => this.syncOnlineUi());
      this.onlineAudioEl.addEventListener("pause", () => this.syncOnlineUi());
      this.onlineAudioEl.addEventListener("ended", () => this.syncOnlineUi());
      this.onlineAudioEl.addEventListener("error", () => {
        this.onlineStatusEl?.setText("这个链接暂时不能播放，可以换一个。");
        this.syncOnlineUi();
      });
    }

    try {
      const sameUrl = this.currentOnlineAudioUrl === this.selectedOnlineUrl;
      if (sameUrl && !this.onlineAudioEl.paused) {
        this.onlineAudioEl.pause();
        this.onlineStatusEl?.setText("先停在这里也可以。");
        this.syncOnlineUi();
        return;
      }

      this.onlineIsLoading = true;
      this.syncOnlineUi();
      if (!sameUrl) {
        this.onlineAudioEl.pause();
        this.onlineAudioEl.currentTime = 0;
        this.onlineAudioEl.src = this.selectedOnlineUrl;
        this.currentOnlineAudioUrl = this.selectedOnlineUrl;
      }
      this.onlineAudioEl.volume = this.getMusicVolume();
      await this.onlineAudioEl.play();
      this.onlineStatusEl?.setText("正在播放你允许的在线声音来源。");
      this.syncOnlineUi();
    } catch {
      this.onlineStatusEl?.setText("这个链接暂时不能播放，可以换一个。");
      this.syncOnlineUi();
    } finally {
      this.onlineIsLoading = false;
      this.syncOnlineUi();
    }
  }

  private stopOnlinePlayback(): void {
    if (!this.onlineAudioEl) {
      this.syncOnlineUi();
      return;
    }

    this.onlineAudioEl.pause();
    this.onlineAudioEl.currentTime = 0;
    this.onlineStatusEl?.setText("先停在这里也可以。");
    this.syncOnlineUi();
  }

  private syncOnlineUi(): void {
    const hasUrls = this.getTrustedOnlineUrls().length > 0;
    const isPlaying = !!this.onlineAudioEl && !this.onlineAudioEl.paused;

    this.onlineRandomButtonEl && (this.onlineRandomButtonEl.disabled = !hasUrls);
    this.onlinePlayButtonEl &&
      (this.onlinePlayButtonEl.disabled = !hasUrls || this.onlineIsLoading);
    if (this.onlineSummaryEl) {
      this.onlineSummaryEl.setText(
        this.selectedOnlineUrl
          ? `当前来源：${this.selectedOnlineUrl}`
          : `已添加 ${this.getTrustedOnlineUrls().length} 个在线声音来源。`
      );
    }

    if (this.onlinePlayButtonEl) {
      this.onlinePlayButtonEl.setText(
        this.onlineIsLoading ? "…" : isPlaying ? "⏸" : "▶"
      );
      this.onlinePlayButtonEl.title = this.onlineIsLoading
        ? "加载中"
        : isPlaying
          ? "暂停"
          : "播放";
    }
  }

  private getActiveValues(): string[] {
    if (this.activeTabId === "my_music") {
      return (this.musicTextareaEl?.value ?? "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }

    return this.surroundingInputEls
      .map((inputEl) => inputEl.value.trim())
      .filter((value) => value.length > 0);
  }

  private handleSurroundingEnterKey(event: KeyboardEvent, index: number): void {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (index < this.surroundingInputEls.length - 1) {
      this.surroundingInputEls[index + 1]?.focus();
      return;
    }

    if (this.getActiveValues().length > 0) {
      this.submit();
    }
  }

  private fillSurroundingHint(): void {
    const pool = GROUNDING_LISTEN_HINTS.filter(
      (item) => !this.getActiveValues().includes(item)
    );
    const candidates = pool.length > 0 ? pool : GROUNDING_LISTEN_HINTS;
    const hint = candidates[Math.floor(Math.random() * candidates.length)] ?? "空调声";
    this.appendHintToInputs(this.surroundingInputEls, hint);
  }

  private fillMusicHint(): void {
    const pool = MUSIC_REFLECTION_HINTS.filter(
      (item) => !this.getActiveValues().includes(item)
    );
    const candidates = pool.length > 0 ? pool : MUSIC_REFLECTION_HINTS;
    const hint = candidates[Math.floor(Math.random() * candidates.length)] ?? "节奏很轻";
    this.appendHint(this.musicTextareaEl, hint);
  }

  private appendHint(
    textareaEl: HTMLTextAreaElement | null,
    hint: string
  ): void {
    if (!textareaEl) {
      return;
    }

    const next = textareaEl.value
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (!next.includes(hint)) {
      textareaEl.value = [...next, hint].join("\n");
    }
    textareaEl.focus();
    textareaEl.setSelectionRange(textareaEl.value.length, textareaEl.value.length);
    this.updateState();
  }

  private appendHintToInputs(
    inputs: HTMLInputElement[],
    hint: string
  ): void {
    const values = inputs.map((inputEl) => inputEl.value.trim());
    if (values.includes(hint)) {
      const existingIndex = values.findIndex((value) => value === hint);
      inputs[existingIndex]?.focus();
      return;
    }

    const emptyIndex = values.findIndex((value) => value.length === 0);
    const nextIndex = emptyIndex === -1 ? 0 : emptyIndex;
    const target = inputs[nextIndex];
    if (!target) {
      return;
    }

    target.value = hint;
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
    this.updateState();
  }

  private submit(): void {
    const values = this.getActiveValues();
    if (values.length === 0) {
      return;
    }

    this.logLocalEvent(`continue_${this.activeTabId}`);
    if (this.activeTabId === "my_music") {
      this.options.onContinue({ tabId: "my_music", values });
      return;
    }

    this.options.onContinue({ tabId: "surrounding_sound", values });
  }

  private updateState(): void {
    const count = this.getActiveValues().length;
    if (this.continueButtonEl) {
      this.continueButtonEl.disabled = count === 0;
    }
  }

  private async loadCoverImages(): Promise<void> {
    const resolved = await resolveGroundingAssetFiles({
      app: this.options.app,
      type: "image",
      configuredFolder: this.options.configuredImageFolder,
      defaultFolders:
        this.options.imageFolders && this.options.imageFolders.length > 0
          ? this.options.imageFolders
          : GROUNDING_IMAGE_FOLDERS,
      extensions: ["png", "jpg", "jpeg", "webp", "gif"],
    });

    this.coverImagePaths = Array.from(new Set(resolved.files));
    this.assetBannerMessage = resolved.warning ?? null;
    this.currentCoverPath = this.pickRandomCoverPath();
  }

  private pickRandomCoverPath(excludePath?: string | null): string | null {
    if (this.coverImagePaths.length === 0) {
      return null;
    }

    const pool = this.coverImagePaths.filter((path) => path !== excludePath);
    const candidates = pool.length > 0 ? pool : this.coverImagePaths;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0] ?? null;
  }

  private refreshPlayerCover(changeCover = false): void {
    if (changeCover || !this.currentCoverPath) {
      this.currentCoverPath = this.pickRandomCoverPath(changeCover ? this.currentCoverPath : null);
    }
    this.applyCoverVisual(this.playerCoverEl, this.currentCoverPath);
    this.applyCoverVisual(this.generatedPlayerCoverEl, this.currentCoverPath);
  }

  private applyCoverVisual(
    coverEl: HTMLDivElement | null,
    path: string | null
  ): void {
    if (!coverEl) {
      return;
    }

    if (!path) {
      coverEl.style.backgroundImage =
        "linear-gradient(135deg, rgba(223, 233, 228, 0.98), rgba(242, 229, 218, 0.94))";
      coverEl.style.backgroundBlendMode = "normal";
      return;
    }

    const resourceUrl = getGroundingResourceUrl(this.options.app, path);
    if (!resourceUrl) {
      coverEl.style.backgroundImage =
        "linear-gradient(135deg, rgba(223, 233, 228, 0.98), rgba(242, 229, 218, 0.94))";
      coverEl.style.backgroundBlendMode = "normal";
      return;
    }

    coverEl.style.backgroundImage = `linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02) 42%, rgba(255,255,255,0.10) 100%), url("${resourceUrl}")`;
    coverEl.style.backgroundBlendMode = "soft-light, normal";
  }

  private async loadAudioFiles(): Promise<void> {
    const resolved = await resolveGroundingAssetFiles({
      app: this.options.app,
      type: "audio",
      configuredFolder: this.options.configuredAudioFolder,
      defaultFolders:
        this.options.audioFolders && this.options.audioFolders.length > 0
          ? this.options.audioFolders
          : GROUNDING_AUDIO_FOLDERS,
      extensions: ["mp3", "wav", "ogg", "m4a"],
    });
    const found: AudioItem[] = resolved.files.map((filePath) => {
      const name = filePath.split(/[\\/]/).pop() ?? filePath;
      return {
        path: filePath,
        name,
        basename: basenameWithoutExt(filePath),
      };
    });

    const uniq = new Map<string, AudioItem>();
    found.forEach((item) => uniq.set(item.path, item));
    this.audioFiles = Array.from(uniq.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    this.assetBannerMessage = resolved.warning ?? this.assetBannerMessage;
  }

  private refreshPicker(): void {
    if (!this.pickerEl) {
      return;
    }

    this.pickerEl.innerHTML = "";

    if (this.audioFiles.length === 0) {
      const option = this.pickerEl.createEl("option", {
        text: "没有找到本地音频",
      });
      option.value = "";
      return;
    }

    this.audioFiles.forEach((item, index) => {
      const option = this.pickerEl?.createEl("option", { text: item.basename });
      if (!option) {
        return;
      }
      option.value = item.path;
      if (this.currentAudio ? this.currentAudio.path === item.path : index === 0) {
        option.selected = true;
      }
    });
  }

  private async togglePlayPause(): Promise<void> {
    if (!this.currentAudio && this.audioFiles.length > 0) {
      this.logLocalEvent("play_music");
      await this.playLocalAudio(this.audioFiles[0] ?? null);
      return;
    }

    if (!this.audioEl) {
      this.syncAudioUi();
      return;
    }

    if (this.audioEl.paused) {
      this.logLocalEvent("play_music");
      await this.playLocalAudio(this.currentAudio);
      return;
    }

    this.logLocalEvent("pause_music");
    this.pauseLocalAudio();
  }

  private async playRandomTrack(): Promise<void> {
    if (this.audioFiles.length === 0) {
      this.syncAudioUi(true);
      return;
    }

    const candidates = this.audioFiles.filter(
      (item) => item.path !== this.currentAudio?.path
    );
    const pool = candidates.length > 0 ? candidates : this.audioFiles;
    const index = Math.floor(Math.random() * pool.length);
    this.refreshPlayerCover(true);
    await this.playLocalAudio(pool[index] ?? null);
  }

  private async playTrackByPath(path: string): Promise<void> {
    const item = this.audioFiles.find((file) => file.path === path) ?? null;
    await this.playLocalAudio(item);
  }

  private pauseLocalAudio(): void {
    if (!this.audioEl) {
      this.syncAudioUi();
      return;
    }

    this.audioEl.pause();
    this.playerStatusEl?.setText("");
    this.syncAudioUi();
  }

  private stopLocalAudio(): void {
    if (!this.audioEl) {
      this.syncAudioUi(true);
      return;
    }

    this.audioEl.pause();
    this.audioEl.currentTime = 0;
    this.playerStatusEl?.setText("");
    this.syncAudioUi(true);
  }

  private async playLocalAudio(item: AudioItem | null): Promise<void> {
    if (!item) {
      this.syncAudioUi(true);
      return;
    }

    const isSameTrack = this.currentAudio?.path === item.path;
    this.currentAudio = item;
    if (this.pickerEl) {
      this.pickerEl.value = item.path;
    }
    this.currentTrackEl?.setText(item.basename);

    if (this.audioEl && isSameTrack && this.currentAudioUrl) {
      this.audioEl.volume = this.getMusicVolume();
      this.refreshPlayerCover(false);
      await this.audioEl.play();
      this.playerStatusEl?.setText("");
      this.syncAudioUi();
      return;
    }

    try {
      const data = await readGroundingBinary(this.options.app, item.path);
      this.cleanupAudioUrl();
      const ext = item.name.split(".").pop()?.toLowerCase() ?? "mpeg";
      const mime = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;
      this.currentAudioUrl = URL.createObjectURL(new Blob([data], { type: mime }));

      if (!this.audioEl) {
        this.audioEl = new Audio();
        this.audioEl.volume = this.getMusicVolume();
        this.audioEl.addEventListener("timeupdate", () => this.syncProgressUi());
        this.audioEl.addEventListener("loadedmetadata", () => this.syncAudioUi());
        this.audioEl.addEventListener("ended", () => {
          if (this.audioEl) {
            this.audioEl.currentTime = 0;
          }
          this.playerStatusEl?.setText("这一小段已经放完了。你也可以直接写一下刚才的感觉。");
          this.logLocalEvent("ended_music");
          this.syncAudioUi(true);
        });
        this.audioEl.addEventListener("pause", () => this.syncAudioUi());
        this.audioEl.addEventListener("play", () => this.syncAudioUi());
        this.audioEl.addEventListener("error", () => {
          this.playerStatusEl?.setText(
            "这条音频暂时播放失败了。没关系，可以切回身边声音。"
          );
          this.syncAudioUi(true);
        });
      }

      this.audioEl.src = this.currentAudioUrl;
      this.audioEl.volume = this.getMusicVolume();
      this.refreshPlayerCover(false);
      await this.audioEl.play();
      this.playerStatusEl?.setText("");
      this.syncAudioUi();
    } catch {
      this.playerStatusEl?.setText(
        "这条音频暂时播放不了。没关系，可以切回身边声音。"
      );
      this.syncAudioUi(true);
    }
  }

  private stopPlayback(): void {
    this.stopLocalAudio();
  }

  private syncProgressUi(reset = false): void {
    if (!this.progressEl || !this.timeEl) {
      return;
    }

    if (!this.audioEl) {
      this.progressEl.value = "0";
      this.timeEl.setText("0:00 / 0:00");
      return;
    }

    const duration = Number.isFinite(this.audioEl.duration)
      ? this.audioEl.duration
      : 0;
    const current = reset ? 0 : this.audioEl.currentTime;
    if (!this.isSeeking) {
      const value =
        duration > 0 ? Math.round((current / duration) * 1000) : 0;
      this.progressEl.value = String(value);
    }

    this.timeEl.setText(`${this.formatTime(current)} / ${this.formatTime(duration)}`);
  }

  private syncAudioUi(reset = false): void {
    this.syncProgressUi(reset);

    const hasAudio = this.audioFiles.length > 0;
    const isPlaying = !!this.audioEl && !this.audioEl.paused;

    if (this.playButtonEl) {
      this.playButtonEl.disabled = !hasAudio;
      this.playButtonEl.setText(isPlaying ? "⏸" : "▶");
    }
    if (this.randomButtonEl) {
      this.randomButtonEl.disabled = !hasAudio;
      this.randomButtonEl.setText("↻");
    }
    if (this.pickerEl) {
      this.pickerEl.disabled = !hasAudio;
    }
    if (this.progressEl) {
      this.progressEl.disabled = !hasAudio;
    }

    if (!hasAudio) {
      this.currentTrackEl?.setText("还没有找到本地音频");
      this.playerStatusEl?.setText("还没有找到本地音频，也没关系，可以先听一个身边的声音。");
      return;
    }

    if (!this.currentAudio) {
      this.currentTrackEl?.setText("当前：选一首本地音频");
      this.playerStatusEl?.setText("");
      return;
    }

    if (reset && !isPlaying) {
      this.timeEl?.setText("0:00 / 0:00");
    }
  }

  private updateProgressUiFromInput(): void {
    if (!this.audioEl || !this.progressEl || !this.timeEl) {
      return;
    }

    const duration = Number.isFinite(this.audioEl.duration)
      ? this.audioEl.duration
      : 0;
    const current = (Number(this.progressEl.value) / 1000) * duration;
    this.timeEl.setText(`${this.formatTime(current)} / ${this.formatTime(duration)}`);
  }

  private seekToProgress(): void {
    if (!this.audioEl || !this.progressEl) {
      return;
    }

    const duration = Number.isFinite(this.audioEl.duration)
      ? this.audioEl.duration
      : 0;
    if (duration <= 0) {
      return;
    }

    this.audioEl.currentTime = (Number(this.progressEl.value) / 1000) * duration;
    this.syncAudioUi();
  }

  private cleanupAudioUrl(): void {
    if (!this.currentAudioUrl) {
      return;
    }

    URL.revokeObjectURL(this.currentAudioUrl);
    this.currentAudioUrl = null;
  }

  private formatTime(seconds: number): string {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const mins = Math.floor(safe / 60);
    const secs = String(safe % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }
}
