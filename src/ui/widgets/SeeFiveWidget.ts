import type { App } from "obsidian";

import {
  basenameWithoutExt,
  getGroundingResourceUrl,
  resolveGroundingAssetFiles,
} from "../../services/groundingAssetResolver";
import {
  GROUNDING_IMAGE_FOLDERS,
  GROUNDING_SEE_HINTS,
} from "../actionPanelRegistry";

type SeeFiveWidgetOptions = {
  app: App;
  onContinue: (values: string[]) => void;
  onSwapAction?: () => void | Promise<void>;
  configuredImageFolder?: string;
  imageFolders?: string[];
  hints?: string[];
};

export class SeeFiveWidget {
  private root: HTMLDivElement;
  private inputs: HTMLInputElement[] = [];
  private continueButtonEl: HTMLButtonElement;
  private imageEl: HTMLImageElement;
  private imageCaptionEl: HTMLParagraphElement;
  private imageStatusEl: HTMLParagraphElement;
  private imageHintButtonEl: HTMLButtonElement;
  private imagePaths: string[] = [];
  private currentImagePath = "";
  private imageWarning: string | null = null;

  constructor(mountEl: HTMLElement, private options: SeeFiveWidgetOptions) {
    this.root = mountEl.createDiv();
    this.root.style.display = "grid";
    this.root.style.gap = "12px";

    const introEl = this.root.createEl("p", {
      text: "先看一眼身边。随便一个颜色、边缘、光影都可以。",
    });
    introEl.style.margin = "0";
    introEl.style.fontSize = "14px";
    introEl.style.lineHeight = "1.7";
    introEl.style.color = "#5d6973";

    const previewCard = this.root.createDiv();
    previewCard.style.display = "grid";
    previewCard.style.gap = "10px";
    previewCard.style.padding = "12px";
    previewCard.style.borderRadius = "14px";
    previewCard.style.background = "rgba(255,255,255,0.78)";
    previewCard.style.border = "1px solid rgba(118, 128, 145, 0.12)";

    this.imageEl = previewCard.createEl("img");
    this.imageEl.style.width = "100%";
    this.imageEl.style.height = "148px";
    this.imageEl.style.objectFit = "cover";
    this.imageEl.style.borderRadius = "12px";
    this.imageEl.style.display = "none";
    this.imageEl.alt = "grounding prompt";

    const imageMetaRow = previewCard.createDiv();
    imageMetaRow.style.display = "flex";
    imageMetaRow.style.flexWrap = "wrap";
    imageMetaRow.style.alignItems = "center";
    imageMetaRow.style.justifyContent = "space-between";
    imageMetaRow.style.gap = "8px";

    this.imageCaptionEl = imageMetaRow.createEl("p");
    this.imageCaptionEl.style.margin = "0";
    this.imageCaptionEl.style.fontSize = "13px";
    this.imageCaptionEl.style.fontWeight = "600";
    this.imageCaptionEl.style.color = "#40505a";

    const imageButtonRow = imageMetaRow.createDiv();
    imageButtonRow.style.display = "flex";
    imageButtonRow.style.flexWrap = "wrap";
    imageButtonRow.style.gap = "8px";

    const randomImageButton = imageButtonRow.createEl("button", {
      text: "换张图",
    });
    this.styleSecondaryButton(randomImageButton);
    randomImageButton.title = "换张图";
    randomImageButton.setAttribute("aria-label", "换张图");
    randomImageButton.addEventListener("click", () => {
      this.logLocalEvent("random_image");
      void this.pickRandomImage();
    });

    this.imageHintButtonEl = imageButtonRow.createEl("button", {
      text: "给我提示",
    });
    this.styleSecondaryButton(this.imageHintButtonEl);
    this.imageHintButtonEl.addEventListener("click", () => {
      this.logLocalEvent("use_image_starter");
      this.fillFromImageName();
    });

    const clearButton = imageButtonRow.createEl("button", {
      text: "清空",
    });
    this.styleSecondaryButton(clearButton, true);
    clearButton.addEventListener("click", () => {
      this.logLocalEvent("clear_inputs");
      this.clearInputs();
    });

    this.imageStatusEl = previewCard.createEl("p");
    this.imageStatusEl.style.margin = "0";
    this.imageStatusEl.style.fontSize = "13px";
    this.imageStatusEl.style.lineHeight = "1.6";
    this.imageStatusEl.style.color = "#6b7780";
    this.imageStatusEl.style.display = "none";

    const listEl = this.root.createDiv();
    listEl.style.display = "grid";
    listEl.style.gap = "8px";

    const placeholders = this.getHintPool();
    for (let index = 0; index < 5; index += 1) {
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
      inputEl.placeholder = `比如：${placeholders[index] ?? "眼前的一小块细节"}`;
      inputEl.style.height = "40px";
      inputEl.style.borderRadius = "12px";
      inputEl.style.border = "1px solid rgba(118, 128, 145, 0.14)";
      inputEl.style.padding = "0 12px";
      inputEl.style.background = "rgba(255,255,255,0.92)";
      inputEl.style.color = "#23303a";
      inputEl.style.fontSize = "14px";
      inputEl.addEventListener("input", () => this.updateState());
      inputEl.addEventListener("keydown", (event) =>
        this.handleEnterKey(event, index)
      );
      this.inputs.push(inputEl);
    }

    const actionRow = this.root.createDiv({ cls: "moodnest-action-footer" });
    actionRow.style.display = "flex";
    actionRow.style.alignItems = "center";
    actionRow.style.flexWrap = "wrap";
    actionRow.style.gap = "8px";

    this.continueButtonEl = actionRow.createEl("button", {
      text: "够了，继续",
    });
    this.stylePrimaryButton(this.continueButtonEl, false);
    this.continueButtonEl.addEventListener("click", () => this.submit());

    const swapButton = actionRow.createEl("button", { text: "换个动作" });
    this.styleSecondaryButton(swapButton, true);
    swapButton.addEventListener("click", () => {
      this.logLocalEvent("swap_action");
      void this.options.onSwapAction?.();
    });

    this.updateState();
    void this.loadImages();
  }

  destroy(): void {
    this.root.detach();
    this.inputs = [];
  }

  private stylePrimaryButton(buttonEl: HTMLButtonElement, compact = false): void {
    buttonEl.className = `moodnest-flow-button${compact ? " compact" : ""}`;
    buttonEl.style.height = "40px";
    buttonEl.style.minWidth = compact ? "72px" : "88px";
    buttonEl.style.padding = "0 14px";
    buttonEl.style.borderRadius = "14px";
    buttonEl.style.border = "1px solid rgba(118, 128, 145, 0.12)";
    buttonEl.style.background = "#dce8e3";
    buttonEl.style.color = "#23303a";
    buttonEl.style.fontSize = "14px";
    buttonEl.style.fontWeight = "500";
    buttonEl.style.whiteSpace = "nowrap";
    buttonEl.style.flex = "0 0 auto";
  }

  private styleSecondaryButton(
    buttonEl: HTMLButtonElement,
    compact = false
  ): void {
    buttonEl.className = `moodnest-flow-button${compact ? " compact" : ""}`;
    buttonEl.style.height = "40px";
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

  private logLocalEvent(event: string): void {
    console.debug(`[MoodNest action local] action=see_five event=${event} api=false`);
  }

  private getHintPool(): string[] {
    return this.options.hints?.length
      ? this.options.hints
      : [...GROUNDING_SEE_HINTS];
  }

  private getValues(): string[] {
    return this.inputs
      .map((inputEl) => inputEl.value.trim())
      .filter((value) => value.length > 0);
  }

  private handleEnterKey(event: KeyboardEvent, index: number): void {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (index < this.inputs.length - 1) {
      this.inputs[index + 1]?.focus();
      return;
    }

    if (this.getValues().length > 0) {
      this.submit();
    }
  }

  private fillNextInput(): void {
    const targetIndex = this.inputs.findIndex(
      (inputEl) => inputEl.value.trim().length === 0
    );
    const nextIndex = targetIndex === -1 ? 0 : targetIndex;
    const target = this.inputs[nextIndex];
    if (!target) {
      return;
    }

    const fallbackHints = this.getHintPool();
    const imageName = this.currentImagePath
      ? basenameWithoutExt(this.currentImagePath)
      : "";
    const hint =
      imageName || fallbackHints[nextIndex] || fallbackHints[0] || "桌面边缘";

    target.value = hint;
    const nextTarget = this.inputs[nextIndex + 1] ?? target;
    nextTarget.focus();
    nextTarget.setSelectionRange(nextTarget.value.length, nextTarget.value.length);
    this.updateState();
  }

  private clearInputs(): void {
    this.inputs.forEach((inputEl) => {
      inputEl.value = "";
    });
    this.inputs[0]?.focus();
    this.updateState();
  }

  private fillFromImageName(): void {
    if (!this.currentImagePath) {
      this.fillNextInput();
      return;
    }

    const targetIndex = this.inputs.findIndex(
      (inputEl) => inputEl.value.trim().length === 0
    );
    const nextIndex = targetIndex === -1 ? 0 : targetIndex;
    const target = this.inputs[nextIndex];
    if (!target) {
      return;
    }

    target.value = basenameWithoutExt(this.currentImagePath);
    const nextTarget = this.inputs[nextIndex + 1] ?? target;
    nextTarget.focus();
    nextTarget.setSelectionRange(nextTarget.value.length, nextTarget.value.length);
    this.updateState();
  }

  private submit(): void {
    const values = this.getValues();
    if (values.length === 0) {
      return;
    }

    this.logLocalEvent("continue");
    this.options.onContinue(values);
  }

  private updateState(): void {
    this.continueButtonEl.disabled = this.getValues().length === 0;
    this.imageHintButtonEl.disabled = !this.currentImagePath;
  }

  private async loadImages(): Promise<void> {
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

    this.imageWarning = resolved.warning ?? null;
    this.imagePaths = Array.from(new Set(resolved.files));
    if (this.imagePaths.length === 0) {
      this.currentImagePath = "";
      this.imageEl.style.display = "none";
      this.imageCaptionEl.setText("暂时没找到图片");
      this.imageStatusEl.style.display = "";
      this.imageStatusEl.setText(
        resolved.warning ?? "暂时没找到图片，也可以直接看一眼身边。"
      );
      this.updateState();
      return;
    }

    await this.pickRandomImage();
  }

  private async pickRandomImage(): Promise<void> {
    if (this.imagePaths.length === 0) {
      this.currentImagePath = "";
      this.imageEl.style.display = "none";
      this.imageCaptionEl.setText("暂时没找到图片");
      this.imageStatusEl.setText("暂时没找到图片，也可以直接看一眼身边。");
      this.updateState();
      return;
    }

    const index = Math.floor(Math.random() * this.imagePaths.length);
    const path = this.imagePaths[index] ?? this.imagePaths[0];
    if (!path) {
      return;
    }

    this.currentImagePath = path;
    this.imageEl.style.display = "";
    this.imageEl.src = getGroundingResourceUrl(this.options.app, path) ?? "";
    this.imageCaptionEl.setText(basenameWithoutExt(path));
    if (this.imageWarning) {
      this.imageStatusEl.style.display = "";
      this.imageStatusEl.setText(this.imageWarning);
    } else {
      this.imageStatusEl.style.display = "none";
      this.imageStatusEl.setText("");
    }
    this.updateState();
  }
}
