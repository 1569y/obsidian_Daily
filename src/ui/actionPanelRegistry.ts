import type { ActionCardContext, RecommendedAction } from "../types";

export type GroundingVariant = "see_five" | "touch" | "listen";

export type PanelActionId =
  | "none"
  | "breathing"
  | "grounding_see_five"
  | "grounding_touch"
  | "grounding_listen"
  | "thirty_minute_replay"
  | "gentle_clarify"
  | "long_text_intake"
  | "internship_requirement_overload"
  | "micro_action_deck";

export interface ReplayOption {
  id: "A" | "B" | "C" | "D";
  label: string;
  messageFragment: string;
}

export interface MicroActionItem {
  id: string;
  label: string;
  weight: 1 | 2 | 3;
}

export interface TouchSurfaceOption {
  id: string;
  label: string;
}

export interface GentleClarifyOption {
  id: "inner_load" | "task_load" | "both" | "pause";
  label: string;
  payloadMessage: string;
  hiddenContext: string;
  assistantReply: string;
  actionContext?: ActionCardContext;
}

export interface PanelChoiceOption {
  id: string;
  label: string;
  payloadMessage: string;
  hiddenContext: string;
  assistantReply: string;
  actionContext?: ActionCardContext;
}

const GROUNDING_VARIANT_ORDER: GroundingVariant[] = [
  "see_five",
  "touch",
  "listen",
];

export const GROUNDING_IMAGE_FOLDERS = [
  ".obsidian/plugins/moodnest/Assets/Grounding/see",
];

export const GROUNDING_AUDIO_FOLDERS = [
  ".obsidian/plugins/moodnest/Assets/Grounding/listen",
  ".obsidian/plugins/moodnest/Assets/Grounding/listen/firstaid_listen",
];

export const GROUNDING_SEE_HINTS = [
  "窗帘的褶皱",
  "杯口的反光",
  "桌面边缘",
  "屏幕角落",
  "墙上的一小块影子",
];

export const GROUNDING_LISTEN_HINTS = [
  "空调声",
  "键盘声",
  "外面的车声",
  "风扇声",
  "楼道里的脚步声",
];

export const GROUNDING_TOUCH_HINTS = [
  "桌面边缘",
  "衣服布料",
  "水杯温度",
  "自己的手心",
  "鼠标表面",
];

export const TOUCH_SURFACE_OPTIONS: TouchSurfaceOption[] = [
  { id: "wood", label: "木质桌面" },
  { id: "fabric", label: "织物" },
  { id: "paper", label: "纸张" },
  { id: "glass", label: "玻璃" },
  { id: "hand", label: "自己的手" },
  { id: "device", label: "手机电脑" },
];

export const GENTLE_CLARIFY_OPTIONS: GentleClarifyOption[] = [
  {
    id: "inner_load",
    label: "心里的事太多",
    payloadMessage: "我更像是心里的事太多。",
    hiddenContext: "[用户通过右侧澄清卡片选择了：心里的事太多]",
    actionContext: {
      actionId: "gentle_clarify",
      optionId: "inner_load",
    },
    assistantReply:
      "嗯，那我们先不碰外面的待办，先看“心里装得太满”的部分。\n\n很多时候心里的事太多，不一定是因为事情本身很多，而是里面混着几种感受：担心、委屈、自责、害怕，或者一种说不清的压迫感。\n\n你不用解释完整。你只要看一下，下面哪一个更接近现在的感觉：\n\n1. 我在担心之后会出问题\n2. 我觉得自己哪里都做不好\n3. 我有点委屈，但说不清\n4. 我只是觉得心里很堵、很压",
  },
  {
    id: "task_load",
    label: "眼前要做的事太多",
    payloadMessage: "我更像是眼前要做的事太多。",
    hiddenContext: "[用户通过右侧澄清卡片选择了：眼前要做的事太多]",
    actionContext: {
      actionId: "gentle_clarify",
      optionId: "task_load",
    },
    assistantReply:
      "好，那我们先把它当成“眼前事情太多，脑子排不开”来处理。\n\n现在不用把所有任务都讲清楚。我们先只找一个入口：\n\n1. 事情太多，不知道先做哪个\n2. 有一个任务特别吓人\n3. 怕来不及\n4. 明明有事要做，但身体不想动\n\n你只要选一个最像的就好。",
  },
  {
    id: "both",
    label: "两个都有",
    payloadMessage: "我感觉两个都有。",
    hiddenContext: "[用户通过右侧澄清卡片选择了：两个都有]",
    actionContext: {
      actionId: "gentle_clarify",
      optionId: "both",
    },
    assistantReply:
      "嗯，两个都有的时候会更累，因为一边是心里压着，一边是现实事情也在催。\n\n我们先不急着分清楚谁是主因。你现在可以先选一个处理入口：\n\n1. 先把心里那团乱放轻一点\n2. 先把眼前最急的一件事挑出来\n3. 先不处理，只想缓一缓\n4. 我也不知道，想让你帮我慢慢拆",
  },
  {
    id: "pause",
    label: "说不清，只想先停一下",
    payloadMessage: "我现在说不清，只想先停一下。",
    hiddenContext: "[用户通过右侧澄清卡片选择了：说不清，只想先停一下]",
    actionContext: {
      actionId: "gentle_clarify",
      optionId: "pause",
    },
    assistantReply:
      "可以，那我们就先不分析。\n\n你现在不用解释，也不用马上变好。我们先做一个很小的暂停：把注意力放到你现在坐着/站着的地方，慢慢呼一口气。\n\n如果你愿意，等一下只要回我一个字也可以：‘在’。我会继续陪你慢慢往下走。",
  },
];

export const INTERNSHIP_REQUIREMENT_OVERLOAD_OPTIONS: PanelChoiceOption[] = [
  {
    id: "paste_scary_requirements",
    label: "贴 1-2 条最吓人的要求",
    payloadMessage: "我先贴 1 到 2 条最吓到我的要求。",
    hiddenContext:
      "[用户通过右侧实习要求过载卡片选择了：贴 1-2 条最吓人的要求]",
    actionContext: {
      actionId: "internship_requirement_overload",
      optionId: "paste_scary_requirements",
    },
    assistantReply:
      "好，那我们就先不把整份 JD 都摊开。\n\n你只要把最吓到你的 1 到 2 条要求贴出来，我先帮你判断它们是硬门槛、可以边投边补，还是暂时可以先放一放的。",
  },
  {
    id: "must_vs_bonus",
    label: "判断哪些是必须项",
    payloadMessage: "先帮我判断哪些是必须项。",
    hiddenContext:
      "[用户通过右侧实习要求过载卡片选择了：判断哪些是必须项]",
    actionContext: {
      actionId: "internship_requirement_overload",
      optionId: "must_vs_bonus",
    },
    assistantReply:
      "好，我们先不谈你够不够，只先把岗位要求分层。\n\n很多 JD 会把真正必须项和加分项写在一起。我可以先按“必须项 / 可以边投边补 / 暂时先放一放”这三类帮你拆。",
  },
  {
    id: "gap_check",
    label: "看我还差什么",
    payloadMessage: "帮我看一下我还差什么。",
    hiddenContext:
      "[用户通过右侧实习要求过载卡片选择了：看我还差什么]",
    actionContext: {
      actionId: "internship_requirement_overload",
      optionId: "gap_check",
    },
    assistantReply:
      "可以，我们先不看所有差距，只看最关键的那一两个缺口。\n\n我会先帮你分清：哪些是真的会挡投递的，哪些其实只是现在还不熟、但可以边投边补的。",
  },
  {
    id: "comfort_first",
    label: "先安慰我一下，不分析",
    payloadMessage: "先安慰我一下，先不分析。",
    hiddenContext:
      "[用户通过右侧实习要求过载卡片选择了：先安慰我一下，不分析]",
    actionContext: {
      actionId: "internship_requirement_overload",
      optionId: "comfort_first",
    },
    assistantReply:
      "可以，那我们先不分析。\n\n你现在不是不想处理，而是这些要求一下子堆过来，脑子先被压住了。我们先缓一缓，等你稍微稳一点，再只挑一条最刺眼的来看就好。",
  },
];

export const REPLAY_OPTIONS: ReplayOption[] = [
  {
    id: "A",
    label: "A 一直刷手机，停不下来",
    messageFragment: "一直刷手机停不下来",
  },
  {
    id: "B",
    label: "B 本来有件事不想碰",
    messageFragment: "本来有件事不想碰",
  },
  {
    id: "C",
    label: "C 身体很累，但脑子停不下来",
    messageFragment: "身体很累，但脑子停不下来",
  },
  {
    id: "D",
    label: "D 我也说不清",
    messageFragment: "也说不清",
  },
];

export const MICRO_ACTION_POOL: MicroActionItem[] = [
  { id: "phone_down", label: "把手机反扣 30 秒", weight: 1 },
  { id: "stand_up", label: "站起来 10 秒", weight: 1 },
  { id: "drink_water", label: "喝一口水", weight: 1 },
  { id: "look_window", label: "看一眼窗外", weight: 1 },
  { id: "touch_edge", label: "摸一下桌面边缘", weight: 1 },
  { id: "drop_shoulders", label: "把肩膀放下来", weight: 1 },
  { id: "tidy_one", label: "整理桌面上一件东西", weight: 2 },
  { id: "open_file", label: "打开一个文件但不开始做", weight: 2 },
  { id: "close_tab", label: "关掉一个无关页面", weight: 1 },
  { id: "fill_cup", label: "把水杯装满", weight: 1 },
  { id: "walk_door", label: "走到门口再回来", weight: 2 },
  {
    id: "write_stuck_line",
    label: "写下一句“我现在卡住的是____”",
    weight: 2,
  },
];

export function derivePanelActionId(
  action: RecommendedAction | null
): PanelActionId {
  if (!action || action.type === "none") {
    return "none";
  }

  if (action.type === "grounding") {
    return getGroundingPanelActionId(action.payload?.variant);
  }

  if (action.type === "sound") {
    return "grounding_listen";
  }

  if (action.type === "breathing") {
    return "breathing";
  }

  if (action.type === "thirty_minute_replay") {
    return "thirty_minute_replay";
  }

  if (action.type === "gentle_clarify") {
    return "gentle_clarify";
  }

  if (action.type === "long_text_intake") {
    return "long_text_intake";
  }

  if (action.type === "internship_requirement_overload") {
    return "internship_requirement_overload";
  }

  if (action.type === "micro_action_deck") {
    return "micro_action_deck";
  }

  return "none";
}

export function getGroundingPanelActionId(variant?: unknown): PanelActionId {
  if (variant === "touch") {
    return "grounding_touch";
  }

  if (variant === "listen") {
    return "grounding_listen";
  }

  return "grounding_see_five";
}

export function cycleGroundingPanelAction(
  current: PanelActionId
): PanelActionId {
  const currentVariant = panelActionIdToGroundingVariant(current) ?? "see_five";
  const currentIndex = GROUNDING_VARIANT_ORDER.indexOf(currentVariant);
  const nextVariant =
    GROUNDING_VARIANT_ORDER[
      (currentIndex + 1) % GROUNDING_VARIANT_ORDER.length
    ] ?? "see_five";

  return getGroundingPanelActionId(nextVariant);
}

export function panelActionIdToGroundingVariant(
  panelActionId: PanelActionId
): GroundingVariant | null {
  if (panelActionId === "grounding_touch") {
    return "touch";
  }

  if (panelActionId === "grounding_listen") {
    return "listen";
  }

  if (panelActionId === "grounding_see_five") {
    return "see_five";
  }

  return null;
}

export function getReplayOptionById(id: string): ReplayOption | null {
  return REPLAY_OPTIONS.find((option) => option.id === id) ?? null;
}

export function buildReplayUserMessage(selectedIds: string[]): string {
  const fragments = selectedIds
    .map((id) => getReplayOptionById(id)?.messageFragment ?? "")
    .filter((item) => item.length > 0);

  if (fragments.length === 0) {
    return "";
  }

  return `我更像是：${fragments.join("，")}。`;
}

export function buildReplayHiddenContext(selectedIds: string[]): string {
  const labels = selectedIds
    .map((id) => getReplayOptionById(id)?.label ?? "")
    .filter((item) => item.length > 0);

  if (labels.length === 0) {
    return "";
  }

  return `[用户通过右侧行动卡“30 分钟回放”选择了：${labels.join("；")}]`;
}

export function getMicroActionById(id: string): MicroActionItem | null {
  return MICRO_ACTION_POOL.find((item) => item.id === id) ?? null;
}

export function getRandomMicroAction(
  excludeId?: string,
  maxWeight?: number
): MicroActionItem {
  const pool = MICRO_ACTION_POOL.filter((item) => {
    if (excludeId && item.id === excludeId) {
      return false;
    }

    if (typeof maxWeight === "number" && item.weight > maxWeight) {
      return false;
    }

    return true;
  });

  const candidates = pool.length > 0 ? pool : MICRO_ACTION_POOL;
  const index = Math.floor(Math.random() * candidates.length);
  const selected = candidates[index] ?? MICRO_ACTION_POOL[0];

  if (!selected) {
    throw new Error("Micro action pool is empty.");
  }

  return selected;
}

export function getLighterMicroAction(currentId?: string): MicroActionItem {
  const current = currentId ? getMicroActionById(currentId) : null;
  if (!current) {
    return getRandomMicroAction();
  }

  return getRandomMicroAction(current.id, current.weight);
}
