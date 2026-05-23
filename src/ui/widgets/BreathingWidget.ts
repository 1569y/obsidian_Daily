import type { App } from "obsidian";

import {
  readGroundingBinary,
  resolveGroundingAssetFiles,
} from "../../services/groundingAssetResolver";
import { GROUNDING_AUDIO_FOLDERS } from "../actionPanelRegistry";

type BreathingPhase = "inhale" | "hold" | "exhale";

type BreathingPattern = {
  id: string;
  label: string;
  steps: Array<{ phase: BreathingPhase; seconds: number; text: string }>;
  cycles: number;
};

type BreathingWidgetOptions = {
  app?: App;
  inhaleSeconds?: number;
  exhaleSeconds?: number;
  cycles?: number;
  configuredAudioFolder?: string;
  audioFolders?: string[];
  onFinish?: () => void;
};

const DEFAULT_PATTERNS: BreathingPattern[] = [
  {
    id: "soft-46",
    label: "舒缓 4-6",
    steps: [
      { phase: "inhale", seconds: 4, text: "吸气" },
      { phase: "exhale", seconds: 6, text: "呼气" },
    ],
    cycles: 4,
  },
  {
    id: "box",
    label: "方块 4-4-4-4",
    steps: [
      { phase: "inhale", seconds: 4, text: "吸气" },
      { phase: "hold", seconds: 4, text: "停一下" },
      { phase: "exhale", seconds: 4, text: "呼气" },
      { phase: "hold", seconds: 4, text: "停一下" },
    ],
    cycles: 3,
  },
  {
    id: "steady-55",
    label: "均匀 5-5",
    steps: [
      { phase: "inhale", seconds: 5, text: "吸气" },
      { phase: "exhale", seconds: 5, text: "呼气" },
    ],
    cycles: 4,
  },
];

export class BreathingWidget {
  private root: HTMLDivElement;
  private ringEl: HTMLDivElement;
  private phaseEl: HTMLParagraphElement;
  private countEl: HTMLParagraphElement;
  private actionButtonEl: HTMLButtonElement;
  private bgToggleButtonEl: HTMLButtonElement;
  private running = false;
  private rafId: number | null = null;
  private cycleIndex = 0;
  private stepIndex = 0;
  private phaseStartedAt = 0;
  private patterns: BreathingPattern[];
  private activePattern: BreathingPattern;
  private readonly onFinish?: () => void;
  private bgAudioEl: HTMLAudioElement | null = null;
  private bgAudioUrl: string | null = null;
  private bgReady = false;

  constructor(mountEl: HTMLElement, private options: BreathingWidgetOptions = {}) {
    const softPattern = DEFAULT_PATTERNS[0];
    if (!softPattern) {
      throw new Error("Breathing patterns are required.");
    }

    this.patterns = DEFAULT_PATTERNS.map((pattern) =>
      pattern.id === "soft-46"
        ? {
            ...pattern,
            steps: [
              {
                phase: "inhale",
                seconds: options.inhaleSeconds ?? pattern.steps[0]?.seconds ?? 4,
                text: "吸气",
              },
              {
                phase: "exhale",
                seconds: options.exhaleSeconds ?? pattern.steps[1]?.seconds ?? 6,
                text: "呼气",
              },
            ],
            cycles: options.cycles ?? pattern.cycles,
          }
        : pattern
    );
    this.activePattern = this.patterns[0] ?? softPattern;
    this.onFinish = options.onFinish;

    this.root = mountEl.createDiv();
    this.root.style.display = "grid";
    this.root.style.gap = "14px";

    const headerRow = this.root.createDiv();
    headerRow.style.display = "flex";
    headerRow.style.alignItems = "flex-start";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.gap = "10px";

    const introEl = headerRow.createEl("p", {
      text: "先跟着呼一口气。不用做满一轮。",
    });
    introEl.style.margin = "0";
    introEl.style.fontSize = "14px";
    introEl.style.lineHeight = "1.7";
    introEl.style.color = "#5d6973";
    introEl.style.flex = "1";

    this.bgToggleButtonEl = headerRow.createEl("button", { text: "🔇" });
    this.bgToggleButtonEl.style.width = "34px";
    this.bgToggleButtonEl.style.height = "34px";
    this.bgToggleButtonEl.style.borderRadius = "999px";
    this.bgToggleButtonEl.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    this.bgToggleButtonEl.style.background = "rgba(255,255,255,0.92)";
    this.bgToggleButtonEl.style.color = "#55636d";
    this.bgToggleButtonEl.style.display = "grid";
    this.bgToggleButtonEl.style.placeItems = "center";
    this.bgToggleButtonEl.style.fontSize = "14px";
    this.bgToggleButtonEl.addEventListener("click", () => {
      void this.toggleBackgroundAudio();
    });

    const patternRow = this.root.createDiv();
    patternRow.style.display = "flex";
    patternRow.style.flexWrap = "wrap";
    patternRow.style.gap = "8px";

    this.patterns.forEach((pattern) => {
      const button = patternRow.createEl("button", { text: pattern.label });
      this.stylePatternButton(button, pattern.id === this.activePattern.id);
      button.addEventListener("click", () => {
        this.activePattern = pattern;
        this.reset();
        Array.from(patternRow.children).forEach((child, index) => {
          if (child instanceof HTMLButtonElement) {
            this.stylePatternButton(
              child,
              this.patterns[index]?.id === this.activePattern.id
            );
          }
        });
      });
    });

    const stageEl = this.root.createDiv();
    stageEl.style.display = "grid";
    stageEl.style.justifyItems = "center";
    stageEl.style.gap = "10px";
    stageEl.style.padding = "8px 0 2px";

    this.ringEl = stageEl.createDiv();
    this.ringEl.style.width = "136px";
    this.ringEl.style.height = "136px";
    this.ringEl.style.borderRadius = "999px";
    this.ringEl.style.background =
      "radial-gradient(circle at 30% 30%, rgba(233, 245, 241, 0.98), rgba(194, 219, 211, 0.92))";
    this.ringEl.style.boxShadow =
      "inset 0 1px 0 rgba(255,255,255,0.6), 0 12px 28px rgba(71, 101, 96, 0.14)";
    this.ringEl.style.transform = "scale(0.84)";
    this.ringEl.style.transition = "transform 120ms linear";

    this.phaseEl = stageEl.createEl("p", { text: "准备好了就开始" });
    this.phaseEl.style.margin = "0";
    this.phaseEl.style.fontSize = "16px";
    this.phaseEl.style.fontWeight = "600";
    this.phaseEl.style.color = "#23303a";

    this.countEl = stageEl.createEl("p", {
      text: this.buildPatternSummary(this.activePattern),
    });
    this.countEl.style.margin = "0";
    this.countEl.style.fontSize = "13px";
    this.countEl.style.color = "#6b7780";

    this.actionButtonEl = this.root.createEl("button", { text: "开始" });
    this.actionButtonEl.style.height = "42px";
    this.actionButtonEl.style.borderRadius = "12px";
    this.actionButtonEl.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    this.actionButtonEl.style.background = "#dce8e3";
    this.actionButtonEl.style.color = "#23303a";
    this.actionButtonEl.style.fontWeight = "600";
    this.actionButtonEl.addEventListener("click", () => {
      if (this.running) {
        this.stop();
        return;
      }

      this.start();
    });

    this.syncBackgroundUi();
    if (this.options.app) {
      void this.loadBackgroundAudio();
    }
  }

  destroy(): void {
    this.stop();
    this.stopBackgroundAudio();
    if (this.bgAudioEl) {
      this.bgAudioEl.src = "";
      this.bgAudioEl = null;
    }
    if (this.bgAudioUrl) {
      URL.revokeObjectURL(this.bgAudioUrl);
      this.bgAudioUrl = null;
    }
    this.root.detach();
  }

  private stylePatternButton(
    buttonEl: HTMLButtonElement,
    selected: boolean
  ): void {
    buttonEl.style.height = "34px";
    buttonEl.style.borderRadius = "999px";
    buttonEl.style.padding = "0 12px";
    buttonEl.style.border = selected
      ? "1px solid rgba(76, 107, 95, 0.36)"
      : "1px solid rgba(118, 128, 145, 0.12)";
    buttonEl.style.background = selected
      ? "rgba(220, 232, 227, 0.96)"
      : "rgba(255,255,255,0.92)";
    buttonEl.style.color = "#23303a";
  }

  private logLocalEvent(event: string): void {
    console.debug(
      `[MoodNest action local] action=breathing event=${event} api=false`
    );
  }

  private buildPatternSummary(pattern: BreathingPattern): string {
    const labels = pattern.steps.map((step) => `${step.text} ${step.seconds} 秒`);
    return `${labels.join("，")}，共 ${pattern.cycles} 轮`;
  }

  private start(): void {
    this.logLocalEvent("start");
    this.running = true;
    this.cycleIndex = 0;
    this.stepIndex = 0;
    this.phaseStartedAt = performance.now();
    this.actionButtonEl.setText("暂停");
    this.loop();
  }

  private stop(): void {
    if (this.running) {
      this.logLocalEvent("stop");
    }

    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.actionButtonEl.setText("继续");
  }

  private reset(): void {
    this.stop();
    this.cycleIndex = 0;
    this.stepIndex = 0;
    this.ringEl.style.transform = "scale(0.84)";
    this.phaseEl.setText("准备好了就开始");
    this.countEl.setText(this.buildPatternSummary(this.activePattern));
    this.actionButtonEl.setText("开始");
  }

  private complete(): void {
    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.ringEl.style.transform = "scale(0.9)";
    this.phaseEl.setText("已经够了，可以继续。");
    this.countEl.setText("哪怕只稳住一点点，也算。");
    this.actionButtonEl.setText("再来一轮");
    this.onFinish?.();
  }

  private async loadBackgroundAudio(): Promise<void> {
    const app = this.options.app;
    if (!app) {
      this.bgReady = false;
      this.syncBackgroundUi();
      return;
    }

    const resolved = await resolveGroundingAssetFiles({
      app,
      type: "audio",
      configuredFolder: this.options.configuredAudioFolder,
      defaultFolders:
        this.options.audioFolders && this.options.audioFolders.length > 0
          ? this.options.audioFolders
          : GROUNDING_AUDIO_FOLDERS,
      extensions: ["mp3", "wav", "ogg", "m4a"],
    });

    const firstPath = resolved.files[0];
    if (!firstPath) {
      this.bgReady = false;
      this.syncBackgroundUi();
      return;
    }

    try {
      const data = await readGroundingBinary(app, firstPath);
      const ext = firstPath.split(".").pop()?.toLowerCase() ?? "mpeg";
      const mime = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;
      this.bgAudioUrl = URL.createObjectURL(new Blob([data], { type: mime }));
      this.bgAudioEl = new Audio(this.bgAudioUrl);
      this.bgAudioEl.loop = true;
      this.bgAudioEl.volume = 0.45;
      this.bgAudioEl.addEventListener("play", () => this.syncBackgroundUi());
      this.bgAudioEl.addEventListener("pause", () => this.syncBackgroundUi());
      this.bgAudioEl.addEventListener("error", () => {
        this.bgReady = false;
        this.syncBackgroundUi();
      });

      this.bgReady = true;
      this.syncBackgroundUi();
    } catch {
      this.bgReady = false;
      this.syncBackgroundUi();
    }
  }

  private async toggleBackgroundAudio(): Promise<void> {
    this.logLocalEvent("toggle_audio");
    if (!this.bgAudioEl || !this.bgReady) {
      this.syncBackgroundUi();
      return;
    }

    if (this.bgAudioEl.paused) {
      await this.bgAudioEl.play();
      this.syncBackgroundUi();
      return;
    }

    this.bgAudioEl.pause();
    this.syncBackgroundUi();
  }

  private stopBackgroundAudio(): void {
    if (!this.bgAudioEl) {
      return;
    }

    this.bgAudioEl.pause();
    this.bgAudioEl.currentTime = 0;
    this.syncBackgroundUi();
  }

  private syncBackgroundUi(): void {
    const isPlaying = !!this.bgAudioEl && !this.bgAudioEl.paused;
    this.bgToggleButtonEl.setText(isPlaying ? "🔈" : "🔇");
    this.bgToggleButtonEl.title = this.bgReady
      ? isPlaying
        ? "点一下关闭背景音"
        : "点一下播放背景音"
      : "背景音暂时不可用，可以只跟着呼吸球";
  }

  private loop = (): void => {
    if (!this.running) {
      return;
    }

    const step = this.activePattern.steps[this.stepIndex];
    if (!step) {
      this.complete();
      return;
    }

    const elapsedSeconds = (performance.now() - this.phaseStartedAt) / 1000;
    const progress = Math.min(1, Math.max(0, elapsedSeconds / step.seconds));

    if (step.phase === "inhale") {
      this.ringEl.style.transform = `scale(${0.84 + progress * 0.22})`;
    } else if (step.phase === "exhale") {
      this.ringEl.style.transform = `scale(${1.06 - progress * 0.22})`;
    } else {
      this.ringEl.style.transform = "scale(1.02)";
    }

    this.phaseEl.setText(step.text);
    const remaining = Math.max(0, Math.ceil(step.seconds - elapsedSeconds));
    this.countEl.setText(
      `${this.cycleIndex + 1}/${this.activePattern.cycles} 轮，还剩 ${remaining} 秒`
    );

    if (progress >= 1) {
      this.stepIndex += 1;
      if (this.stepIndex >= this.activePattern.steps.length) {
        this.stepIndex = 0;
        this.cycleIndex += 1;
      }

      if (this.cycleIndex >= this.activePattern.cycles) {
        this.complete();
        return;
      }

      this.phaseStartedAt = performance.now();
    }

    this.rafId = window.requestAnimationFrame(this.loop);
  };
}
