import type { RecommendedAction, RiskLevel } from "../types";
import {
  buildInternshipRequirementOverloadReply,
  shouldSuppressDecisionActionCard,
} from "./lowEnergyDecisionPolicy";
import {
  buildLongTextIntakeActionOptions,
  resolveLongTextIntakeReply,
} from "./longTextIntakePolicy";

const NONE_RECOMMENDED_ACTION: RecommendedAction = {
  id: "none",
  type: "none",
  title: "",
  reason: "",
};

const BREATHING_ACTION_PATTERNS: RegExp[] = [
  /缓解紧张/,
  /怎么缓解紧张/,
  /我想缓解紧张/,
  /好紧张/,
  /很紧张/,
  /有点紧张/,
  /我想放松/,
  /放松一下/,
  /我想冷静一下/,
  /冷静一下/,
  /身体很绷/,
  /绷得很紧/,
  /深呼吸/,
  /呼吸一下/,
  /先呼吸/,
  /慢慢呼吸/,
  /我需要呼吸/,
  /我需要深呼吸/,
  /喘不过气/,
  /呼吸乱/,
  /呼吸很乱/,
  /心跳快/,
  /很慌/,
  /慌得不行/,
  /快撑不住/,
  /胸口发紧/,
];

const SOUND_ACTION_PATTERNS: RegExp[] = [
  /听声音/,
  /听点声音/,
  /想听声音/,
  /放点声音/,
  /想听音乐/,
  /听音乐/,
  /放音乐/,
  /背景音/,
  /想听点什么/,
  /想放点音乐/,
  /声音卡/,
];

const SEE_ACTION_PATTERNS: RegExp[] = [
  /我想看点什么/,
  /想看点什么/,
  /看点什么/,
  /想看看图片/,
  /看图片/,
  /看一张图/,
  /想看图/,
  /看点舒服的/,
  /看点绿色的/,
  /看点安静的/,
  /看点不费脑子的/,
];

const SOUND_MUSIC_PATTERNS: RegExp[] = [
  /想听音乐/,
  /听音乐/,
  /放音乐/,
  /想放点音乐/,
];

const REPLAY_STRONG_PATTERNS: RegExp[] = [
  /不知道自己在干什么/,
  /刷了很久手机/,
  /一直刷手机/,
  /越刷越烦/,
  /停不下来/,
  /感觉很空/,
  /很枯燥/,
  /很乏味/,
  /坐着发呆很久/,
  /无法放空自己/,
  /想摆脱这种感觉/,
  /放下手机后还是烦/,
  /喝水后还是烦/,
  /换姿势后还是烦/,
];

const REPLAY_SUPPORT_PATTERNS: RegExp[] = [
  /空转/,
  /发呆/,
  /空空的/,
  /越待越烦/,
  /不知道在干嘛/,
];

const GROUNDING_ACTION_PATTERNS: RegExp[] = [
  /烦/,
  /堵/,
  /注意力飘/,
  /有点麻/,
  /麻麻的/,
  /空空的/,
  /说不上来/,
  /说不出来/,
  /不知道为什么/,
];

const GENTLE_CLARIFY_ACTION_PATTERNS: RegExp[] = [
  /我现在真的很乱/,
  /我现在很乱/,
  /我现在好乱/,
  /脑子很乱/,
  /心里很乱/,
  /好乱/,
  /我不知道怎么办/,
  /我现在有点崩/,
  /我现在很慌/,
  /我现在很焦虑/,
  /我有点撑不住/,
  /我不知道该怎么说/,
  /我不知道怎么说/,
  /我说不清/,
];

const GENTLE_CLARIFY_BLOCK_PATTERNS: RegExp[] = [
  /实习要求好多/,
  /实习要求太多/,
  /岗位要求太多/,
  /招聘要求太多/,
  /jd/i,
  /简历/,
  /ai产品/,
  /ai 产品/,
  /开发实习/,
  /方向/,
  /该投/,
];

const TASK_OVERLOAD_ACTION_PATTERNS: RegExp[] = [
  /任务好多/,
  /一堆事/,
  /不知道先做哪个/,
  /不知道先做什么/,
  /事情很多/,
  /脑子里好多事/,
];

const INTERNSHIP_REQUIREMENT_CARD_OPTIONS = [
  {
    id: "paste_scary_requirements",
    label: "贴 1-2 条最吓人的要求",
    payloadMessage: "我先贴 1 到 2 条最吓到我的要求。",
    hiddenContext:
      "[用户通过右侧实习要求过载卡片选择了：贴 1-2 条最吓人的要求]",
    assistantReply:
      "好，那我们就先不把整份 JD 都摊开。\n\n你只要把最吓到你的 1 到 2 条要求贴出来，我先帮你判断它们是硬门槛、可以边投边补，还是暂时可以先放一放的。",
  },
  {
    id: "must_vs_bonus",
    label: "判断哪些是必须项",
    payloadMessage: "先帮我判断哪些是必须项。",
    hiddenContext:
      "[用户通过右侧实习要求过载卡片选择了：判断哪些是必须项]",
    assistantReply:
      "好，我们先不谈你够不够，只先把岗位要求分层。\n\n很多 JD 会把真正必须项和加分项写在一起。我可以先按“必须项 / 可以边投边补 / 暂时先放一放”这三类帮你拆。",
  },
  {
    id: "gap_check",
    label: "看我还差什么",
    payloadMessage: "帮我看一下我还差什么。",
    hiddenContext:
      "[用户通过右侧实习要求过载卡片选择了：看我还差什么]",
    assistantReply:
      "可以，我们先不看所有差距，只看最关键的那一两个缺口。\n\n我会先帮你分清：哪些是真的会挡投递的，哪些其实只是现在还不熟、但可以边投边补的。",
  },
  {
    id: "comfort_first",
    label: "先安慰我一下，不分析",
    payloadMessage: "先安慰我一下，先不分析。",
    hiddenContext:
      "[用户通过右侧实习要求过载卡片选择了：先安慰我一下，不分析]",
    assistantReply:
      "可以，那我们先不分析。\n\n你现在不是不想处理，而是这些要求一下子堆过来，脑子先被压住了。我们先缓一缓，等你稍微稳一点，再只挑一条最刺眼的来看就好。",
  },
] as const;

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0
  );
}

export function shouldUseLocalFirstGentleClarify(
  rawText: string,
  options?: { riskLevel?: RiskLevel }
): boolean {
  const text = rawText.trim();

  if (!text || options?.riskLevel === "high") {
    return false;
  }

  if (shouldSuppressDecisionActionCard(text, options)) {
    return false;
  }

  if (hasAnyPattern(text, GENTLE_CLARIFY_BLOCK_PATTERNS)) {
    return false;
  }

  return hasAnyPattern(text, GENTLE_CLARIFY_ACTION_PATTERNS);
}

export function recommendSupportAction(
  rawText: string,
  riskLevel: RiskLevel
): RecommendedAction {
  const text = rawText.trim();

  if (!text || riskLevel === "high") {
    return NONE_RECOMMENDED_ACTION;
  }

  const internshipRequirementReply = buildInternshipRequirementOverloadReply(text, {
    riskLevel,
  });
  if (internshipRequirementReply) {
    return {
      id: "internship-requirement-overload",
      type: "internship_requirement_overload",
      title: "先从哪里拆？",
      reason: "我先不让你重新整理，你只要点一个最接近的入口就好。",
      payload: {
        options: INTERNSHIP_REQUIREMENT_CARD_OPTIONS,
      },
    };
  }

  const longTextIntake = resolveLongTextIntakeReply(text, {
    riskLevel,
  });
  if (longTextIntake) {
    return {
      id: "long-text-intake",
      type: "long_text_intake",
      title: "你想先怎么处理这段？",
      reason: "我先帮你接住这段内容，你只要选一个处理方式。",
      payload: {
        kind: longTextIntake.kind,
        options: buildLongTextIntakeActionOptions(longTextIntake.kind),
      },
    };
  }

  if (shouldSuppressDecisionActionCard(text, { riskLevel })) {
    return NONE_RECOMMENDED_ACTION;
  }

  if (shouldUseLocalFirstGentleClarify(text, { riskLevel })) {
    return {
      id: "gentle-clarify",
      type: "gentle_clarify",
      title: "你现在更像哪一种？",
      reason: "先不用解释很多，点一个最接近的就好。",
      payload: {
        options: [
          {
            id: "inner_load",
            label: "心里的事太多",
            message: "我更像是心里的事太多。",
          },
          {
            id: "task_load",
            label: "眼前要做的事太多",
            message: "我更像是眼前要做的事太多。",
          },
          {
            id: "both",
            label: "两个都有",
            message: "我感觉两个都有。",
          },
          {
            id: "pause",
            label: "说不清，只想先停一下",
            message: "我现在说不清，只想先停一下。",
          },
        ],
      },
    };
  }

  if (hasAnyPattern(text, BREATHING_ACTION_PATTERNS)) {
    return {
      id: "breathing",
      type: "breathing",
      title: "先跟着呼一口气",
      reason: "现在更像是整个人绷得太紧了，先把呼吸放慢一点会更有用。",
      payload: {
        inhaleSeconds: 4,
        exhaleSeconds: 6,
        cycles: 4,
      },
    };
  }

  if (hasAnyPattern(text, SEE_ACTION_PATTERNS)) {
    return {
      id: "grounding-see-five",
      type: "grounding",
      title: "先看一眼眼前的东西",
      reason: "可以，我们先不用想复杂的。先借一个很轻的视觉落点，把注意力放回眼前一点。",
      payload: {
        variant: "see_five",
      },
    };
  }

  if (hasAnyPattern(text, SOUND_ACTION_PATTERNS)) {
    const defaultTab = hasAnyPattern(text, SOUND_MUSIC_PATTERNS)
      ? "my_music"
      : "surrounding_sound";
    return {
      id: defaultTab === "my_music" ? "sound-my-music" : "sound-surrounding",
      type: "sound",
      title: "先放一点声音",
      reason:
        defaultTab === "my_music"
          ? "如果你现在更想靠一点熟悉的音乐缓下来，先放一小段就可以。"
          : "如果你现在想先靠一点声音落地，先听一小段身边或本地的声音就行。",
      payload: {
        variant: "listen",
        defaultTab,
      },
    };
  }

  const replayStrongCount = countPatternMatches(text, REPLAY_STRONG_PATTERNS);
  const replaySupportCount = countPatternMatches(text, REPLAY_SUPPORT_PATTERNS);
  if (
    replayStrongCount >= 1 ||
    (replayStrongCount === 0 && replaySupportCount >= 2)
  ) {
    return {
      id: "thirty-minute-replay",
      type: "thirty_minute_replay",
      title: "30 分钟回放",
      reason: "这更像空转后的烦，不适合继续逼自己放空。",
      payload: {
        options: [
          "A 一直刷手机，停不下来",
          "B 本来有件事不想碰",
          "C 身体很累，但脑子停不下来",
          "D 我也说不清",
        ],
      },
    };
  }

  if (hasAnyPattern(text, TASK_OVERLOAD_ACTION_PATTERNS)) {
    return {
      id: "micro-action-deck",
      type: "micro_action_deck",
      title: "先甩一个很小的动作",
      reason: "先不用把所有事排清楚，只挑一个最轻的小动作就够了。",
    };
  }

  if (hasAnyPattern(text, GROUNDING_ACTION_PATTERNS)) {
    return {
      id: "grounding-see-five",
      type: "grounding",
      title: "先把注意力放下来一点",
      reason: "先不用急着解释原因，把注意力带回眼前一点点就可以。",
      payload: {
        variant: "see_five",
      },
    };
  }

  return NONE_RECOMMENDED_ACTION;
}

export function appendRecommendedActionHint(
  replyText: string,
  action: RecommendedAction,
  riskLevel: RiskLevel
): string {
  const trimmedReply = replyText.trim();

  if (riskLevel === "high" || action.type === "none") {
    return trimmedReply;
  }

  if (/右边|右侧|先点一个|先做这一件事/.test(trimmedReply)) {
    return trimmedReply;
  }

  const hintMap: Record<RecommendedAction["type"], string> = {
    breathing:
      "右边我放了一个很轻的呼吸卡，不用做满，先跟一两轮就行。",
    sound:
      "右边我给你放了一个很轻的声音卡。你可以先听身边的声音，或者放一小段音乐。",
    grounding:
      action.payload?.variant === "see_five"
        ? "可以，我们先不用想复杂的。我在右边放一张很轻的视觉落点图，你只要看一眼，写一个看到的东西就够。"
        : "右边我放了一个很轻的落地卡。你不用做完整，先碰到一点点就可以。",
    thirty_minute_replay:
      "右边我给你放了一个很轻的回放卡，你不用解释很多，先点一个最像的就行。",
    gentle_clarify:
      "你现在不用解释很多，我在右边放了几个小选项。你只要点一个最接近的就好。",
    long_text_intake:
      "我在右边放了几个处理入口，你不用自己重新整理，只要点一个最接近的就好。",
    internship_requirement_overload:
      "我在右边放了几个拆实习要求的入口，你不用先把整个问题说完，只要点一个最接近的就好。",
    micro_action_deck:
      "右边有一组很小的动作卡，不用全做，只要甩一个最轻的就可以。",
    none: "",
  };

  const hint = hintMap[action.type];
  if (!hint) {
    return trimmedReply;
  }

  return trimmedReply ? `${trimmedReply}\n\n${hint}` : hint;
}
