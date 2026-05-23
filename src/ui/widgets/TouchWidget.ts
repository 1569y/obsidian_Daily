import { GROUNDING_TOUCH_HINTS } from "../actionPanelRegistry";

type TouchWidgetOptions = {
  onContinue: (values: string[]) => void;
  onSwapAction?: () => void | Promise<void>;
};

const TOUCH_PLACEHOLDERS = [
  "桌面有点凉",
  "衣服很软",
  "杯子是硬的",
  "手心有点热",
  "键盘边缘",
];

export class TouchWidget {
  private root: HTMLDivElement;
  private continueButtonEl: HTMLButtonElement;
  private inputs: HTMLInputElement[] = [];

  constructor(mountEl: HTMLElement, private options: TouchWidgetOptions) {
    this.root = mountEl.createDiv();
    this.root.style.display = "grid";
    this.root.style.gap = "12px";

    const headerRow = this.root.createDiv();
    headerRow.style.display = "flex";
    headerRow.style.alignItems = "center";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.gap = "8px";
    headerRow.style.flexWrap = "wrap";

    const titleEl = headerRow.createEl("p", {
      text: "触碰真实的东西",
    });
    titleEl.style.margin = "0";
    titleEl.style.fontSize = "14px";
    titleEl.style.fontWeight = "600";
    titleEl.style.color = "#2c3942";

    const hintButton = headerRow.createEl("button", { text: "给我提示" });
    this.styleSecondaryButton(hintButton, true);
    hintButton.addEventListener("click", () => {
      this.logLocalEvent("starter_hint");
      this.fillNextInput();
    });

    const listEl = this.root.createDiv();
    listEl.style.display = "grid";
    listEl.style.gap = "8px";

    TOUCH_PLACEHOLDERS.forEach((placeholder, index) => {
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
        this.handleEnterKey(event, index)
      );
      this.inputs.push(inputEl);
    });

    const actionRow = this.root.createDiv({ cls: "moodnest-action-footer" });
    actionRow.style.display = "flex";
    actionRow.style.alignItems = "center";
    actionRow.style.gap = "8px";
    actionRow.style.flexWrap = "wrap";

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
    console.debug(`[MoodNest action local] action=touch event=${event} api=false`);
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

  private getValues(): string[] {
    return this.inputs
      .map((inputEl) => inputEl.value.trim())
      .filter((value) => value.length > 0);
  }

  private fillNextInput(): void {
    const values = this.getValues();
    const pool = GROUNDING_TOUCH_HINTS.filter((item) => !values.includes(item));
    const candidates = pool.length > 0 ? pool : GROUNDING_TOUCH_HINTS;
    const hint = candidates[Math.floor(Math.random() * candidates.length)] ?? "桌面边缘";

    const emptyIndex = this.inputs.findIndex(
      (inputEl) => inputEl.value.trim().length === 0
    );
    const nextIndex = emptyIndex === -1 ? 0 : emptyIndex;
    const target = this.inputs[nextIndex];
    if (!target) {
      return;
    }

    target.value = hint;
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
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
  }
}
