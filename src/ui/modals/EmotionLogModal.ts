import { App, Modal, Notice } from "obsidian";
import type MoodNestPlugin from "../../../main";
import { SpeechService } from "../../services/speechService";
import type {
  ActionCardContext,
  ActionCompletionLog,
  AgentResult,
  ChatTurn,
  LiveSupportResult,
  RecommendedAction,
  SuggestedActionArchiveItem,
} from "../../types";
import {
  buildReplayHiddenContext,
  buildReplayUserMessage,
  cycleGroundingPanelAction,
  derivePanelActionId,
  GENTLE_CLARIFY_OPTIONS,
  INTERNSHIP_REQUIREMENT_OVERLOAD_OPTIONS,
  getLighterMicroAction,
  getMicroActionById,
  getRandomMicroAction,
  GROUNDING_AUDIO_FOLDERS,
  GROUNDING_IMAGE_FOLDERS,
  panelActionIdToGroundingVariant,
  type PanelActionId,
  type PanelChoiceOption,
  MICRO_ACTION_POOL,
  REPLAY_OPTIONS,
} from "../actionPanelRegistry";
import { BreathingWidget } from "../widgets/BreathingWidget";
import {
  ListenWidget,
  type ListenCardSubmission,
  type SoundCardTabId,
} from "../widgets/ListenWidget";
import { SeeFiveWidget } from "../widgets/SeeFiveWidget";
import { TouchWidget } from "../widgets/TouchWidget";

type LocalActionType =
  | "breathing"
  | "see"
  | "listen"
  | "touch"
  | "micro_action"
  | "generated_sound";

type PostActionBridgeOption = {
  id: string;
  label: string;
  nextPanelActionId?: PanelActionId;
  focusInput?: boolean;
  clearAction?: boolean;
  message?: string;
  status?: string;
};

type PostActionBridgeState = {
  actionType: LocalActionType;
  localReply: string;
  options: PostActionBridgeOption[];
};

type SuggestedItemKind = "support_action" | "task";

type SuggestedActionState = {
  id: string;
  kind: SuggestedItemKind;
  label: string;
  description?: string;
  actionType?: RecommendedAction["type"];
  panelActionId?: PanelActionId;
  status: "suggested" | "selected" | "completed" | "dismissed";
  includeInArchive?: boolean;
  soundDefaultTab?: "surrounding_sound" | "my_music";
  addToJournal?: boolean;
  createdFrom?: "assistant_recommendation" | "task_breakdown";
};

type ActionPayloadChoiceOption = PanelChoiceOption & {
  kind?: string;
};

export class EmotionLogModal extends Modal {
  plugin: MoodNestPlugin;

  private speechService = new SpeechService();

  private chatHistory: ChatTurn[] = [];
  private pendingAudioBlobs: Blob[] = [];

  private latestQuickAnalysis: LiveSupportResult["quickAnalysis"] | null = null;
  private latestRecommendedAction: RecommendedAction | null = null;
  private latestFinalResult: AgentResult | null = null;

  private activePanelActionId: PanelActionId = "none";
  private replaySelectedIds = new Set<string>();
  private currentMicroActionId: string | null = null;
  private microActionStarted = false;
  private completedActions: ActionCompletionLog[] = [];
  private feedbackMessage: string | null = null;
  private postActionBridge: PostActionBridgeState | null = null;
  private suggestedActions: SuggestedActionState[] = [];
  private suggestedActionsTitle: string | null = null;

  private breathingWidget: BreathingWidget | null = null;
  private seeFiveWidget: SeeFiveWidget | null = null;
  private touchWidget: TouchWidget | null = null;
  private listenWidget: ListenWidget | null = null;
  private lastListenTabId: SoundCardTabId = "surrounding_sound";

  private isReplying = false;
  private isSending = false;
  private isRecording = false;
  private isTranscribing = false;
  private shouldArchiveAudio = false;
  private pendingRequestId: string | null = null;
  private pendingScrollFrameId: number | null = null;

  private chatListEl: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private rightPanelHostEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private archiveAudioCheckboxEl: HTMLInputElement | null = null;
  private sendButtonEl: HTMLButtonElement | null = null;
  private recordButtonEl: HTMLButtonElement | null = null;
  private pauseActionButtonEl: HTMLButtonElement | null = null;
  private finishButtonEl: HTMLButtonElement | null = null;
  private archiveProgressWrapEl: HTMLDivElement | null = null;
  private archiveProgressLabelEl: HTMLParagraphElement | null = null;
  private archiveProgressBarEl: HTMLDivElement | null = null;
  private statusEl: HTMLElement | null = null;
  private isArchiving = false;
  private archiveProgressLabel: string | null = null;
  private archiveProgressStep = 0;
  private archiveProgressTotal = 0;
  private softCelebrationMessage: string | null = null;
  private softCelebrationAnchor: "right-panel" | "modal-center" = "right-panel";
  private softCelebrationTimerId: number | null = null;
  private lastCelebrationKey: string | null = null;
  private lastCelebrationAt = 0;
  private floatingCelebrationEl: HTMLDivElement | null = null;
  private celebrationOverlayRootEl: HTMLDivElement | null = null;
  private softCelebrationTheme:
    | "flower"
    | "star"
    | "sparkle"
    | "leaf" = "flower";
  private archiveCloseTimerId: number | null = null;

  constructor(app: App, plugin: MoodNestPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.renderLayout();
    this.renderChatHistory();
    this.renderActionPanel();
    void this.plugin.asrService.init();
  }

  onClose(): void {
    if (this.pendingScrollFrameId !== null) {
      window.cancelAnimationFrame(this.pendingScrollFrameId);
      this.pendingScrollFrameId = null;
    }

    if (this.softCelebrationTimerId !== null) {
      window.clearTimeout(this.softCelebrationTimerId);
      this.softCelebrationTimerId = null;
    }

    if (this.archiveCloseTimerId !== null) {
      window.clearTimeout(this.archiveCloseTimerId);
      this.archiveCloseTimerId = null;
    }

    this.floatingCelebrationEl?.remove();
    this.floatingCelebrationEl = null;

    if (this.isRecording) {
      try {
        this.speechService.cancelRecording();
        this.updateActionButtons();
      } catch (error) {
        console.error(error);
      }
      this.isRecording = false;
    }

    this.destroyWidgets();
    this.contentEl.empty();
  }

  private renderLayout(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.ensureUiStyles();

    this.modalEl.style.width = "min(1280px, 92vw)";
    this.modalEl.style.maxWidth = "1280px";
    this.modalEl.style.borderRadius = "24px";
    this.modalEl.style.overflow = "hidden";
    this.modalEl.style.border = "1px solid rgba(118, 128, 145, 0.16)";
    this.modalEl.style.boxShadow =
      "0 24px 60px rgba(30, 36, 44, 0.12), 0 10px 24px rgba(30, 36, 44, 0.06)";

    contentEl.style.padding = "22px";
    contentEl.style.height = "82vh";
    contentEl.style.boxSizing = "border-box";
    contentEl.style.position = "relative";
    contentEl.style.background =
      "linear-gradient(180deg, #f8f8f5 0%, #f2f2ed 100%)";

    const wrapper = contentEl.createDiv();
    wrapper.style.display = "grid";
    wrapper.style.gridTemplateColumns = "minmax(0, 1.7fr) minmax(0, 1fr)";
    wrapper.style.gap = "18px";
    wrapper.style.height = "100%";

    const leftPanel = wrapper.createDiv();
    this.applyPanelCardStyle(leftPanel);
    this.renderLeftPanel(leftPanel);

    const rightPanel = wrapper.createDiv();
    this.applyPanelCardStyle(rightPanel);
    this.rightPanelHostEl = rightPanel;
    this.renderRightPanel(rightPanel);

    this.celebrationOverlayRootEl = contentEl.createDiv({
      cls: "moodnest-celebration-overlay",
    });

    this.statusEl = contentEl.createEl("p", {
      text: "可以直接说，也可以先用右侧很轻的小动作卡。不想做也没关系。",
    });
    this.statusEl.style.margin = "12px 2px 0 4px";
    this.statusEl.style.fontSize = "13px";
    this.statusEl.style.lineHeight = "1.5";
    this.statusEl.style.color = "#6e7882";
    this.statusEl.setText(
      "可以直接说，也可以先碰一下右侧很轻的小动作卡。不想做也没关系。"
    );
  }

  private renderLeftPanel(parent: HTMLElement): void {
    const headerEl = parent.createDiv();
    headerEl.style.padding = "24px 24px 16px 24px";
    headerEl.style.borderBottom = "1px solid rgba(118, 128, 145, 0.10)";

    const titleEl = headerEl.createEl("h2", { text: "MoodNest" });
    titleEl.style.margin = "0";
    titleEl.style.fontSize = "21px";
    titleEl.style.fontWeight = "700";
    titleEl.style.letterSpacing = "-0.02em";
    titleEl.style.color = "#23303a";

    const descEl = headerEl.createEl("p", {
      text: "先接住，再慢慢收窄。你不用一口气说清楚，先从最想说的一点开始就好。",
    });
    descEl.style.margin = "10px 0 0 0";
    descEl.style.fontSize = "14px";
    descEl.style.lineHeight = "1.7";
    descEl.style.color = "#66717b";
    descEl.setText(
      "先接住，再慢慢收窄。你不用一口气说清楚，先从最想说的一点开始就好。"
    );

    this.chatListEl = parent.createDiv();
    this.chatListEl.addClass("moodnest-chat-history");
    this.chatListEl.style.flex = "1";
    this.chatListEl.style.minHeight = "0";
    this.chatListEl.style.overflowY = "auto";
    this.chatListEl.style.padding = "22px";
    this.chatListEl.style.display = "flex";
    this.chatListEl.style.flexDirection = "column";
    this.chatListEl.style.gap = "14px";
    this.chatListEl.style.background =
      "linear-gradient(180deg, rgba(251,251,249,0.58) 0%, rgba(245,245,241,0.36) 100%)";

    const composerEl = parent.createDiv();
    composerEl.style.display = "grid";
    composerEl.style.gap = "10px";
    composerEl.style.padding = "14px";
    composerEl.style.borderTop = "1px solid rgba(118, 128, 145, 0.10)";
    composerEl.style.background = "rgba(248, 248, 245, 0.72)";

    const composerRow = composerEl.createDiv();
    composerRow.style.display = "flex";
    composerRow.style.alignItems = "stretch";
    composerRow.style.gap = "12px";
    composerRow.style.flexWrap = "wrap";

    const inputShell = composerRow.createDiv();
    inputShell.style.flex = "1 1 320px";
    inputShell.style.minHeight = "74px";
    inputShell.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    inputShell.style.borderRadius = "18px";
    inputShell.style.background = "rgba(255,255,255,0.90)";
    inputShell.style.padding = "11px 16px";
    inputShell.style.boxSizing = "border-box";
    inputShell.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.02)";

    this.inputEl = inputShell.createEl("textarea");
    this.inputEl.placeholder = "此刻最想说的一句是什么？";
    this.inputEl.rows = 1;
    this.inputEl.style.width = "100%";
    this.inputEl.style.height = "100%";
    this.inputEl.style.resize = "none";
    this.inputEl.style.boxSizing = "border-box";
    this.inputEl.style.minHeight = "44px";
    this.inputEl.style.maxHeight = "180px";
    this.inputEl.style.overflowY = "hidden";
    this.inputEl.style.borderRadius = "0";
    this.inputEl.style.padding = "0";
    this.inputEl.style.fontSize = "14px";
    this.inputEl.style.lineHeight = "1.65";
    this.inputEl.style.border = "none";
    this.inputEl.style.background = "transparent";
    this.inputEl.style.outline = "none";
    this.inputEl.style.boxShadow = "none";
    this.inputEl.placeholder = "此刻最想说的一句是什么？";
    this.inputEl.addEventListener("input", () => {
      this.adjustInputHeight();
    });
    this.inputEl.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        await this.handleSendMessage();
      }
    });

    const sideColumn = composerRow.createDiv();
    sideColumn.style.minWidth = "128px";
    sideColumn.style.flex = "0 0 128px";
    sideColumn.style.display = "flex";
    sideColumn.style.flexDirection = "column";
    sideColumn.style.justifyContent = "flex-end";
    sideColumn.style.alignItems = "stretch";
    sideColumn.style.gap = "8px";

    const archiveRecordingRow = sideColumn.createDiv();
    archiveRecordingRow.style.display = "flex";
    archiveRecordingRow.style.alignItems = "center";
    archiveRecordingRow.style.gap = "8px";
    archiveRecordingRow.style.fontSize = "13px";
    archiveRecordingRow.style.lineHeight = "1.5";
    archiveRecordingRow.style.color = "#66717b";
    archiveRecordingRow.style.whiteSpace = "nowrap";
    archiveRecordingRow.style.width = "100%";
    archiveRecordingRow.style.marginLeft = "8px";

    this.archiveAudioCheckboxEl = archiveRecordingRow.createEl("input", {
      attr: { type: "checkbox" },
    });
    this.archiveAudioCheckboxEl.checked = this.shouldArchiveAudio;
    this.archiveAudioCheckboxEl.style.width = "16px";
    this.archiveAudioCheckboxEl.style.height = "16px";
    this.archiveAudioCheckboxEl.style.margin = "0";
    this.archiveAudioCheckboxEl.addEventListener("change", () => {
      this.shouldArchiveAudio = !!this.archiveAudioCheckboxEl?.checked;
      this.setStatus(
        this.shouldArchiveAudio
          ? "这次如果有录音，会一起归档。"
          : "这次归档会只保存文字，不带录音附件。"
      );
    });

    archiveRecordingRow.createEl("span", { text: "归档录音" });

    const composerActionButtons = sideColumn.createDiv();
    composerActionButtons.style.display = "flex";
    composerActionButtons.style.alignItems = "center";
    composerActionButtons.style.gap = "10px";
    composerActionButtons.style.flexWrap = "nowrap";
    composerActionButtons.style.width = "100%";
    composerActionButtons.style.justifyContent = "flex-start";

    this.recordButtonEl = composerActionButtons.createEl("button", { text: "录" });
    this.styleIconButton(this.recordButtonEl);
    this.recordButtonEl.setText("🎙️");
    this.recordButtonEl.addEventListener("click", async () => {
      await this.handleToggleRecording();
    });

    this.sendButtonEl = composerActionButtons.createEl("button", { text: "发" });
    this.styleIconButton(this.sendButtonEl, true);
    this.sendButtonEl.setText("➤");
    this.sendButtonEl.addEventListener("click", async () => {
      await this.handleSendMessage();
    });

    this.adjustInputHeight();
    this.updateActionButtons();
  }

  private renderRightPanel(parent: HTMLElement): void {
    const headerEl = parent.createDiv();
    headerEl.style.padding = "24px 24px 16px 24px";
    headerEl.style.borderBottom = "1px solid rgba(118, 128, 145, 0.10)";

    const titleEl = headerEl.createEl("h2", { text: "此刻先做这一件事" });
    titleEl.style.margin = "0";
    titleEl.style.fontSize = "21px";
    titleEl.style.fontWeight = "700";
    titleEl.style.letterSpacing = "-0.02em";
    titleEl.style.color = "#23303a";
    titleEl.setText("先把注意力放下来一点");

    const descEl = headerEl.createEl("p", {
      text: "不用想太多，先点一个。做完再继续聊。不想做也没关系。",
    });
    descEl.style.margin = "10px 0 0 0";
    descEl.style.fontSize = "14px";
    descEl.style.lineHeight = "1.7";
    descEl.style.color = "#66717b";
    descEl.setText("不需要做完整，碰到一点点就算。不想做也没关系。");

    this.panelEl = parent.createDiv();
    this.panelEl.style.flex = "1";
    this.panelEl.style.minHeight = "0";
    this.panelEl.style.overflowY = "auto";
    this.panelEl.style.padding = "18px";
    this.panelEl.style.background =
      "linear-gradient(180deg, rgba(250,250,248,0.48) 0%, rgba(245,245,241,0.28) 100%)";

    const footerEl = parent.createDiv();
    footerEl.style.display = "grid";
    footerEl.style.gap = "10px";
    footerEl.style.padding = "14px";
    footerEl.style.borderTop = "1px solid rgba(118, 128, 145, 0.10)";
    footerEl.style.background = "rgba(248, 248, 245, 0.72)";

    this.archiveProgressWrapEl = footerEl.createDiv();
    this.archiveProgressWrapEl.style.display = "none";
    this.archiveProgressWrapEl.style.gap = "8px";

    this.archiveProgressLabelEl = this.archiveProgressWrapEl.createEl("p");
    this.archiveProgressLabelEl.style.margin = "0";
    this.archiveProgressLabelEl.style.fontSize = "12px";
    this.archiveProgressLabelEl.style.lineHeight = "1.5";
    this.archiveProgressLabelEl.style.color = "#66717b";

    const progressTrackEl = this.archiveProgressWrapEl.createDiv();
    progressTrackEl.style.height = "6px";
    progressTrackEl.style.borderRadius = "999px";
    progressTrackEl.style.background = "rgba(118, 128, 145, 0.12)";
    progressTrackEl.style.overflow = "hidden";

    this.archiveProgressBarEl = progressTrackEl.createDiv();
    this.archiveProgressBarEl.style.height = "100%";
    this.archiveProgressBarEl.style.width = "0%";
    this.archiveProgressBarEl.style.borderRadius = "999px";
    this.archiveProgressBarEl.style.background =
      "linear-gradient(90deg, rgba(141, 178, 161, 0.98), rgba(213, 233, 219, 0.96))";
    this.archiveProgressBarEl.style.transition = "width 180ms ease";

    const actionRow = footerEl.createDiv();
    actionRow.style.display = "flex";
    actionRow.style.alignItems = "center";
    actionRow.style.gap = "10px";
    actionRow.style.flexWrap = "nowrap";

    this.pauseActionButtonEl = actionRow.createEl("button", {
      text: "先不做这个，继续聊",
    });
    this.pauseActionButtonEl.style.flex = "1 1 auto";
    this.pauseActionButtonEl.style.minWidth = "0";
    this.pauseActionButtonEl.style.height = "44px";
    this.pauseActionButtonEl.style.borderRadius = "14px";
    this.pauseActionButtonEl.style.border = "1px solid rgba(118,128,145,0.10)";
    this.pauseActionButtonEl.style.background = "rgba(255,255,255,0.90)";
    this.pauseActionButtonEl.style.color = "#55636d";
    this.pauseActionButtonEl.style.fontWeight = "500";
    this.pauseActionButtonEl.addEventListener("click", () => {
      this.pauseCurrentActionAndFocusInput();
    });

    this.finishButtonEl = actionRow.createEl("button", { text: "结束并归档" });
    this.finishButtonEl.style.flex = "0 0 auto";
    this.finishButtonEl.style.minWidth = "132px";
    this.finishButtonEl.style.height = "48px";
    this.finishButtonEl.style.borderRadius = "14px";
    this.finishButtonEl.style.background = "#dfe8e6";
    this.finishButtonEl.style.border = "1px solid rgba(118,128,145,0.10)";
    this.finishButtonEl.style.boxShadow = "0 8px 18px rgba(30,35,45,0.06)";
    this.finishButtonEl.style.fontWeight = "600";
    this.finishButtonEl.style.color = "#23303a";
    this.finishButtonEl.addEventListener("click", async () => {
      await this.handleFinishAndArchive();
    });

    this.updateArchiveProgressUi();
  }

  private renderChatHistory(): void {
    if (!this.chatListEl) {
      this.updateActionButtons();
      return;
    }

    this.chatListEl.empty();

    if (this.chatHistory.length === 0) {
      const emptyWrap = this.chatListEl.createDiv();
      emptyWrap.style.display = "flex";
      emptyWrap.style.alignItems = "center";
      emptyWrap.style.justifyContent = "center";
      emptyWrap.style.height = "100%";

      const emptyCard = emptyWrap.createDiv();
      emptyCard.style.maxWidth = "78%";
      emptyCard.style.padding = "16px 18px";
      emptyCard.style.borderRadius = "18px";
      emptyCard.style.background = "rgba(255,255,255,0.78)";
      emptyCard.style.border = "1px solid rgba(118,128,145,0.10)";
      emptyCard.style.boxShadow = "0 8px 18px rgba(30,35,45,0.04)";
      emptyCard.style.fontSize = "14px";
      emptyCard.style.lineHeight = "1.75";
      emptyCard.style.color = "#66717b";
      emptyCard.setText("你可以先随便说一句。MoodNest 会先陪你把它放下来。");
      return;
    }

    for (const turn of this.chatHistory) {
      const row = this.chatListEl.createDiv();
      row.addClass("moodnest-chat-message");
      row.style.display = "flex";
      row.style.justifyContent = turn.role === "user" ? "flex-end" : "flex-start";

      const bubble = row.createDiv();
      bubble.addClass("moodnest-chat-bubble");
      bubble.style.maxWidth = "74%";
      bubble.style.padding = "13px 16px";
      bubble.style.lineHeight = "1.68";
      bubble.style.fontSize = "14px";
      bubble.style.whiteSpace = "pre-wrap";
      bubble.style.wordBreak = "break-word";
      bubble.style.border = "1px solid rgba(118,128,145,0.10)";
      bubble.style.boxShadow = "0 6px 14px rgba(30,35,45,0.04)";
      bubble.style.userSelect = "text";
      bubble.style.webkitUserSelect = "text";
      bubble.style.cursor = "text";

      if (turn.role === "user") {
        bubble.style.borderRadius = "18px 18px 6px 18px";
        bubble.style.background = "#dfe8e6";
        bubble.style.color = "#22303a";
      } else {
        bubble.style.borderRadius = "18px 18px 18px 6px";
        bubble.style.background = "#f7f4ec";
        bubble.style.color = "#2c3942";
      }

      bubble.setText(turn.content);
    }

    this.scheduleScrollToBottom();
  }

  private renderActionPanel(): void {
    if (!this.panelEl) {
      return;
    }

    this.panelEl.empty();
    this.destroyWidgets();

    if (this.postActionBridge) {
      this.renderPostActionBridge(this.panelEl, this.postActionBridge);
    } else if (this.feedbackMessage) {
      this.renderFeedbackBanner(this.panelEl, this.feedbackMessage);
    }

    if (this.latestQuickAnalysis?.riskLevel === "high") {
      this.renderHighRiskPanel();
      this.renderDetailsSections();
      return;
    }

    const hasSuggestedActions = this.suggestedActions.length > 0;
    const shouldShowSuggestedActions =
      hasSuggestedActions &&
      (this.suggestedActions.some((item) => item.kind === "task") ||
        this.activePanelActionId === "none");
    if (shouldShowSuggestedActions) {
      this.renderSuggestedActionsCard();
    }

    switch (this.activePanelActionId) {
      case "breathing":
        this.renderBreathingCard();
        break;
      case "grounding_see_five":
      case "grounding_touch":
      case "grounding_listen":
        this.renderGroundingActionCard();
        break;
      case "thirty_minute_replay":
        this.renderReplayCard();
        break;
      case "gentle_clarify":
        this.renderGentleClarifyCard();
        break;
      case "long_text_intake":
        this.renderLongTextIntakeCard();
        break;
      case "internship_requirement_overload":
        this.renderInternshipRequirementOverloadCard();
        break;
      case "micro_action_deck":
        this.renderMicroActionDeckCard();
        break;
      default:
        if (!shouldShowSuggestedActions) {
          this.renderIdleCard();
        }
        break;
    }

    this.renderDetailsSections();
  }

  private renderHighRiskPanel(): void {
    if (!this.panelEl) {
      return;
    }

    const card = this.createPanelSectionCard(this.panelEl, "先把安全放前面");
    this.createPanelText(
      card,
      "现在先不放普通行动卡，也不做回放或随机小动作。先把安全放在最前面。"
    );

    if (this.latestQuickAnalysis?.nextStep) {
      this.createPanelText(card, this.latestQuickAnalysis.nextStep);
    }
  }

  private renderIdleCard(): void {
    if (!this.panelEl) {
      return;
    }

    const card = this.createPanelSectionCard(this.panelEl, "先不用急着做");
    this.createPanelText(
      card,
      "不想做也没关系。你可以先继续说一点点，或者等右侧出现更像你的那张卡。"
    );

    if (this.latestRecommendedAction?.reason) {
      this.createPanelText(
        card,
        `如果要碰一下，方向会更像：${this.latestRecommendedAction.reason}`
      );
    }

  }

  private renderSuggestedActionsCard(): void {
    if (!this.panelEl || this.suggestedActions.length === 0) {
      return;
    }

    const card = this.createPanelSectionCard(this.panelEl, this.suggestedActionsTitle);

    const listEl = card.createDiv();
    listEl.style.display = "grid";
    listEl.style.gap = "8px";
    listEl.style.width = "100%";
    listEl.style.maxWidth = "100%";
    listEl.style.position = "relative";

    this.suggestedActions.forEach((item) => {
      const itemShell = listEl.createDiv();
      itemShell.style.display = "grid";
      itemShell.style.gap = item.kind === "task" ? "6px" : "0";

      const buttonEl = itemShell.createEl("button");
      buttonEl.style.textAlign = "center";
      buttonEl.style.padding = "10px 14px";
      buttonEl.style.width = "100%";
      buttonEl.style.minHeight = "40px";
      buttonEl.style.borderRadius = "14px";
      buttonEl.style.border =
        item.status === "completed"
          ? "1px solid rgba(102, 139, 119, 0.30)"
          : item.status === "selected"
            ? "1px solid rgba(76, 107, 95, 0.36)"
            : "1px solid rgba(118,128,145,0.12)";
      buttonEl.style.background =
        item.status === "completed"
          ? "rgba(226, 237, 231, 0.98)"
          : item.status === "selected"
            ? "rgba(220, 232, 227, 0.96)"
            : "rgba(255,255,255,0.92)";
      buttonEl.style.color = "#23303a";
      buttonEl.style.display = "flex";
      buttonEl.style.flexDirection = "row";
      buttonEl.style.alignItems = "center";
      buttonEl.style.justifyContent = "center";
      buttonEl.style.gap = "0";
      buttonEl.style.position = "relative";
      buttonEl.style.whiteSpace = "normal";
      buttonEl.style.lineHeight = "1.5";
      buttonEl.addEventListener("click", () => {
        this.handleSuggestedActionClick(item.id);
      });

      const titleEl = buttonEl.createEl("span", {
        text: item.status === "completed" ? `✓ ${item.label}` : item.label,
      });
      titleEl.style.fontSize = "14px";
      titleEl.style.fontWeight = "600";
      titleEl.style.lineHeight = "1.5";

      if (item.kind === "task") {
        const journalRow = itemShell.createDiv();
        journalRow.style.display = "flex";
        journalRow.style.alignItems = "center";
        journalRow.style.gap = "8px";
        journalRow.style.justifyContent = "center";
        journalRow.style.fontSize = "12px";
        journalRow.style.color = "#6f7b84";

        const checkboxEl = journalRow.createEl("input", {
          attr: { type: "checkbox" },
        });
        checkboxEl.checked = !!item.addToJournal;
        checkboxEl.addEventListener("click", (event) => {
          event.stopPropagation();
        });
        checkboxEl.addEventListener("change", () => {
          this.toggleSuggestedActionJournal(item.id, checkboxEl.checked);
        });

        journalRow.createEl("span", { text: "放进日记" });
      }
    });
  }

  private renderBreathingCard(): void {
    if (!this.panelEl) {
      return;
    }

    const card = this.createPanelSectionCard(this.panelEl, "先稳一下呼吸");
    this.createPanelText(
      card,
      this.latestRecommendedAction?.reason ||
        "现在更像是一下子太满了，先把呼吸拉稳一点会更有用。"
    );

    const duplicatedLead = card.querySelector("p");
    duplicatedLead?.remove();

    const mountEl = card.createDiv();
    this.breathingWidget = new BreathingWidget(mountEl, {
      app: this.app,
      configuredAudioFolder: this.plugin.settings.groundingAudioFolder,
      audioFolders: this.getGroundingAudioFolders(),
      inhaleSeconds:
        typeof this.latestRecommendedAction?.payload?.inhaleSeconds === "number"
          ? this.latestRecommendedAction.payload.inhaleSeconds
          : 4,
      exhaleSeconds:
        typeof this.latestRecommendedAction?.payload?.exhaleSeconds === "number"
          ? this.latestRecommendedAction.payload.exhaleSeconds
          : 6,
      cycles:
        typeof this.latestRecommendedAction?.payload?.cycles === "number"
          ? this.latestRecommendedAction.payload.cycles
          : 4,
      onFinish: () => {
        this.completeLocalAction({
          actionType: "breathing",
          userMessage: "我先跟着呼了一轮。",
          hiddenContext: "[用户通过右侧行动卡“呼吸”先做了一轮呼吸]",
          nextPanelActionId: "breathing",
          archiveActionLabel: "跟着呼了一轮气",
          archiveActionType: "breathing",
        });
      },
    });

    const actionRow = this.createActionRow(card);
    this.createActionButton(actionRow, "先这样，继续", async () => {
      this.completeLocalAction({
        actionType: "breathing",
        userMessage: "我先跟着呼了一轮。",
        hiddenContext: "[用户通过右侧行动卡“呼吸”先做了一轮呼吸]",
        nextPanelActionId: "breathing",
        archiveActionLabel: "跟着呼了一轮气",
        archiveActionType: "breathing",
      });
    });
    this.createActionButton(actionRow, "换成落地", () => {
      this.applyLocalPanelState("grounding_see_five");
      this.renderActionPanel();
    });
  }

  private renderGroundingActionCard(): void {
    if (!this.panelEl) {
      return;
    }

    const variant = panelActionIdToGroundingVariant(this.activePanelActionId);
    const card = this.createPanelSectionCard(this.panelEl, "先把注意力放下来一点");
    const mountEl = card.createDiv();

    if (variant === "touch") {
      this.touchWidget = new TouchWidget(mountEl, {
        onSwapAction: () => {
          this.activePanelActionId = cycleGroundingPanelAction(this.activePanelActionId);
          this.renderActionPanel();
        },
        onContinue: (values: string[]) => {
          this.completeLocalAction({
            actionType: "touch",
            userMessage: `我先摸到了：${values.join("、")}。`,
            hiddenContext: `[用户通过右侧行动卡“触感落地”写下了：${values.join("；")}]`,
            nextPanelActionId: "grounding_touch",
            archiveActionLabel: "碰到一个真实的东西",
            archiveActionType: "grounding",
          });
        },
      });
    } else if (variant === "listen") {
      this.listenWidget = new ListenWidget(mountEl, {
        app: this.app,
        configuredAudioFolder: this.plugin.settings.groundingAudioFolder,
        configuredImageFolder: this.plugin.settings.groundingImageFolder,
        audioFolders: this.getGroundingAudioFolders(),
        imageFolders: this.getGroundingImageFolders(),
        musicVolume: this.plugin.settings.musicVolume,
        generatedSoundVolume: this.plugin.settings.generatedSoundVolume,
        initialTab:
          this.lastListenTabId === "generated_sound" ||
          this.lastListenTabId === "online_radio" ||
          this.lastListenTabId === "my_music" ||
          this.lastListenTabId === "surrounding_sound"
            ? this.lastListenTabId
            : this.latestRecommendedAction?.type === "sound" &&
                this.latestRecommendedAction.payload?.defaultTab === "my_music"
              ? "my_music"
              : "surrounding_sound",
        onTabChange: (tabId) => {
          this.lastListenTabId = tabId;
        },
        onSwapAction: () => {
          this.activePanelActionId = cycleGroundingPanelAction(this.activePanelActionId);
          this.renderActionPanel();
        },
        enableOnlineSound: this.plugin.settings.enableOnlineSound,
        trustedOnlineSoundUrls: this.plugin.settings.trustedOnlineSoundUrls,
        generatedSoundPresets: this.plugin.settings.generatedSoundPresets,
        onOpenSettings: async () => {
          const settingManager = this.app as App & {
            setting?: {
              open: () => void;
              openTabById?: (id: string) => void;
            };
          };
          settingManager.setting?.open();
          settingManager.setting?.openTabById?.(this.plugin.manifest.id);
        },
        onSaveGeneratedPreset: async (preset) => {
          this.lastListenTabId = "generated_sound";
          const list = this.plugin.settings.generatedSoundPresets ?? [];
          this.plugin.settings.generatedSoundPresets = [
            ...list.filter(
              (item) =>
                !(
                  item.name === preset.name &&
                  item.preset === preset.preset &&
                  item.duration === preset.duration
                )
            ),
            preset,
          ];
          await this.plugin.saveSettings();
          this.showSoftCelebration("✓ 已经记下来了。", {
            anchor: "modal-center",
            key: `generated-preset-${preset.name}`,
            durationMs: 2100,
          });
          this.setStatus("这个声音设置已经先记下来了，不会默认发给 MoodNest。");
        },
        onDeleteGeneratedPreset: async (preset) => {
          this.lastListenTabId = "generated_sound";
          const list = this.plugin.settings.generatedSoundPresets ?? [];
          this.plugin.settings.generatedSoundPresets = list.filter((item) => {
            const itemId = item.id ?? item.name;
            const presetId = preset.id ?? preset.name;
            return itemId !== presetId;
          });
          await this.plugin.saveSettings();
          this.setStatus("已经从常用声音里移走了。");
        },
        onContinue: (submission: ListenCardSubmission) => {
          if (submission.tabId === "my_music") {
            this.completeLocalAction({
              actionType: "listen",
              userMessage: `我先听了一小段音乐，感觉：${submission.values.join("、")}。`,
              hiddenContext: `[用户通过右侧行动卡“我的音乐”写下了听感：${submission.values.join("；")}]`,
              nextPanelActionId: "grounding_listen",
              archiveActionLabel: "听了一小段音乐",
              archiveActionType: "grounding",
            });
            return;
          }

          this.completeLocalAction({
            actionType: "listen",
            userMessage: `我先听到了：${submission.values.join("、")}。`,
            hiddenContext: `[用户通过右侧行动卡“身边声音”写下了：${submission.values.join("；")}]`,
            nextPanelActionId: "grounding_listen",
            archiveActionLabel: "听了一个身边的声音",
            archiveActionType: "grounding",
          });
        },
      });
    } else {
      this.seeFiveWidget = new SeeFiveWidget(mountEl, {
        app: this.app,
        configuredImageFolder: this.plugin.settings.groundingImageFolder,
        imageFolders: this.getGroundingImageFolders(),
        onSwapAction: () => {
          this.activePanelActionId = cycleGroundingPanelAction(this.activePanelActionId);
          this.renderActionPanel();
        },
        onContinue: (values: string[]) => {
          this.completeLocalAction({
            actionType: "see",
            userMessage: `我先看到了：${values.join("、")}。`,
            hiddenContext: `[用户通过右侧行动卡“看见 5 样东西”写下了：${values.join("；")}]`,
            nextPanelActionId: "grounding_see_five",
            archiveActionLabel: "看了一眼眼前的东西",
            archiveActionType: "grounding",
          });
        },
      });
    }

    return;
  }

  private renderReplayCard(): void {
    if (!this.panelEl) {
      return;
    }

    const card = this.createPanelSectionCard(this.panelEl, "30 分钟回放");
    this.createPanelText(
      card,
      "可以多选。就这些也可以继续，不用替自己解释。"
    );

    const optionWrap = card.createDiv();
    optionWrap.style.display = "grid";
    optionWrap.style.gap = "8px";

    REPLAY_OPTIONS.forEach((option) => {
      const selected = this.replaySelectedIds.has(option.id);
      const optionButton = optionWrap.createEl("button", { text: option.label });
      optionButton.style.textAlign = "left";
      optionButton.style.padding = "12px 14px";
      optionButton.style.borderRadius = "12px";
      optionButton.style.border = selected
        ? "1px solid rgba(76, 107, 95, 0.38)"
        : "1px solid rgba(118, 128, 145, 0.12)";
      optionButton.style.background = selected
        ? "rgba(220, 232, 227, 0.96)"
        : "rgba(255,255,255,0.90)";
      optionButton.style.color = "#23303a";
      optionButton.style.lineHeight = "1.5";
      optionButton.addEventListener("click", () => {
        if (selected) {
          this.replaySelectedIds.delete(option.id);
        } else {
          this.replaySelectedIds.add(option.id);
        }
        this.renderActionPanel();
      });
    });

    const primaryRow = this.createActionRow(card);
    const continueButton = this.createActionButton(primaryRow, "就这些，继续", async () => {
      const selectedIds = Array.from(this.replaySelectedIds);
      const userMessage = buildReplayUserMessage(selectedIds);
      const hiddenContext = buildReplayHiddenContext(selectedIds);

      this.completeLocalAction({
        actionType: "micro_action",
        userMessage,
        hiddenContext,
        assistantMessage: "好，我们先不逼自己解释，先甩一个更小的动作就行。",
        nextPanelActionId: "micro_action_deck",
      });
    });
    continueButton.disabled = this.replaySelectedIds.size === 0;

    const secondaryRow = this.createActionRow(card);
    this.createActionButton(secondaryRow, "换成随机小动作", () => {
      this.applyLocalPanelState("micro_action_deck");
      this.renderActionPanel();
    });
  }

  private renderGentleClarifyCard(): void {
    if (!this.panelEl) {
      return;
    }

    const card = this.createPanelSectionCard(this.panelEl, "你现在更像哪一种？");
    this.createPanelText(card, "先不用解释很多，点一个最接近的就好。");

    const optionWrap = card.createDiv();
    optionWrap.style.display = "grid";
    optionWrap.style.gap = "8px";

    GENTLE_CLARIFY_OPTIONS.forEach((option) => {
      const optionButton = optionWrap.createEl("button", { text: option.label });
      optionButton.style.textAlign = "left";
      optionButton.style.padding = "12px 14px";
      optionButton.style.borderRadius = "12px";
      optionButton.style.border = "1px solid rgba(118, 128, 145, 0.12)";
      optionButton.style.background = "rgba(255,255,255,0.90)";
      optionButton.style.color = "#23303a";
      optionButton.style.lineHeight = "1.5";
      optionButton.addEventListener("click", () => {
        void this.handleActionCardOptionSelect(option);
      });
    });
  }

  private getActionPayloadOptions(): ActionPayloadChoiceOption[] {
    const rawOptions = this.latestRecommendedAction?.payload?.options;
    if (!Array.isArray(rawOptions)) {
      return [];
    }

    return rawOptions.filter((option): option is ActionPayloadChoiceOption => {
      if (!option || typeof option !== "object") {
        return false;
      }

      const candidate = option as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.label === "string" &&
        typeof candidate.payloadMessage === "string" &&
        typeof candidate.hiddenContext === "string" &&
        typeof candidate.assistantReply === "string"
      );
    });
  }

  private async handleActionCardOptionSelect(
    option: ActionPayloadChoiceOption
  ): Promise<void> {
    this.feedbackMessage = null;
    this.postActionBridge = null;
    this.applyLocalPanelState("none");

    const actionContext: ActionCardContext | undefined = option.actionContext
      ? {
          ...option.actionContext,
          sourceTextSnapshot:
            option.actionContext.sourceTextSnapshot ??
            this.findLatestMeaningfulUserText(),
        }
      : undefined;

    await this.submitUserTurn(option.payloadMessage, {
      hiddenContext: option.hiddenContext,
      actionContext,
    });
  }

  private findLatestMeaningfulUserText(): string | undefined {
    const latestUserTurn = [...this.chatHistory]
      .reverse()
      .find(
        (turn) =>
          turn.role === "user" &&
          turn.source === "chat" &&
          !turn.actionContext &&
          turn.content.trim().length > 0
      );

    return latestUserTurn?.content.trim() || undefined;
  }

  private renderLongTextIntakeCard(): void {
    if (!this.panelEl) {
      return;
    }

    const card = this.createPanelSectionCard(
      this.panelEl,
      this.latestRecommendedAction?.title || "你想先怎么处理这段？"
    );
    this.createPanelText(
      card,
      this.latestRecommendedAction?.reason ||
        "我先帮你接住这段内容，你只要选一个处理方式。"
    );

    const optionWrap = card.createDiv();
    optionWrap.style.display = "grid";
    optionWrap.style.gap = "8px";

    this.getActionPayloadOptions().forEach((option) => {
      const optionButton = optionWrap.createEl("button", { text: option.label });
      optionButton.style.textAlign = "left";
      optionButton.style.padding = "12px 14px";
      optionButton.style.borderRadius = "12px";
      optionButton.style.border = "1px solid rgba(118, 128, 145, 0.12)";
      optionButton.style.background = "rgba(255,255,255,0.90)";
      optionButton.style.color = "#23303a";
      optionButton.style.lineHeight = "1.5";
      optionButton.addEventListener("click", () => {
        void this.handleActionCardOptionSelect(option);
      });
    });
  }

  private renderInternshipRequirementOverloadCard(): void {
    if (!this.panelEl) {
      return;
    }

    const card = this.createPanelSectionCard(
      this.panelEl,
      this.latestRecommendedAction?.title || "先从哪里拆？"
    );
    this.createPanelText(
      card,
      this.latestRecommendedAction?.reason ||
        "我先不让你重新整理，你只要点一个最接近的入口就好。"
    );

    const optionWrap = card.createDiv();
    optionWrap.style.display = "grid";
    optionWrap.style.gap = "8px";

    INTERNSHIP_REQUIREMENT_OVERLOAD_OPTIONS.forEach((option) => {
      const optionButton = optionWrap.createEl("button", { text: option.label });
      optionButton.style.textAlign = "left";
      optionButton.style.padding = "12px 14px";
      optionButton.style.borderRadius = "12px";
      optionButton.style.border = "1px solid rgba(118, 128, 145, 0.12)";
      optionButton.style.background = "rgba(255,255,255,0.90)";
      optionButton.style.color = "#23303a";
      optionButton.style.lineHeight = "1.5";
      optionButton.addEventListener("click", () => {
        void this.handleActionCardOptionSelect(option);
      });
    });
  }

  private renderMicroActionDeckCard(): void {
    if (!this.panelEl) {
      return;
    }

    const card = this.createPanelSectionCard(this.panelEl, "甩一个很小的动作");
    this.createPanelText(
      card,
      this.latestRecommendedAction?.type === "micro_action_deck"
        ? this.latestRecommendedAction.reason
        : "你可以自己挑一个，也可以点“🎲 甩一个”。不需要做完整，只要够轻就行。"
    );

    if (!this.currentMicroActionId) {
      const listEl = card.createDiv();
      listEl.style.display = "grid";
      listEl.style.gridTemplateColumns = "1fr 1fr";
      listEl.style.gap = "8px";

      MICRO_ACTION_POOL.forEach((item) => {
        const buttonEl = listEl.createEl("button", { text: item.label });
        buttonEl.style.textAlign = "left";
        buttonEl.style.padding = "12px 14px";
        buttonEl.style.borderRadius = "12px";
        buttonEl.style.border = "1px solid rgba(118,128,145,0.12)";
        buttonEl.style.background = "rgba(255,255,255,0.90)";
        buttonEl.style.color = "#23303a";
        buttonEl.style.lineHeight = "1.5";
        buttonEl.addEventListener("click", () => {
          this.currentMicroActionId = item.id;
          this.microActionStarted = false;
          this.renderActionPanel();
        });
      });

      const actionRow = this.createActionRow(card);
      this.createActionButton(actionRow, "🎲 甩一个", () => {
        this.currentMicroActionId = getRandomMicroAction().id;
        this.microActionStarted = false;
        this.renderActionPanel();
      });
      return;
    }

    const currentAction = getMicroActionById(this.currentMicroActionId);
    if (!currentAction) {
      this.currentMicroActionId = null;
      this.renderActionPanel();
      return;
    }

    const selectedCard = card.createDiv();
    selectedCard.style.padding = "14px";
    selectedCard.style.borderRadius = "14px";
    selectedCard.style.background = "rgba(255,255,255,0.92)";
    selectedCard.style.border = "1px solid rgba(118,128,145,0.12)";
    selectedCard.style.marginBottom = "10px";

    const selectedTitle = selectedCard.createEl("p", { text: currentAction.label });
    selectedTitle.style.margin = "0";
    selectedTitle.style.fontSize = "15px";
    selectedTitle.style.fontWeight = "600";
    selectedTitle.style.color = "#23303a";

    const selectedDesc = selectedCard.createEl("p", {
      text: this.microActionStarted
        ? "就做这一点，做完再点“我做完了”就可以。"
        : "这张如果够轻，就只做它一小下。",
    });
    selectedDesc.style.margin = "8px 0 0 0";
    selectedDesc.style.fontSize = "13px";
    selectedDesc.style.lineHeight = "1.6";
    selectedDesc.style.color = "#66717b";

    const primaryRow = this.createActionRow(card);
    this.createActionButton(primaryRow, "我做这个", () => {
      this.microActionStarted = true;
      this.feedbackMessage = null;
      this.renderActionPanel();
    });
    this.createActionButton(primaryRow, "太难了，换一个更轻的", () => {
      this.currentMicroActionId = getLighterMicroAction(
        this.currentMicroActionId ?? undefined
      ).id;
      this.microActionStarted = false;
      this.renderActionPanel();
    });
    this.createActionButton(primaryRow, "我做完了", () => {
      this.recordCompletedAction(currentAction);
    });

    const secondaryRow = this.createActionRow(card);
    this.createActionButton(secondaryRow, "🎲 甩一个", () => {
      this.currentMicroActionId = getRandomMicroAction(
        this.currentMicroActionId ?? undefined
      ).id;
      this.microActionStarted = false;
      this.renderActionPanel();
    });
    this.createActionButton(secondaryRow, "换个小动作", () => {
      this.currentMicroActionId = null;
      this.microActionStarted = false;
      this.renderActionPanel();
    });
  }

  private renderDetailsSections(): void {
    if (!this.panelEl) {
      return;
    }

    if (this.latestQuickAnalysis) {
      const quickCard = this.createPanelSectionCard(this.panelEl, "详细信息");
      const detailsEl = quickCard.createEl("details");
      detailsEl.style.fontSize = "14px";

      const summaryEl = detailsEl.createEl("summary", { text: "展开 quick analysis" });
      summaryEl.style.cursor = "pointer";
      summaryEl.style.color = "#4d5a64";
      summaryEl.style.fontWeight = "600";

      const bodyEl = detailsEl.createDiv();
      bodyEl.style.marginTop = "12px";
      this.createPanelText(bodyEl, `核心：${this.latestQuickAnalysis.corePain}`);
      this.createPanelText(bodyEl, `当前更需要：${this.latestQuickAnalysis.currentNeed}`);
      this.createPanelText(bodyEl, `下一步：${this.latestQuickAnalysis.nextStep}`);
      this.createPanelText(bodyEl, `风险等级：${this.latestQuickAnalysis.riskLevel}`);
    }

    if (this.latestFinalResult) {
      const finalCard = this.createPanelSectionCard(this.panelEl, "归档前摘要");
      const detailsEl = finalCard.createEl("details");
      detailsEl.style.fontSize = "14px";

      const summaryEl = detailsEl.createEl("summary", { text: "展开最终结果" });
      summaryEl.style.cursor = "pointer";
      summaryEl.style.color = "#4d5a64";
      summaryEl.style.fontWeight = "600";

      const bodyEl = detailsEl.createDiv();
      bodyEl.style.marginTop = "12px";
      this.createPanelText(bodyEl, `总结：${this.latestFinalResult.analysis.summary}`);
      this.createPanelText(bodyEl, `回复：${this.latestFinalResult.reply.message}`);
      if (this.latestFinalResult.reply.followUpPrompt) {
        this.createPanelText(
          bodyEl,
          `追问：${this.latestFinalResult.reply.followUpPrompt}`
        );
      }
    }
  }

  private async handleSendMessage(): Promise<void> {
    const message = this.inputEl?.value.trim() ?? "";
    if (!message) {
      new Notice("先写一句再发也可以。");
      return;
    }

    await this.submitUserTurn(message, { clearInput: true });
  }

  private async submitUserTurn(
    message: string,
    options?: {
      hiddenContext?: string;
      actionContext?: ActionCardContext;
      clearInput?: boolean;
      forcePanelActionId?: PanelActionId | null;
    }
  ): Promise<void> {
    if (this.isSending || this.isReplying || this.isTranscribing) {
      new Notice("正在处理中，稍等一下就好。");
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    const requestId = this.createRequestId();
    this.pendingRequestId = requestId;
    this.isSending = true;
    this.isReplying = true;
    this.feedbackMessage = null;
    this.postActionBridge = null;
    this.updateActionButtons();

    const userTurn: ChatTurn = {
      role: "user",
      content: trimmedMessage,
      createdAt: new Date().toISOString(),
      hiddenContext: options?.hiddenContext,
      actionContext: options?.actionContext,
      source: "chat",
    };

    this.chatHistory.push(userTurn);

    if (options?.clearInput && this.inputEl) {
      this.inputEl.value = "";
      this.adjustInputHeight();
    }

    this.renderChatHistory();
    this.setStatus("MoodNest 正在回你。");

    try {
      const previousPanelActionId = this.activePanelActionId;
      const requestMessage = options?.hiddenContext
        ? `${trimmedMessage}\n${options.hiddenContext}`
        : trimmedMessage;

      const result = await this.plugin.agentService.replyTurn(
        requestMessage,
        this.chatHistory
      );

      if (this.pendingRequestId !== requestId) {
        return;
      }

      this.latestQuickAnalysis = result.quickAnalysis;
      this.latestRecommendedAction = result.recommendedAction;
      const suggestionBundle: ReturnType<EmotionLogModal["buildSuggestedActions"]> =
        result.quickAnalysis.riskLevel === "high"
          ? { title: null, items: [] as SuggestedActionState[] }
          : this.buildSuggestedActions(result.recommendedAction, trimmedMessage);
      this.suggestedActionsTitle = suggestionBundle.title;
      this.suggestedActions = suggestionBundle.items;

      const baseReply = this.stripRepeatedActionHint(
        result.replyText,
        result.recommendedAction,
        previousPanelActionId
      );
      const replyText =
        suggestionBundle.replyHint && !/右边|右侧/.test(baseReply)
          ? `${baseReply}\n\n${suggestionBundle.replyHint}`
          : baseReply;

      this.chatHistory.push({
        role: "assistant",
        content: replyText,
        createdAt: new Date().toISOString(),
        source: "chat",
      });

      this.applyPanelStateAfterReply(options?.forcePanelActionId ?? null);
      if (suggestionBundle.suppressPanelAction) {
        this.activePanelActionId = "none";
      }
      this.renderChatHistory();
      this.renderActionPanel();
      this.setStatus("如果右侧那张卡不合适，也可以直接忽略，继续说就行。");
    } catch (error) {
      if (this.pendingRequestId !== requestId) {
        return;
      }

      console.error(error);
      new Notice("这次没接上，我们再试一次。");
      this.setStatus("刚刚那次没有成功，你可以直接重发。");
    } finally {
      if (this.pendingRequestId === requestId) {
        this.pendingRequestId = null;
      }
      this.isSending = false;
      this.isReplying = false;
      this.updateActionButtons();
    }
  }

  private async handleToggleRecording(): Promise<void> {
    if (this.isTranscribing || this.isReplying) {
      new Notice("等这一轮回复结束后再录也可以。");
      return;
    }

    if (!this.isRecording) {
      try {
        await this.speechService.startRecording();
        this.isRecording = true;
        this.updateActionButtons();
        this.setStatus("正在录音。说完再点一次就会转文字。");
      } catch (error) {
        console.error(error);
        new Notice("录音没有成功启动。");
      }
      this.updateActionButtons();
      return;
    }

    try {
      this.isTranscribing = true;
      this.updateActionButtons();
      const audioBlob = await this.speechService.stopRecording();
      this.isRecording = false;
      this.setStatus("正在转写录音。");

      this.updateActionButtons();
      const transcript = await this.plugin.asrService.transcribeAudio(audioBlob);
      if (this.inputEl) {
        const original = this.inputEl.value.trim();
        this.inputEl.value = original ? `${original}\n${transcript}` : transcript;
        this.adjustInputHeight();
      }

      this.pendingAudioBlobs.push(audioBlob);
      this.setStatus("录音已经转成文字了，你可以再改一下再发。");
      new Notice("录音转写完成。");
    } catch (error) {
      console.error(error);
      this.isRecording = false;
      new Notice("录音或转写失败了。");
      this.setStatus("这次录音没有成功，可以再试一次。");
    } finally {
      this.isTranscribing = false;
      this.updateActionButtons();
    }
  }

  private async handleFinishAndArchive(): Promise<void> {
    if (this.isArchiving) {
      return;
    }

    if (this.isReplying || this.isRecording || this.isTranscribing) {
      new Notice("等这一步结束后再归档。");
      return;
    }

    if (this.chatHistory.length === 0) {
      new Notice("还没有内容可以归档。");
      return;
    }

    this.isArchiving = true;
    this.feedbackMessage = null;
    this.setArchiveProgress("整理对话", 1, 4);
    this.updateActionButtons();
    this.setStatus("正在整理并归档这次记录。");

    try {
      const fullConversationText = this.buildConversationText();
      this.setArchiveProgress("生成摘要", 2, 4);
      const finalResult = await this.plugin.agentService.run(fullConversationText);
      this.latestFinalResult = finalResult;
      this.renderActionPanel();

      let finalText = `# 情绪记录\n\n${fullConversationText}`;

      this.setArchiveProgress("保存录音", 3, 4);
      if (this.shouldArchiveAudio && this.pendingAudioBlobs.length > 0) {
        const audioEmbeds: string[] = [];
        for (const blob of this.pendingAudioBlobs) {
          const path = await this.plugin.archiveService.saveAudioBlob(blob);
          audioEmbeds.push(`![[${path}]]`);
        }

        if (audioEmbeds.length > 0) {
          finalText += `\n\n## 录音附件\n${audioEmbeds.join("\n")}`;
        }
      }

      this.setArchiveProgress("写入笔记", 4, 4);
      const entry = await this.plugin.archiveService.createEmotionLog(
        finalText,
        finalResult,
        this.completedActions,
        this.getSuggestedActionsForArchive()
      );

      this.setArchiveProgress("✓ 已保存", 4, 4);
      new Notice(`已归档到：${entry.archivePath}`);
      this.setStatus("这次记录已经归档好了。");
      this.updateActionButtons();
      this.archiveCloseTimerId = window.setTimeout(() => {
        this.close();
      }, 600);
    } catch (error) {
      console.error(error);
      this.isArchiving = false;
      this.setArchiveProgress("刚才没有保存成功，可以再试一次。", 0, 0);
      new Notice("归档失败了。");
      this.setStatus("这次归档没有成功，可以再试一次。");
      this.updateActionButtons();
    }
  }

  private buildConversationText(): string {
    return this.chatHistory
      .map((turn) =>
        `${turn.role === "user" ? "用户" : "MoodNest"}：${turn.content}`
      )
      .join("\n");
  }

  private applyPanelStateAfterReply(
    forcePanelActionId: PanelActionId | null
  ): void {
    if (this.latestQuickAnalysis?.riskLevel === "high") {
      this.activePanelActionId = "none";
      this.suggestedActions = [];
      this.suggestedActionsTitle = null;
      this.replaySelectedIds.clear();
      this.currentMicroActionId = null;
      this.microActionStarted = false;
      return;
    }

    if (forcePanelActionId) {
      this.activePanelActionId = forcePanelActionId;
      if (forcePanelActionId !== "thirty_minute_replay") {
        this.replaySelectedIds.clear();
      }
      if (forcePanelActionId !== "micro_action_deck") {
        this.currentMicroActionId = null;
        this.microActionStarted = false;
      }
      return;
    }

    this.activePanelActionId = derivePanelActionId(this.latestRecommendedAction);

    if (this.activePanelActionId !== "thirty_minute_replay") {
      this.replaySelectedIds.clear();
    }

    if (this.activePanelActionId !== "micro_action_deck") {
      this.currentMicroActionId = null;
      this.microActionStarted = false;
    }
  }

  private applyLocalPanelState(panelActionId: PanelActionId): void {
    this.activePanelActionId = panelActionId;

    if (panelActionId !== "thirty_minute_replay") {
      this.replaySelectedIds.clear();
    }

    if (panelActionId !== "micro_action_deck") {
      this.currentMicroActionId = null;
      this.microActionStarted = false;
    }
  }

  private getGroundingAudioFolders(): string[] {
    return Array.from(new Set(GROUNDING_AUDIO_FOLDERS.map((value) => value.trim())));
  }

  private getGroundingImageFolders(): string[] {
    return Array.from(new Set(GROUNDING_IMAGE_FOLDERS.map((value) => value.trim())));
  }

  private getGroundingLeadText(
    variant: ReturnType<typeof panelActionIdToGroundingVariant>
  ): string {
    if (variant === "touch") {
      return "先碰到一个真实的东西。点一个能摸到的，或者自己写一个。";
    }

    if (variant === "listen") {
      return "先听见一个声音。不用听完，也不用分辨得很清楚。";
    }

    return "先看一眼身边。随便一个颜色、边缘、光影都可以，写 1 个就够。";
  }

  private buildPostActionBridge(actionType: LocalActionType): PostActionBridgeState {
    switch (actionType) {
      case "breathing":
        return {
          actionType,
          localReply:
            "✓ 做到了一小步。你已经先让身体慢下来一点。现在不用马上解释原因，只看一下：紧张是轻了一点、差不多，还是还很明显？",
          options: [
            {
              id: "breathing-lighter",
              label: "轻一点了",
              nextPanelActionId: "micro_action_deck",
              message: "可以，我们就顺着这点缝隙，走一个更轻的小动作。",
            },
            {
              id: "breathing-similar",
              label: "差不多",
              nextPanelActionId: "grounding_see_five",
              message: "那我们先不分析原因，换一个更贴地的小动作看看。",
            },
            {
              id: "breathing-tight",
              label: "还是很紧",
              nextPanelActionId: "grounding_touch",
              message: "那先别逼自己解释，换成更直接一点的触感落地也可以。",
            },
            {
              id: "breathing-chat",
              label: "我想继续说",
              focusInput: true,
              clearAction: true,
              status: "你可以接着在左侧说一句，现在不用急着把感受整理完整。",
            },
          ],
        };
      case "see":
        return {
          actionType,
          localReply:
            "✓ 可以，就一个画面也够了。这个动作不是为了描述得多好，而是先让注意力从脑子里的紧张，落到眼前一个具体的东西上。现在你可以感觉一下：紧张有没有轻一点点，还是还是一样？",
          options: [
            {
              id: "see-lighter",
              label: "轻一点了",
              focusInput: true,
              clearAction: true,
              status: "有一点松动就够了。你要是想说，左侧接着写一句就行。",
            },
            {
              id: "see-same",
              label: "还是一样",
              nextPanelActionId: "grounding_touch",
              message: "那我们换成更直接一点的触感落地试试。",
            },
            {
              id: "see-chat",
              label: "更想说出来",
              focusInput: true,
              clearAction: true,
              status: "好，那就顺着这点感觉继续说，不用一下子讲很多。",
            },
            {
              id: "see-swap",
              label: "换个动作",
              nextPanelActionId: "grounding_touch",
              message: "我们换个动作，不用卡在同一张卡上。",
            },
          ],
        };
      case "listen":
        return {
          actionType,
          localReply:
            "✓ 听到一点就够了。刚才这一步是在帮注意力从脑子里出来，落到一个真实声音上。现在你更想继续听一会儿，还是回来说说刚才卡住的地方？",
          options: [
            {
              id: "listen-continue",
              label: "继续这个",
              nextPanelActionId: "grounding_listen",
              message: "可以，就继续这一小段，不用急着切走。",
            },
            {
              id: "listen-swap",
              label: "换个动作",
              nextPanelActionId: "grounding_touch",
              message: "那我们换一个更贴地的小动作。",
            },
            {
              id: "listen-chat",
              label: "回来说说",
              focusInput: true,
              clearAction: true,
              status: "好，你可以直接回到左侧说刚才最卡的那一点。",
            },
            {
              id: "listen-pause",
              label: "先停一下",
              focusInput: true,
              clearAction: true,
              status: "先停在这里也可以。你想继续说时，再从左侧接上就好。",
            },
          ],
        };
      case "touch":
        return {
          actionType,
          localReply:
            "✓ 可以，碰到一个真实的东西就够了。这个动作是在提醒身体：我现在在这里，不必只跟着脑子里的紧张跑。",
          options: [
            {
              id: "touch-continue",
              label: "继续这个",
              nextPanelActionId: "grounding_touch",
              message: "可以，就继续停在这个触感上，不用做多。",
            },
            {
              id: "touch-swap",
              label: "换个动作",
              nextPanelActionId: "grounding_see_five",
              message: "那我们换一个更轻一点的落地方向。",
            },
            {
              id: "touch-chat",
              label: "回来说说",
              focusInput: true,
              clearAction: true,
              status: "好，你可以回到左侧，把刚才卡住的那一点慢慢说出来。",
            },
            {
              id: "touch-pause",
              label: "先停一下",
              focusInput: true,
              clearAction: true,
              status: "先停一下也可以，不用急着接下一步。",
            },
          ],
        };
      case "micro_action":
        return {
          actionType,
          localReply:
            "✓ 做到了一个很小的动作。刚才这一步是在帮你先从卡住里挪开一点点，不用一下子做很多。",
          options: [
            {
              id: "micro-next",
              label: "再来一个",
              nextPanelActionId: "micro_action_deck",
              message: "可以，再挑一个更轻的小动作就好。",
            },
            {
              id: "micro-chat",
              label: "回来说说",
              focusInput: true,
              clearAction: true,
              status: "好，你可以顺着这一点点松动，回左侧继续说。",
            },
            {
              id: "micro-pause",
              label: "先停一下",
              focusInput: true,
              clearAction: true,
              status: "先停在这里也可以，这一步已经算数了。",
            },
          ],
        };
      case "generated_sound":
      default:
        return {
          actionType,
          localReply:
            "✓ 先让自己听到一点声音就很好。现在如果想继续说，也可以顺着这点松动回到左侧。",
          options: [
            {
              id: "generated-chat",
              label: "回来说说",
              focusInput: true,
              clearAction: true,
              status: "你可以回到左侧继续说，不用把感受整理完整。",
            },
          ],
        };
    }
  }

  private buildSuggestedActions(
    action: RecommendedAction | null,
    userMessage: string
  ): {
    title: string | null;
    items: SuggestedActionState[];
    replyHint?: string;
    suppressPanelAction?: boolean;
  } {
    if (this.latestQuickAnalysis?.riskLevel === "high") {
      return { title: null, items: [] };
    }

    if (
      action?.type === "long_text_intake" ||
      action?.type === "internship_requirement_overload" ||
      action?.type === "gentle_clarify"
    ) {
      return { title: null, items: [] };
    }

    const message = userMessage.trim();
    const taskRequested =
      /(接下来该怎么做|帮我拆解|拆成几步|完成作业|我要复习|不知道从哪里开始|事情好多|任务好多|先做什么)/.test(
        message
      );
    if (taskRequested) {
      const taskItems = /(作业|复习|题目|考试|课程)/.test(message)
        ? [
            "打开作业要求",
            "写下 3 个小步骤",
            "先做 10 分钟",
            "标出不会的地方",
          ]
        : ["把事情写成 3 个小步骤", "先做 10 分钟", "只开一个文件或页面", "把最卡的一步圈出来"];

      return {
        title: "下一步可以这样拆",
        items: taskItems.map((label, index) => ({
          id: `task-${index}`,
          kind: "task",
          label,
          status: "suggested",
          addToJournal: index < 2,
          createdFrom: "task_breakdown",
        })),
        replyHint: "我先把它拆成几步放在右边，你觉得能接受的，可以勾进今天的记录里。",
        suppressPanelAction: true,
      };
    }

    const supportRequested =
      /(推荐我几个方法|推荐几个方法|推荐几个|缓解紧张|转移注意力|看点什么|想看点什么|想听点什么|想听声音|想听音乐|放点音乐|我需要缓解紧张)/.test(
        message
      );
    if (!supportRequested) {
      return { title: null, items: [] };
    }

    if (action?.type === "breathing") {
      return {
        title: null,
        replyHint: "右边我放了几个很轻的选择，你不用全做，只点一个现在不排斥的就好。",
        items: [
          {
            id: "suggest-breathing",
            kind: "support_action",
            label: "跟一两轮呼吸",
            actionType: "breathing",
            panelActionId: "breathing",
            status: "selected",
            createdFrom: "assistant_recommendation",
          },
          {
            id: "suggest-see",
            kind: "support_action",
            label: "看一张舒服的图片",
            actionType: "grounding",
            panelActionId: "grounding_see_five",
            status: "suggested",
            createdFrom: "assistant_recommendation",
          },
          {
            id: "suggest-touch",
            kind: "support_action",
            label: "碰到一个真实的东西",
            actionType: "grounding",
            panelActionId: "grounding_touch",
            status: "suggested",
            createdFrom: "assistant_recommendation",
          },
          {
            id: "suggest-chat",
            kind: "support_action",
            label: "继续说一句",
            status: "suggested",
            includeInArchive: false,
            createdFrom: "assistant_recommendation",
          },
        ],
      };
    }

    if (action?.type === "sound") {
      const defaultTab =
        action.payload?.defaultTab === "my_music" ? "my_music" : "surrounding_sound";
      return {
        title: null,
        replyHint: "右边我放了几个很轻的选择，你不用全做，只点一个现在不排斥的就好。",
        items: [
          {
            id: "suggest-sound-primary",
            kind: "support_action",
            label: defaultTab === "my_music" ? "放一小段音乐" : "听一点身边声音",
            actionType: "sound",
            panelActionId: "grounding_listen",
            status: "selected",
            soundDefaultTab: defaultTab,
            createdFrom: "assistant_recommendation",
          },
          {
            id: "suggest-see",
            kind: "support_action",
            label: "看一张舒服的图片",
            actionType: "grounding",
            panelActionId: "grounding_see_five",
            status: "suggested",
            createdFrom: "assistant_recommendation",
          },
          {
            id: "suggest-micro",
            kind: "support_action",
            label: "随机一个很小的动作",
            actionType: "micro_action_deck",
            panelActionId: "micro_action_deck",
            status: "suggested",
            createdFrom: "assistant_recommendation",
          },
          {
            id: "suggest-chat",
            kind: "support_action",
            label: "继续说一句",
            status: "suggested",
            includeInArchive: false,
            createdFrom: "assistant_recommendation",
          },
        ],
      };
    }

    return {
      title: null,
      replyHint: "右边我放了几个很轻的选择，你不用全做，只点一个现在不排斥的就好。",
      items: [
        {
          id: "suggest-visual",
          kind: "support_action",
          label: "看一张舒服的图片",
          actionType: "grounding",
          panelActionId: "grounding_see_five",
          status: action?.payload?.variant === "see_five" ? "selected" : "suggested",
          createdFrom: "assistant_recommendation",
        },
        {
          id: "suggest-listen",
          kind: "support_action",
          label: "听一点声音",
          actionType: "sound",
          panelActionId: "grounding_listen",
          status: "suggested",
          createdFrom: "assistant_recommendation",
        },
        {
          id: "suggest-micro",
          kind: "support_action",
          label: "随机一个很小的动作",
          actionType: "micro_action_deck",
          panelActionId: "micro_action_deck",
          status: "suggested",
          createdFrom: "assistant_recommendation",
        },
        {
          id: "suggest-chat",
          kind: "support_action",
          label: "继续说一句",
          status: "suggested",
          includeInArchive: false,
          createdFrom: "assistant_recommendation",
        },
      ],
    };
  }
  private handleSuggestedActionClick(id: string): void {
    const target = this.suggestedActions.find((item) => item.id === id);
    if (!target) {
      return;
    }

    if (target.kind === "task") {
      this.suggestedActions = this.suggestedActions.map((item) =>
        item.id === id
          ? {
              ...item,
              status: item.status === "selected" ? "suggested" : "selected",
            }
          : item
      );
      const current = this.suggestedActions.find((item) => item.id === id);
      this.setStatus(
        current?.status === "selected"
          ? "这一步先记下来了。要写进日记的话，可以顺手勾一下。"
          : "先把这一步放回备选里也可以。"
      );
      this.renderActionPanel();
      return;
    }

    this.suggestedActions = this.suggestedActions.map((item) => ({
      ...item,
      status:
        item.id === id
          ? item.status === "completed"
            ? "completed"
            : "selected"
          : item.status === "completed"
            ? "completed"
            : "suggested",
    }));

    if (target.label === "继续说一句") {
      this.inputEl?.focus();
      this.setStatus("你可以直接回到左侧继续说，不用先把右侧做完。");
      this.renderActionPanel();
      return;
    }

    if (target.panelActionId) {
      this.activePanelActionId = target.panelActionId;
      if (
        target.actionType === "sound" &&
        this.latestRecommendedAction?.type === "sound" &&
        target.soundDefaultTab
      ) {
        this.latestRecommendedAction = {
          ...this.latestRecommendedAction,
          payload: {
            ...(this.latestRecommendedAction.payload ?? {}),
            defaultTab: target.soundDefaultTab,
          },
        };
      }
      this.renderActionPanel();
    }
  }
  private markSuggestedActionCompleted(panelActionId: PanelActionId): void {
    this.suggestedActions = this.suggestedActions.map((item) => {
      if (item.panelActionId !== panelActionId) {
        return item;
      }

      return {
        ...item,
        status: "completed",
      };
    });
  }

  private getSuggestedActionsForArchive(): SuggestedActionArchiveItem[] {
    return this.suggestedActions
      .filter((item) => item.includeInArchive !== false && item.status !== "dismissed")
      .map((item) => ({
        label: item.label,
        kind: item.kind,
        status: item.status,
        addToJournal: item.addToJournal,
      }));
  }

  private toggleSuggestedActionJournal(id: string, checked: boolean): void {
    this.suggestedActions = this.suggestedActions.map((item) =>
      item.id === id
        ? {
            ...item,
            addToJournal: checked,
            status: checked && item.status === "suggested" ? "selected" : item.status,
          }
        : item
    );
    this.setStatus(checked ? "这一步会一起写进今天的记录里。" : "先不写进日记也可以。");
    this.renderActionPanel();
  }
  private renderPostActionBridge(
    parent: HTMLElement,
    bridge: PostActionBridgeState
  ): void {
    const card = parent.createDiv();
    card.style.marginBottom = "12px";
    card.style.padding = "14px";
    card.style.borderRadius = "16px";
    card.style.background =
      "linear-gradient(135deg, rgba(221, 236, 228, 0.96), rgba(248, 244, 236, 0.94))";
    card.style.border = "1px solid rgba(122, 149, 135, 0.20)";
    card.style.boxShadow = "0 10px 22px rgba(65, 92, 83, 0.08)";

    const textEl = card.createEl("p", { text: bridge.localReply });
    textEl.style.margin = "0";
    textEl.style.fontSize = "14px";
    textEl.style.lineHeight = "1.7";
    textEl.style.color = "#314039";

    if (bridge.options.length === 0) {
      return;
    }

    const row = this.createActionRow(card);
    row.className = "moodnest-action-footer moodnest-bridge-actions";
    row.style.gap = "6px";
    row.style.marginTop = "10px";
    bridge.options.forEach((option) => {
      const buttonEl = this.createActionButton(row, option.label, () => {
        this.handlePostActionBridgeOption(option);
      });
      buttonEl.className = "moodnest-flow-button moodnest-bridge-button";
      buttonEl.style.height = "36px";
      buttonEl.style.minWidth = "72px";
      buttonEl.style.padding = "0 10px";
      buttonEl.style.fontSize = "14px";
      buttonEl.style.borderRadius = "14px";
    });
  }

  private handlePostActionBridgeOption(option: PostActionBridgeOption): void {
    this.feedbackMessage = option.message ?? null;
    this.postActionBridge = null;

    if (option.nextPanelActionId) {
      this.applyLocalPanelState(option.nextPanelActionId);
      this.renderActionPanel();
    } else if (option.clearAction && this.latestQuickAnalysis?.riskLevel !== "high") {
      this.applyLocalPanelState("none");
      this.renderActionPanel();
    } else {
      this.renderActionPanel();
    }

    if (option.focusInput) {
      this.inputEl?.focus();
    }

    if (option.status) {
      this.setStatus(option.status);
    }
  }

  private completeLocalAction(options: {
    actionType: LocalActionType;
    userMessage: string;
    hiddenContext: string;
    nextPanelActionId: PanelActionId;
    assistantMessage?: string;
    celebrationMessage?: string;
    archiveActionLabel?: string;
    archiveActionType?: RecommendedAction["type"];
  }): void {
    if (this.isSending || this.isReplying || this.isTranscribing) {
      new Notice("等这一轮结束后，我们再继续这个小动作。");
      return;
    }

    const bridge = this.buildPostActionBridge(options.actionType);
    const assistantMessage = options.assistantMessage ?? bridge.localReply;
    this.feedbackMessage = null;
    this.postActionBridge = bridge;
    if (options.archiveActionLabel) {
      this.completedActions.push({
        actionId: `local-${options.actionType}-${Date.now()}`,
        actionType: options.archiveActionType ?? "grounding",
        actionLabel: options.archiveActionLabel,
        completedAt: new Date().toISOString(),
        source: "action_panel",
      });
    }
    this.chatHistory.push({
      role: "user",
      content: options.userMessage,
      createdAt: new Date().toISOString(),
      hiddenContext: options.hiddenContext,
      source: "local_action",
    });
    this.chatHistory.push({
      role: "assistant",
      content: assistantMessage,
      createdAt: new Date().toISOString(),
      source: "local_action",
    });

    this.applyLocalPanelState(options.nextPanelActionId);
    this.markSuggestedActionCompleted(options.nextPanelActionId);
    this.renderChatHistory();
    this.showSoftCelebration(options.celebrationMessage ?? "✓ 做到了一小步。", {
      anchor: "modal-center",
      key: `complete-${options.actionType}-${options.nextPanelActionId ?? "none"}`,
      durationMs: 2100,
    });
    this.renderActionPanel();
    this.setStatus("这些小动作先只记在本地。你想继续说时，直接回到左侧就好。");
  }

  private async continueWithMoodNest(): Promise<void> {
    const draftMessage = this.inputEl?.value.trim() ?? "";
    if (!draftMessage) {
      this.inputEl?.focus();
      this.setStatus("你可以接着在左侧说一句。现在不用急着把右侧小动作发给 MoodNest。");
      return;
    }

    await this.submitUserTurn(draftMessage, {
      clearInput: true,
    });
  }

  private pauseCurrentActionAndFocusInput(): void {
    if (this.isArchiving) {
      return;
    }

    if (this.latestQuickAnalysis?.riskLevel !== "high") {
      this.feedbackMessage = null;
      this.postActionBridge = null;
      this.applyLocalPanelState("none");
      this.renderActionPanel();
    }

    this.inputEl?.focus();
    this.setStatus("没关系，你可以继续说一点点。");
  }

  private getContinueMessageForAction(): string {
    switch (this.activePanelActionId) {
      case "breathing":
        return "我先跟着呼了一口气，可以继续聊。";
      case "grounding_see_five":
      case "grounding_touch":
      case "grounding_listen":
        return "我先把注意力拉回来一点点了，可以继续聊。";
      case "thirty_minute_replay":
        return "我先点了一下回放，可以继续聊。";
      case "micro_action_deck":
        return "我先做了一点点，可以继续聊。";
      default:
        return "可以继续聊。";
    }
  }

  private stripRepeatedActionHint(
    replyText: string,
    action: RecommendedAction,
    previousPanelActionId: PanelActionId
  ): string {
    if (previousPanelActionId !== derivePanelActionId(action)) {
      return replyText;
    }

    const hintMap: Partial<Record<RecommendedAction["type"], string>> = {
      breathing: "右边我放了一个很轻的呼吸卡，不用做满，先跟一两轮就行。",
      sound:
        "右边我给你放了一个很轻的声音卡。你可以先听身边的声音，或者放一小段音乐。",
      thirty_minute_replay:
        "右边我给你放了一个很轻的回放卡，你不用解释很多，先点一个最像的就行。",
      micro_action_deck:
        "右边有一组很小的动作卡，不用全做，只要甩一个最轻的就可以。",
    };

    const hint = hintMap[action.type];
    if (!hint) {
      return replyText;
    }

    const suffix = `\n\n${hint}`;
    return replyText.endsWith(suffix)
      ? replyText.slice(0, -suffix.length).trim()
      : replyText;
  }

  private recordCompletedAction(action: { id: string; label: string }): void {
    const log: ActionCompletionLog = {
      actionId: action.id,
      actionType: "micro_action_deck",
      actionLabel: action.label,
      completedAt: new Date().toISOString(),
      source: "action_panel",
    };

    this.completedActions.push(log);
    this.currentMicroActionId = null;
    this.microActionStarted = false;
    this.completeLocalAction({
      actionType: "micro_action",
      userMessage: `我做完了：${action.label}。`,
      hiddenContext: `[用户通过右侧行动卡完成了一个小动作：${action.label}]`,
      nextPanelActionId: "micro_action_deck",
    });
  }

  private renderFeedbackBanner(parent: HTMLElement, text: string): void {
    const banner = parent.createDiv();
    banner.style.marginBottom = "12px";
    banner.style.padding = "12px 14px";
    banner.style.borderRadius = "14px";
    banner.style.background =
      "linear-gradient(135deg, rgba(221, 236, 228, 0.96), rgba(244, 248, 241, 0.92))";
    banner.style.border = "1px solid rgba(122, 149, 135, 0.20)";
    banner.style.boxShadow = "0 10px 22px rgba(65, 92, 83, 0.08)";
    banner.style.transition = "transform 180ms ease, opacity 180ms ease";

    const textEl = banner.createEl("p", { text });
    textEl.style.margin = "0";
    textEl.style.fontSize = "14px";
    textEl.style.lineHeight = "1.6";
    textEl.style.color = "#2f4038";
    textEl.style.fontWeight = "600";
  }

  private renderSoftCelebrationBanner(parent: HTMLElement, text: string): void {
    const banner = parent.createDiv();
    banner.className = "moodnest-soft-celebration";
    banner.dataset.theme = this.softCelebrationTheme;
    this.appendSoftCelebrationParticles(
      banner,
      18 + Math.floor(Math.random() * 6)
    );

    const textEl = banner.createEl("p", { text });
    textEl.style.margin = "0";
    textEl.style.position = "relative";
    textEl.style.zIndex = "1";
    textEl.style.fontSize = "13px";
    textEl.style.lineHeight = "1.5";
    textEl.style.color = "#345044";
    textEl.style.fontWeight = "600";
  }

  private appendSoftCelebrationParticles(
    parent: HTMLElement,
    count: number
  ): void {
    const glyphMap: Record<
      "flower" | "star" | "sparkle" | "leaf",
      string[]
    > = {
      flower: ["✿", "❀", "❁"],
      star: ["✦", "✧", "✩"],
      sparkle: ["✦", "✧", "✺", "✷"],
      leaf: ["❦", "❧", "☙"],
    };
    const glyphs = glyphMap[this.softCelebrationTheme];
    for (let index = 0; index < count; index += 1) {
      const particle = parent.createDiv({ cls: "moodnest-soft-particle" });
      particle.setText(glyphs[Math.floor(Math.random() * glyphs.length)] ?? "✦");
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.35;
      const distance = 64 + Math.random() * 46;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      const palette = [
        "rgba(201, 225, 198, 0.90)",
        "rgba(246, 240, 219, 0.90)",
        "rgba(244, 223, 205, 0.90)",
        "rgba(226, 232, 242, 0.90)",
        "rgba(235, 221, 230, 0.90)",
      ];
      particle.style.setProperty("--tx", `${tx.toFixed(1)}px`);
      particle.style.setProperty("--ty", `${ty.toFixed(1)}px`);
      particle.style.setProperty("--delay", `${(Math.random() * 0.18).toFixed(2)}s`);
      particle.style.setProperty("--size", `${(8 + Math.random() * 8).toFixed(1)}px`);
      particle.style.setProperty(
        "--rotation",
        `${Math.round(Math.random() * 120 - 60)}deg`
      );
      const particleColor =
        palette[Math.floor(Math.random() * palette.length)] ??
        "rgba(201, 225, 198, 0.90)";
      particle.style.setProperty("--particle-color", particleColor);
    }
  }

  private positionSoftCelebrationBurst(
    burstEl: HTMLElement,
    anchor: "right-panel" | "modal-center"
  ): void {
    if (anchor === "modal-center") {
      burstEl.style.left = "50%";
      burstEl.style.top = "52%";
      burstEl.style.transform = "translate(-50%, -50%)";
      return;
    }

    if (!this.contentEl || !this.rightPanelHostEl) {
      burstEl.style.left = "74%";
      burstEl.style.top = "120px";
      burstEl.style.transform = "translate(-50%, 0)";
      return;
    }

    const contentRect = this.contentEl.getBoundingClientRect();
    const panelRect = this.rightPanelHostEl.getBoundingClientRect();
    const centerX = panelRect.left - contentRect.left + panelRect.width / 2;
    const topY = panelRect.top - contentRect.top + 84;
    burstEl.style.left = `${centerX}px`;
    burstEl.style.top = `${topY}px`;
    burstEl.style.transform = "translate(-50%, 0)";
  }

  private createPanelSectionCard(
    parent: HTMLElement,
    title?: string | null
  ): HTMLDivElement {
    const card = parent.createDiv();
    card.style.marginBottom = "16px";
    card.style.padding = "16px 16px 14px 16px";
    card.style.borderRadius = "18px";
    card.style.border = "1px solid rgba(118,128,145,0.10)";
    card.style.background = "rgba(255,255,255,0.66)";
    card.style.boxShadow = "0 8px 20px rgba(30,35,45,0.04)";

    if (title) {
      const titleEl = card.createEl("h3", { text: title });
      titleEl.style.margin = "0 0 10px 0";
      titleEl.style.fontSize = "16px";
      titleEl.style.color = "#24313a";
    }

    return card;
  }

  private createPanelText(parent: HTMLElement, text: string): void {
    const p = parent.createEl("p", { text });
    p.style.margin = "0 0 10px 0";
    p.style.fontSize = "14px";
    p.style.lineHeight = "1.7";
    p.style.color = "#5f6b76";
  }

  private createActionRow(parent: HTMLElement): HTMLDivElement {
    const row = parent.createDiv({ cls: "moodnest-action-footer" });
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginTop = "12px";
    return row;
  }

  private createActionButton(
    parent: HTMLElement,
    text: string,
    onClick: () => void | Promise<void>
  ): HTMLButtonElement {
    const buttonEl = parent.createEl("button", {
      text,
      cls: "moodnest-flow-button",
    });
    buttonEl.style.height = "40px";
    buttonEl.style.minWidth = "72px";
    buttonEl.style.borderRadius = "14px";
    buttonEl.style.border = "1px solid rgba(118,128,145,0.12)";
    buttonEl.style.background = "rgba(255,255,255,0.92)";
    buttonEl.style.color = "#23303a";
    buttonEl.style.padding = "0 14px";
    buttonEl.style.fontSize = "14px";
    buttonEl.style.fontWeight = "500";
    buttonEl.style.whiteSpace = "nowrap";
    buttonEl.style.flex = "0 0 auto";
    buttonEl.addEventListener("click", () => {
      void onClick();
    });
    return buttonEl;
  }

  private applyPanelCardStyle(el: HTMLElement): void {
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.minHeight = "0";
    el.style.minWidth = "0";
    el.style.maxWidth = "100%";
    el.style.boxSizing = "border-box";
    el.style.borderRadius = "22px";
    el.style.overflow = "hidden";
    el.style.background = "rgba(255, 255, 255, 0.72)";
    el.style.backdropFilter = "blur(10px)";
    el.style.border = "1px solid rgba(110, 120, 135, 0.14)";
    el.style.boxShadow =
      "0 18px 40px rgba(34, 42, 52, 0.08), inset 0 1px 0 rgba(255,255,255,0.55)";
  }

  private styleIconButton(buttonEl: HTMLButtonElement, primary = false): void {
    buttonEl.style.height = "48px";
    buttonEl.style.minWidth = "56px";
    buttonEl.style.borderRadius = "14px";
    buttonEl.style.border = "1px solid rgba(118,128,145,0.10)";
    buttonEl.style.boxShadow = "0 8px 16px rgba(30,35,45,0.05)";
    buttonEl.style.fontWeight = "600";
    buttonEl.style.fontSize = "16px";
    buttonEl.style.color = "#23303a";
    buttonEl.style.background = primary ? "#dbe7e2" : "#f1eee8";
  }

  private destroyWidgets(): void {
    this.breathingWidget?.destroy();
    this.breathingWidget = null;
    this.seeFiveWidget?.destroy();
    this.seeFiveWidget = null;
    this.touchWidget?.destroy();
    this.touchWidget = null;
    this.listenWidget?.destroy();
    this.listenWidget = null;
  }

  private setStatus(text: string): void {
    this.statusEl?.setText(text);
  }

  private setArchiveProgress(
    label: string | null,
    step = 0,
    total = 0
  ): void {
    this.archiveProgressLabel = label;
    this.archiveProgressStep = step;
    this.archiveProgressTotal = total;
    this.updateArchiveProgressUi();
  }

  private updateArchiveProgressUi(): void {
    if (
      !this.archiveProgressWrapEl ||
      !this.archiveProgressLabelEl ||
      !this.archiveProgressBarEl
    ) {
      return;
    }

    const shouldShow = this.isArchiving || !!this.archiveProgressLabel;
    this.archiveProgressWrapEl.style.display = shouldShow ? "grid" : "none";
    if (!shouldShow) {
      return;
    }

    this.archiveProgressLabelEl.setText(this.archiveProgressLabel ?? "");

    const isSuccess = (this.archiveProgressLabel ?? "").startsWith("✓");
    const isFailure =
      !!this.archiveProgressLabel &&
      this.archiveProgressLabel.includes("没有保存成功");

    this.archiveProgressLabelEl.style.color = isSuccess
      ? "#4f6a5d"
      : isFailure
        ? "#8a5a5a"
        : "#66717b";

    const ratio =
      this.archiveProgressTotal > 0
        ? Math.min(1, this.archiveProgressStep / this.archiveProgressTotal)
        : isSuccess
          ? 1
          : 0;
    this.archiveProgressBarEl.style.width = `${Math.round(ratio * 100)}%`;
    this.archiveProgressBarEl.style.opacity = isFailure ? "0.35" : "1";
  }

  private showSoftCelebration(
    message: string,
    options?: {
      anchor?: "right-panel" | "modal-center";
      key?: string;
      durationMs?: number;
    }
  ): void {
    const celebrationKey = options?.key ?? message;
    const now = Date.now();
    if (
      this.lastCelebrationKey === celebrationKey &&
      now - this.lastCelebrationAt < 2000
    ) {
      return;
    }
    this.lastCelebrationKey = celebrationKey;
    this.lastCelebrationAt = now;
    this.softCelebrationMessage = message;
    this.softCelebrationAnchor = options?.anchor ?? "right-panel";
    const themes: Array<"flower" | "star" | "sparkle" | "leaf"> = [
      "flower",
      "star",
      "sparkle",
      "leaf",
    ];
    this.softCelebrationTheme =
      themes[Math.floor(Math.random() * themes.length)] ?? "flower";
    if (this.softCelebrationTimerId !== null) {
      window.clearTimeout(this.softCelebrationTimerId);
    }

    this.floatingCelebrationEl?.remove();
    this.floatingCelebrationEl = null;
    const overlayRoot = this.celebrationOverlayRootEl ?? this.contentEl;
    if (overlayRoot) {
      const toastEl = overlayRoot.createDiv({ cls: "moodnest-soft-toast" });
      toastEl.dataset.theme = this.softCelebrationTheme;
      this.positionSoftCelebrationBurst(toastEl, this.softCelebrationAnchor);
      this.appendSoftCelebrationParticles(
        toastEl,
        18 + Math.floor(Math.random() * 11)
      );
      const textEl = toastEl.createEl("p", { text: message });
      textEl.style.margin = "0";
      textEl.style.position = "relative";
      textEl.style.zIndex = "2";
      textEl.style.fontSize = "13px";
      textEl.style.fontWeight = "600";
      textEl.style.color = "#314039";
      this.floatingCelebrationEl = toastEl;
    }
    this.softCelebrationTimerId = window.setTimeout(() => {
      this.softCelebrationMessage = null;
      this.softCelebrationTimerId = null;
      this.floatingCelebrationEl?.remove();
      this.floatingCelebrationEl = null;
    }, options?.durationMs ?? 2300);
  }

  private ensureUiStyles(): void {
    const styleEl = this.contentEl.createEl("style");
    styleEl.setText(`
.moodnest-celebration-overlay {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 20;
}

.moodnest-soft-celebration {
  margin-bottom: 12px;
  position: relative;
  overflow: visible;
  padding: 10px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(233, 242, 236, 0.98), rgba(248, 245, 236, 0.96));
  border: 1px solid rgba(128, 158, 145, 0.20);
  box-shadow: 0 10px 22px rgba(61, 88, 78, 0.09);
  animation: moodnest-soft-pop 2.35s ease;
}

.moodnest-soft-toast {
  position: absolute;
  z-index: 12;
  overflow: visible;
  min-width: 160px;
  max-width: 220px;
  padding: 10px 13px;
  border-radius: 15px;
  background: linear-gradient(135deg, rgba(233, 242, 236, 0.98), rgba(248, 245, 236, 0.96));
  border: 1px solid rgba(128, 158, 145, 0.24);
  box-shadow: 0 18px 34px rgba(61, 88, 78, 0.12);
  animation: moodnest-soft-pop 2.35s ease;
  pointer-events: none;
}

.moodnest-soft-particle {
  position: absolute;
  left: 50%;
  top: 50%;
  opacity: 0;
  display: grid;
  place-items: center;
  width: auto;
  height: auto;
  color: var(--particle-color);
  background: transparent;
  box-shadow: none;
  font-size: var(--size);
  line-height: 1;
  text-shadow: 0 2px 10px rgba(255,255,255,0.28);
  animation: moodnest-soft-particle 2.35s ease;
  animation-delay: var(--delay);
  transform-origin: center;
  pointer-events: none;
}

.moodnest-soft-celebration[data-theme="flower"] .moodnest-soft-particle,
.moodnest-soft-toast[data-theme="flower"] .moodnest-soft-particle {
  filter: drop-shadow(0 2px 6px rgba(244, 223, 205, 0.30));
}

.moodnest-soft-celebration[data-theme="star"] .moodnest-soft-particle,
.moodnest-soft-toast[data-theme="star"] .moodnest-soft-particle {
  filter: drop-shadow(0 2px 6px rgba(237, 225, 172, 0.30));
}

.moodnest-soft-celebration[data-theme="sparkle"] .moodnest-soft-particle,
.moodnest-soft-toast[data-theme="sparkle"] .moodnest-soft-particle {
  filter: drop-shadow(0 0 10px rgba(255,255,255,0.22));
}

.moodnest-soft-celebration[data-theme="leaf"] .moodnest-soft-particle,
.moodnest-soft-toast[data-theme="leaf"] .moodnest-soft-particle {
  filter: drop-shadow(0 2px 6px rgba(192, 220, 188, 0.30));
}

.moodnest-chat-history,
.moodnest-chat-message,
.moodnest-chat-bubble,
.moodnest-chat-bubble * {
  user-select: text;
  -webkit-user-select: text;
}

.moodnest-chat-bubble {
  cursor: text;
}

@keyframes moodnest-soft-pop {
  0% {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  18% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  82% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-3px) scale(0.995);
  }
}

@keyframes moodnest-soft-particle {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(var(--rotation)) scale(0.45);
  }
  26% {
    opacity: 1;
    transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rotation)) scale(1.12);
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rotation)) scale(0.88);
  }
}
    `);
  }

  private createRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private scheduleScrollToBottom(): void {
    if (!this.chatListEl || this.pendingScrollFrameId !== null) {
      return;
    }

    this.pendingScrollFrameId = window.requestAnimationFrame(() => {
      this.pendingScrollFrameId = null;
      if (!this.chatListEl) {
        return;
      }
      this.chatListEl.scrollTop = this.chatListEl.scrollHeight;
    });
  }

  private adjustInputHeight(): void {
    if (!this.inputEl) {
      return;
    }

    const maxHeight = 168;
    this.inputEl.style.height = "auto";
    const nextHeight = Math.min(this.inputEl.scrollHeight, maxHeight);
    this.inputEl.style.height = `${Math.max(nextHeight, 44)}px`;
    this.inputEl.style.overflowY =
      this.inputEl.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  private updateActionButtons(): void {
    if (this.sendButtonEl) {
      this.sendButtonEl.disabled =
        this.isArchiving || this.isSending || this.isTranscribing || this.isRecording;
      this.sendButtonEl.setText("➤");
    }

    if (this.recordButtonEl) {
      this.recordButtonEl.disabled =
        this.isArchiving || this.isSending || this.isReplying || this.isTranscribing;
      this.recordButtonEl.setText(this.isRecording ? "⏹️" : "🎙️");
    }

    if (this.archiveAudioCheckboxEl) {
      this.archiveAudioCheckboxEl.disabled = this.isArchiving;
    }

    if (this.pauseActionButtonEl) {
      this.pauseActionButtonEl.disabled = this.isArchiving;
      this.pauseActionButtonEl.style.opacity = this.isArchiving ? "0.6" : "1";
    }

    if (this.finishButtonEl) {
      this.finishButtonEl.disabled =
        this.isArchiving ||
        this.isSending ||
        this.isReplying ||
        this.isRecording ||
        this.isTranscribing;
      this.finishButtonEl.setText(this.isArchiving ? "正在归档…" : "结束并归档");
    }
  }
}
