import type { ActionCardContext, RiskLevel } from "../types";

export type LongTextKind =
  | "job_posting"
  | "emotional_dump"
  | "task_overload"
  | "error_log"
  | "academic_requirement"
  | "chat_record"
  | "mixed"
  | "unknown";

export interface LongTextIntakeResult {
  matched: boolean;
  kind: LongTextKind;
  signals: string[];
  mainThreads: string[];
  suggestedActions: Array<{
    label: string;
    payload: string;
  }>;
  reply: string;
}

export interface LongTextIntakeActionOption {
  id: string;
  label: string;
  payloadMessage: string;
  hiddenContext: string;
  assistantReply: string;
  actionContext?: ActionCardContext;
}

const LONG_TEXT_MIN_LENGTH = 260;
const LONG_TEXT_MIN_LINES = 5;
const STRUCTURED_LONG_TEXT_MIN_LENGTH = 120;

const HIGH_RISK_PATTERNS: RegExp[] = [
  /活着都没意思/,
  /没有活着的意义/,
  /没有活下去的意义/,
  /人生没有意义/,
  /不想活了?/,
  /不想活/,
  /活不下去/,
  /想死/,
  /想去死/,
  /死了算了/,
  /想自杀/,
  /自杀/,
  /轻生/,
  /自残/,
  /伤害自己/,
  /割腕/,
  /跳楼/,
  /结束生命/,
  /结束这一切/,
  /想消失/,
];

const JOB_POSTING_PATTERNS: RegExp[] = [
  /岗位职责/,
  /任职要求/,
  /岗位要求/,
  /职位描述/,
  /职责描述/,
  /job description/i,
  /\bjd\b/i,
  /加分项/,
  /薪资/,
  /base地/,
  /工作地点/,
  /学历要求/,
  /经验要求/,
];

const EMOTIONAL_DUMP_PATTERNS: RegExp[] = [
  /我觉得/,
  /我好像/,
  /我真的/,
  /我很难受/,
  /我很崩溃/,
  /我很乱/,
  /我很焦虑/,
  /我撑不住/,
  /我委屈/,
  /我害怕/,
  /我不知道怎么办/,
];

const TASK_OVERLOAD_PATTERNS: RegExp[] = [
  /任务/,
  /待办/,
  /事情很多/,
  /事情太多/,
  /不知道先做哪个/,
  /不知道先做什么/,
  /来不及/,
  /截止/,
  /ddl/i,
  /deadline/i,
  /安排不过来/,
];

const ERROR_LOG_PATTERNS: RegExp[] = [
  /error/i,
  /exception/i,
  /traceback/i,
  /stack trace/i,
  /failed to/i,
  /status code/i,
  /http/i,
  /429/,
  /500/,
  /报错/,
  /错误日志/,
];

const ACADEMIC_REQUIREMENT_PATTERNS: RegExp[] = [
  /课程/,
  /作业/,
  /论文/,
  /实验/,
  /考试/,
  /老师/,
  /选课/,
  /学院/,
  /专业要求/,
  /毕业要求/,
];

const CHAT_RECORD_PATTERNS: RegExp[] = [
  /用户：/,
  /MoodNest：/,
  /我：/,
  /对方：/,
  /A:/,
  /B:/,
  /聊天记录/,
  /微信/,
  /短信/,
];

function shouldBlockLongTextIntake(
  text: string,
  options?: { riskLevel?: RiskLevel }
): boolean {
  if (options?.riskLevel === "high") {
    return true;
  }

  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(text));
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0
  );
}

function splitIntoMeaningfulLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function extractSentences(text: string): string[] {
  return text
    .split(/[。！？\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 6);
}

function sanitizeThreadText(text: string): string {
  return text
    .replace(/【上下文，仅供理解】/g, "")
    .replace(/【用户当前输入】/g, "")
    .replace(/【用户当前输入】/g, "")
    .replace(/\[用户当前输入\]/g, "")
    .replace(/hidden context/gi, "")
    .replace(/internal/gi, "")
    .replace(/actionId/gi, "")
    .replace(/optionId/gi, "")
    .replace(/sourceText/gi, "")
    .replace(/payload only/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderLike(text: string): boolean {
  return /用户当前输入|上下文，仅供理解|hidden context|internal|actionid|optionid|sourcetext|payload only|placeholder|todo/i.test(
    text
  );
}

function hasNumberedOrBulletedStructure(lines: string[]): boolean {
  const structuredLineCount = lines.filter((line) =>
    /^(\d+[\.\)、]|[-*•]|[A-Za-z][\.\):])\s*/.test(line)
  ).length;

  return structuredLineCount >= 3;
}

function hasLongFormSectionCue(text: string): boolean {
  return /工作职责|岗位职责|任职要求|岗位要求|job description|课程要求|作业要求|请完成以下任务|error|exception|traceback|stack trace|聊天记录/i.test(
    text
  );
}

function hasDenseErrorOrLogShape(lines: string[]): boolean {
  const signalCount = lines.filter((line) =>
    /(error|exception|traceback|status|http|failed|warn|debug|at\s+\S+|\b429\b|\b500\b)/i.test(
      line
    )
  ).length;

  return signalCount >= 3;
}

export function detectLongTextInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const lines = splitIntoMeaningfulLines(trimmed);
  const hasStructuredLongForm =
    trimmed.length >= STRUCTURED_LONG_TEXT_MIN_LENGTH &&
    (hasNumberedOrBulletedStructure(lines) ||
      hasLongFormSectionCue(trimmed) ||
      hasDenseErrorOrLogShape(lines));

  return (
    trimmed.length >= LONG_TEXT_MIN_LENGTH ||
    lines.length >= LONG_TEXT_MIN_LINES ||
    hasStructuredLongForm
  );
}

export function classifyLongTextKind(text: string): {
  kind: LongTextKind;
  signals: string[];
} {
  if (
    /工作职责|岗位职责/i.test(text) &&
    /任职要求|岗位要求/i.test(text)
  ) {
    return {
      kind: "job_posting",
      signals: ["工作职责", "任职要求"],
    };
  }

  const scoreMap: Array<{
    kind: LongTextKind;
    score: number;
    signals: string[];
  }> = [
    {
      kind: "job_posting",
      score: countMatches(text, JOB_POSTING_PATTERNS),
      signals: JOB_POSTING_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
        pattern.toString()
      ),
    },
    {
      kind: "emotional_dump",
      score: countMatches(text, EMOTIONAL_DUMP_PATTERNS),
      signals: EMOTIONAL_DUMP_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
        pattern.toString()
      ),
    },
    {
      kind: "task_overload",
      score: countMatches(text, TASK_OVERLOAD_PATTERNS),
      signals: TASK_OVERLOAD_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
        pattern.toString()
      ),
    },
    {
      kind: "error_log",
      score: countMatches(text, ERROR_LOG_PATTERNS),
      signals: ERROR_LOG_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
        pattern.toString()
      ),
    },
    {
      kind: "academic_requirement",
      score: countMatches(text, ACADEMIC_REQUIREMENT_PATTERNS),
      signals: ACADEMIC_REQUIREMENT_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
        pattern.toString()
      ),
    },
    {
      kind: "chat_record",
      score: countMatches(text, CHAT_RECORD_PATTERNS),
      signals: CHAT_RECORD_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
        pattern.toString()
      ),
    },
  ];

  const nonZero = scoreMap.filter((item) => item.score > 0);
  if (nonZero.length === 0) {
    return { kind: "unknown", signals: [] };
  }

  const sorted = [...nonZero].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];

  if (!top) {
    return { kind: "unknown", signals: [] };
  }

  if (second && top.score > 0 && second.score > 0 && top.score - second.score <= 1) {
    return {
      kind: "mixed",
      signals: [...top.signals, ...second.signals].slice(0, 6),
    };
  }

  return {
    kind: top.kind,
    signals: top.signals.slice(0, 6),
  };
}

function extractMainThreads(text: string, kind: LongTextKind): string[] {
  const sentences = extractSentences(text);
  const picked: string[] = [];

  const pushIfRelevant = (patterns: RegExp[], fallbackPrefix: string) => {
    for (const sentence of sentences) {
      if (picked.length >= 4) {
        return;
      }

      if (patterns.some((pattern) => pattern.test(sentence))) {
        const normalized = sanitizeThreadText(sentence);
        if (normalized && !isPlaceholderLike(normalized) && !picked.includes(normalized)) {
          picked.push(normalized);
        }
      }
    }

    if (picked.length === 0 && sentences.length > 0) {
      const fallback = sanitizeThreadText(`${fallbackPrefix}${sentences[0]}`);
      if (fallback && !isPlaceholderLike(fallback)) {
        picked.push(fallback);
      }
    }
  };

  if (kind === "job_posting") {
    const threads: string[] = [];
    const pushThread = (thread: string) => {
      const normalized = sanitizeThreadText(thread);
      if (normalized && !isPlaceholderLike(normalized) && !threads.includes(normalized)) {
        threads.push(normalized);
      }
    };

    if (/ai\s*agent|大语言模型|agent|ai 编程工具|研发工具链|工具链/i.test(text)) {
      pushThread("AI / Agent 能力：理解大模型、Agent、AI 工具与相关研发工具链。");
    }

    if (/设计与开发|设计和开发|原型|实现|工程|编程|持续迭代|研发工具/i.test(text)) {
      pushThread("工程落地能力：能做原型、系统实现，并把想法持续迭代成可用工具。");
    }

    if (/策划|美术|程序团队|跨团队|协作|游戏研发|游戏开发流程|业务流程/i.test(text)) {
      pushThread("业务理解能力：理解业务流程，能和不同角色协作，把工具落到具体场景里。");
    }

    if (threads.length === 0 && /工作职责|岗位职责|任职要求|岗位要求/i.test(text)) {
      pushThread("这段主要是在描述岗位职责和任职要求。");
    }

    if (
      threads.length < 3 &&
      /加分项|优先|优先考虑|了解.*流程|相关背景|学历要求|经验要求/i.test(text)
    ) {
      pushThread("它混合了核心能力、加分背景和协作要求，不是每一条都等于硬门槛。");
    }

    if (threads.length < 3) {
      pushThread("下一步更适合先拆“必须项”和“加分项”，再看岗位匹配度。");
    }

    if (threads.length > 0) {
      return threads.slice(0, 3);
    }

    pushIfRelevant(
      [/职责|要求|加分项|经验|学历|base|地点/i],
      "这段主要在说："
    );
  } else if (kind === "task_overload") {
    pushIfRelevant(
      [/任务|待办|来不及|先做|安排|截止|ddl|deadline/i],
      "现在最显眼的一条线是："
    );
  } else if (kind === "academic_requirement") {
    pushIfRelevant(
      [/课程|作业|论文|老师|考试|要求/i],
      "这段里更像在说："
    );
  } else if (kind === "error_log") {
    pushIfRelevant(
      [/error|exception|traceback|429|500|报错|失败/i],
      "里面最需要先抓的是："
    );
  } else if (kind === "chat_record") {
    pushIfRelevant(
      [/说了|回了|没有回|争执|聊天|记录|对方/i],
      "聊天里比较突出的线索是："
    );
  } else {
    pushIfRelevant(
      [/难受|焦虑|委屈|害怕|担心|压|乱|撑不住|做不好/i],
      "我先粗略抓到的一条线是："
    );
  }

  if (picked.length === 0) {
    return sentences
      .map((sentence) => sanitizeThreadText(sentence))
      .filter((sentence) => sentence && !isPlaceholderLike(sentence))
      .slice(0, 3);
  }

  return picked
    .filter((sentence) => sentence && !isPlaceholderLike(sentence))
    .slice(0, 4);
}

function buildFallbackMainThreads(kind: LongTextKind): string[] {
  if (kind === "job_posting") {
    return [
      "这段主要是在描述岗位职责和任职要求。",
      "它混合了核心能力、业务背景和协作要求。",
      "下一步可以先拆“必须项”和“加分项”。",
    ];
  }

  if (kind === "error_log") {
    return [
      "这段主要是在描述报错现象和相关日志。",
      "里面混合了错误结果、上下文线索和可能的触发条件。",
      "下一步更适合先抓最可能的原因。",
    ];
  }

  return [
    "这段里不止一条线索，先不用一次全处理。",
    "我会先把更核心的几条内容收出来。",
    "下一步可以先挑最值得先处理的一块。",
  ];
}

function ensureValidMainThreads(
  threads: string[],
  kind: LongTextKind
): string[] {
  const cleaned = threads
    .map((thread) => sanitizeThreadText(thread))
    .filter((thread) => thread.length > 0 && !isPlaceholderLike(thread));

  return cleaned.length > 0 ? cleaned.slice(0, 3) : buildFallbackMainThreads(kind);
}

function buildSuggestedActions(kind: LongTextKind): Array<{
  label: string;
  payload: string;
}> {
  if (kind === "job_posting") {
    return [
      { label: "判断适不适合投", payload: "帮我判断这个岗位适不适合投。" },
      {
        label: "拆必须项 / 加分项",
        payload: "帮我拆一下这段 JD 里哪些是必须项，哪些是加分项。",
      },
      { label: "对齐我的项目经历", payload: "帮我把我的经历往这个 JD 上靠。" },
      { label: "生成简历关键词", payload: "帮我提取这段 JD 对应的简历关键词。" },
    ];
  }

  if (kind === "emotional_dump") {
    return [
      { label: "复述你听到的重点", payload: "先帮我复述一下你听到的重点。" },
      { label: "找最压着我的那一块", payload: "帮我找一下现在最压着我的那一块。" },
      { label: "先别分析，只安慰我", payload: "先别分析，只安慰我一下。" },
      { label: "拆成一个很小的下一步", payload: "帮我拆成一个很小的下一步。" },
    ];
  }

  if (kind === "task_overload") {
    return [
      { label: "挑最急的一件事", payload: "帮我挑最急的一件事。" },
      { label: "挑最吓人的一件事", payload: "帮我挑最吓人的一件事。" },
      { label: "排一个 15 分钟版本", payload: "帮我排一个 15 分钟版本。" },
      { label: "先停一下，不推进", payload: "先停一下，不推进。" },
    ];
  }

  if (kind === "error_log") {
    return [
      { label: "解释这个错误", payload: "先帮我解释这个错误。" },
      { label: "找最可能的原因", payload: "帮我找最可能的原因。" },
      { label: "写给 Codex 的修复指令", payload: "帮我写一段给 Codex 的修复指令。" },
      {
        label: "判断是不是 API / 额度 / 配置问题",
        payload: "帮我判断这是不是 API / 额度 / 配置问题。",
      },
    ];
  }

  if (kind === "academic_requirement") {
    return [
      { label: "拆任务要求", payload: "帮我拆一下这些任务要求。" },
      { label: "整理报告结构", payload: "帮我整理这个报告的结构。" },
      { label: "做 checklist", payload: "帮我做一份 checklist。" },
      { label: "找最容易丢分的地方", payload: "帮我找最容易丢分的地方。" },
    ];
  }

  return [
    { label: "先帮我抓重点", payload: "先帮我抓一下这段内容的重点。" },
    { label: "先帮我分成几类", payload: "先帮我把这段内容分成几类。" },
    { label: "先找最该处理的一块", payload: "先帮我找最该处理的那一块。" },
    { label: "先别分析，只接住我一下", payload: "先别分析，只接住我一下。" },
  ];
}

export function buildLongTextIntakeActionOptions(
  kind: LongTextKind
): LongTextIntakeActionOption[] {
  const buildOption = (
    id: string,
    label: string,
    payloadMessage: string,
    assistantReply: string
  ): LongTextIntakeActionOption => ({
    id,
    label,
    payloadMessage,
    hiddenContext: `[用户通过右侧长文入口卡片选择了：${label}]`,
    assistantReply,
    actionContext: {
      actionId: "long_text_intake",
      optionId: id,
      kind,
    },
  });

  if (kind === "job_posting") {
    return [
      buildOption(
        "fit_check",
        "判断适不适合投",
        "帮我判断这个岗位适不适合投。",
        "好，我们先不急着证明你够不够，而是先看这个岗位更像在要什么样的人。\n\n如果你刚刚贴的那段 JD 还在当前对话里，我会按那段先帮你判断：它是硬门槛真的太高，还是其实有一些可以边投边补的部分；如果没有，你把那段再贴一次也可以。"
      ),
      buildOption(
        "must_vs_bonus",
        "拆必须项 / 加分项",
        "帮我拆一下这段 JD 里哪些是必须项，哪些是加分项。",
        "好，我们先不判断你够不够，而是把这段 JD 分层看。\n\n我会按三类拆：1. 真正必须满足的 2. 可以边投边补的 3. 只是加分项，不必一开始全会。\n\n如果你刚刚贴的 JD 还在当前对话里，我会先基于那段来拆；如果没有，你把那段再贴一次，我就按这三类帮你看。"
      ),
      buildOption(
        "align_experience",
        "对齐我的项目经历",
        "帮我把我的经历往这个 JD 上靠。",
        "可以，那我们先不看整个人够不够，只看你现有的经历里，哪些已经能和这段 JD 搭上。\n\n如果那段 JD 还在当前对话里，我会先按它来对齐；如果没有，你也可以把 JD 或你最想对齐的 1 到 2 段经历再贴一次。"
      ),
      buildOption(
        "resume_keywords",
        "生成简历关键词",
        "帮我提取这段 JD 对应的简历关键词。",
        "好，那我们先不做完整简历，只先把这段 JD 里最该出现的关键词抓出来。\n\n这样你可以先有一个低负担的入口，再慢慢往简历和项目描述里填。"
      ),
    ];
  }

  if (kind === "emotional_dump") {
    return [
      buildOption(
        "restate",
        "复述你听到的重点",
        "先帮我复述一下你听到的重点。",
        "可以，那我先不拆太多，只帮你把刚刚那段里最重的几条线收一下。\n\n你不用马上说对不对，我先把我听到的重点放出来，我们再一起看哪一块最压。"
      ),
      buildOption(
        "pressure_point",
        "找最压着我的那一块",
        "帮我找一下现在最压着我的那一块。",
        "好，那我们先不试图整段都处理。\n\n我可以先基于你刚刚说的那些，帮你挑出现在最像“压在胸口上”的那一块，我们只处理那一小块就好。"
      ),
      buildOption(
        "comfort_only",
        "先别分析，只安慰我",
        "先别分析，只安慰我一下。",
        "可以，那我们先不拆、不问、也不急着要你整理。\n\n你能把这些一口气倒出来，本身就很不容易了。现在我先好好陪你把这一口气缓一缓，不用立刻变清楚。"
      ),
      buildOption(
        "tiny_next_step",
        "拆成一个很小的下一步",
        "帮我拆成一个很小的下一步。",
        "好，我们先不要一个大方案，只帮你从这段里拆出一个小到现在就能碰一下的下一步。\n\n我会尽量把它拆得小、轻、不像又给你加任务。"
      ),
    ];
  }

  if (kind === "task_overload") {
    return [
      buildOption(
        "pick_urgent",
        "挑最急的一件事",
        "帮我挑最急的一件事。",
        "好，那我们先不排表，只抓最急的那一件。\n\n你不用把所有事都再说一遍，我会先帮你把刚刚那一大段里最像“不先碰会出事”的那一项拎出来。"
      ),
      buildOption(
        "pick_scary",
        "挑最吓人的一件事",
        "帮我挑最吓人的一件事。",
        "可以，那我们就先不管它是不是最重要，只管它是不是最吓人。\n\n有时候不是事情太多，而是其中有一件太压人，把其他东西也带乱了。"
      ),
      buildOption(
        "fifteen_minutes",
        "排一个 15 分钟版本",
        "帮我排一个 15 分钟版本。",
        "好，那我们先不做完整规划，只把刚刚那一堆事情压缩成一个 15 分钟版本。\n\n目标不是解决它们，而是先让你有一个可以开始的入口。"
      ),
      buildOption(
        "pause_first",
        "先停一下，不推进",
        "先停一下，不推进。",
        "可以，那我们先不推进。\n\n现在你不是偷懒，更像是脑子已经被塞满了。我们先把所有东西都暂停一下，等你稍微落一点地，再只拎一个小入口出来。"
      ),
    ];
  }

  if (kind === "error_log") {
    return [
      buildOption(
        "explain_error",
        "解释这个错误",
        "先帮我解释这个错误。",
        "好，我们先不急着修，先把这个错误翻成人能看懂的话。\n\n我会基于你刚刚贴的那段错误信息，先说清它大概在抱怨什么。"
      ),
      buildOption(
        "likely_cause",
        "找最可能的原因",
        "帮我找最可能的原因。",
        "可以，那我们先不把所有可能性都列出来，只先抓最值得先验的那一两个原因。\n\n这样比从整段日志里乱翻要省力得多。"
      ),
      buildOption(
        "codex_fix_prompt",
        "写给 Codex 的修复指令",
        "帮我写一段给 Codex 的修复指令。",
        "好，我可以先基于你刚刚贴的报错，帮你收成一段更好用的 Codex 修复指令。\n\n目标是让它能直接理解：现象是什么、你想修到什么程度，以及先该从哪里检查。"
      ),
      buildOption(
        "quota_or_config",
        "判断是不是 API / 额度 / 配置问题",
        "帮我判断这是不是 API / 额度 / 配置问题。",
        "好，那我们先不深挖全部技术细节，只先判断它更像是接口配置、额度限制，还是请求格式不兼容。"
      ),
    ];
  }

  if (kind === "academic_requirement") {
    return [
      buildOption(
        "split_requirement",
        "拆任务要求",
        "帮我拆一下这些任务要求。",
        "好，那我们先不急着完成整份作业，只先把要求拆开，看它到底在让你交什么。"
      ),
      buildOption(
        "report_structure",
        "整理报告结构",
        "帮我整理这个报告的结构。",
        "可以，那我们先不填内容，只先把这份报告需要的结构骨架搭起来。\n\n有了骨架之后，很多压力会先下来一点。"
      ),
      buildOption(
        "checklist",
        "做 checklist",
        "帮我做一份 checklist。",
        "好，我们先不写完整内容，先把这些要求收成一份可以一条条勾的 checklist。\n\n这样你不用一直在脑子里记着它们。"
      ),
      buildOption(
        "lose_points",
        "找最容易丢分的地方",
        "帮我找最容易丢分的地方。",
        "可以，那我们先不把整份东西都做好，只先找那些最容易忽略、但一漏就很伤的地方。"
      ),
    ];
  }

  return [
    buildOption(
      "grab_focus",
      "先帮我抓重点",
      "先帮我抓一下这段内容的重点。",
      "好，那我们先不拆很细，只先基于你刚刚贴的那段，把最值得先抓的几个重点收出来。"
    ),
    buildOption(
      "group_threads",
      "先帮我分成几类",
      "先帮我把这段内容分成几类。",
      "可以，那我们先不要一口说清。\n\n我可以先帮你把刚刚那段内容分成几类，让它不要全都堆成同一团。"
    ),
    buildOption(
      "pick_first_chunk",
      "先找最该处理的一块",
      "先帮我找最该处理的那一块。",
      "好，那我们先不试图全都解决。\n\n我可以先基于你刚刚那段内容，帮你挑出最该先处理的那一块，我们只处理一块就好。"
    ),
    buildOption(
      "contain_only",
      "先别分析，只接住我一下",
      "先别分析，只接住我一下。",
      "可以，那我们就先不拆了。\n\n你现在能把这一大段倒出来就已经很不容易了。我先好好把它接住，不催你清楚，也不催你往前走。"
    ),
  ];
}

function buildJobPostingLead(text: string): string {
  if (
    /ai\s*agent|大语言模型|agent|研发工具链|工具链/i.test(text) &&
    /游戏|策划|美术|程序团队|游戏研发|游戏开发流程/i.test(text)
  ) {
    return "我收到了，不用你重新整理。\n\n这段更像是一个“AI Agent + 游戏研发工具链”的岗位 JD。它不一定只适合计算机专业，但会比较看重工程实现、AI 工具理解，以及把工具落到具体业务流程里的能力。";
  }

  if (/ai\s*agent|大语言模型|agent|研发工具链|工具链/i.test(text)) {
    return "我收到了，不用你重新整理。\n\n这段更像是一个偏 AI 工具 / Agent 方向的岗位 JD。它不一定只看某个专业标签，更适合先拆核心能力、加分背景和可迁移经历。";
  }

  return "我收到了，不用你重新整理。\n\n这段更像是一个岗位 JD。它不一定只看某个专业出身，更适合先拆核心能力、加分背景、经历对齐和岗位匹配度。";
}

function buildFocusReplyForKind(
  kind: LongTextKind,
  threads: string[]
): string {
  const lines = threads
    .slice(0, 3)
    .map((thread, index) => `${index + 1}. ${thread}`)
    .join("\n");

  if (kind === "job_posting") {
    return `好，我先不拆很细，先把这段里最值得先抓的几点收出来：\n\n${lines}\n\n如果你愿意，下一步我们可以继续拆“必须项”和“加分项”。`;
  }

  return `好，我先不拆很细，先把这段里最值得先抓的几点收出来：\n\n${lines}`;
}

export function resolveLongTextActionReply(
  context: ActionCardContext
): string | null {
  if (context.actionId !== "long_text_intake") {
    return null;
  }

  const sourceText = context.sourceTextSnapshot?.trim();
  if (!sourceText) {
    if (context.optionId === "must_vs_bonus") {
      return "好，我们先不判断你够不够，而是把这段 JD 分层看。\n\n我会按三类拆：1. 真正必须满足的 2. 可以边投边补的 3. 只是加分项，不必一开始全会。\n\n如果你愿意，把刚刚那段 JD 再贴一次，我就按这三类帮你拆。";
    }
    return null;
  }

  const intake = resolveLongTextIntakeReply(sourceText, { riskLevel: "low" });
  const kind = context.kind ?? intake?.kind ?? "unknown";
  const threads = ensureValidMainThreads(intake?.mainThreads ?? [], kind as LongTextKind);

  switch (context.optionId) {
    case "grab_focus":
    case "restate":
      return buildFocusReplyForKind(kind as LongTextKind, threads);
    case "group_threads":
      return `好，我先不急着往下拆，先把这段分成几类来看：\n\n${threads
        .slice(0, 3)
        .map((thread, index) => `${index + 1}. ${thread}`)
        .join("\n")}`;
    case "pick_first_chunk":
    case "pressure_point":
      return `好，我们先不处理全部。\n\n如果只先抓一块，我会优先从这一条开始：\n1. ${
        threads[0] ?? buildFallbackMainThreads(kind as LongTextKind)[0]
      }\n\n这样会比一口气把整段都拆开更省力一点。`;
    case "must_vs_bonus":
      return "好，我们先不判断你够不够，而是把这段 JD 分层看。\n\n我会按三类拆：1. 真正必须满足的 2. 可以边投边补的 3. 只是加分项，不必一开始全会。\n\n如果你愿意，我下一步就基于你刚刚贴的这段继续往下拆。";
    case "fit_check":
      return `好，我们先不急着证明你够不够，而是先看这个岗位更像在要什么样的人。\n\n我先抓到的重点是：\n${threads
        .slice(0, 3)
        .map((thread, index) => `${index + 1}. ${thread}`)
        .join("\n")}\n\n下一步如果你愿意，我可以继续帮你判断哪些是硬门槛，哪些其实可以边投边补。`;
    case "align_experience":
      return "可以，那我们先不看整个人够不够，只看你现有的经历里，哪些已经能和这段 JD 搭上。\n\n如果你愿意，下一条你可以直接贴 1 到 2 段最想对齐的项目经历，我会按这段 JD 帮你往上靠。";
    case "resume_keywords":
      return `好，那我们先不做完整简历，只先把这段里最该出现的关键词方向抓出来。\n\n我先看到的重点会围绕这几类：\n${threads
        .slice(0, 3)
        .map((thread, index) => `${index + 1}. ${thread}`)
        .join("\n")}`;
    default:
      return null;
  }
}

function buildReply(
  kind: LongTextKind,
  mainThreads: string[],
  originalText: string
): string {
  const threadLines = mainThreads
    .slice(0, 3)
    .map((thread, index) => `${index + 1}. ${thread}`)
    .join("\n");

  const kindLeadMap: Record<LongTextKind, string> = {
    job_posting: buildJobPostingLead(originalText),
    emotional_dump:
      "我收到了，你不用重新整理成很标准的格式。这段内容更像是一股一下子涌上来的情绪和想法，现在不适合全都展开。",
    task_overload:
      "我收到了，你不用重新整理成很标准的格式。这段内容更像是很多任务和压力一下子堆在一起，脑子暂时排不开。",
    error_log:
      "我收到了，你不用重新整理成很标准的格式。这段内容看起来更像报错 / 系统信息，现在先不用整段都打给 API。",
    academic_requirement:
      "我收到了，你不用重新整理成很标准的格式。这段内容更像课程 / 作业 / 学业要求堆在一起，我们先只抓主线。",
    chat_record:
      "我收到了，你不用重新整理成很标准的格式。这段内容更像一段聊天记录或对话片段，现在先不用把每一句都解释一遍。",
    mixed:
      "我收到了，你不用重新整理成很标准的格式。这里面像是混着几条不同线索，我们先粗略收一下，不急着全都处理。",
    unknown:
      "我收到了，你不用重新整理成很标准的格式。现在先不急着整段都展开，我们先粗略收一下主线。",
  };

  const threadsSection = threadLines
    ? `\n\n我先粗略抓到的主线有：\n${threadLines}`
    : "";

  return `${kindLeadMap[kind]}${threadsSection}\n\n这段内容有点多，我先帮你粗略抓一下主线，不急着一次性解决全部。\n\n我在右边放了几个处理入口，你只要点一个最接近的就好。`;
}

export function resolveLongTextIntakeReply(
  text: string,
  options?: { riskLevel?: RiskLevel }
): LongTextIntakeResult | null {
  const trimmed = text.trim();

  if (!detectLongTextInput(trimmed) || shouldBlockLongTextIntake(trimmed, options)) {
    return null;
  }

  const { kind, signals } = classifyLongTextKind(trimmed);
  const mainThreads = ensureValidMainThreads(extractMainThreads(trimmed, kind), kind);
  const suggestedActions = buildSuggestedActions(kind);

  return {
    matched: true,
    kind,
    signals,
    mainThreads,
    suggestedActions,
    reply: buildReply(kind, mainThreads, trimmed),
  };
}

export function shouldUseLocalFirstLongTextIntake(
  text: string,
  options?: { riskLevel?: RiskLevel }
): boolean {
  return resolveLongTextIntakeReply(text, options) !== null;
}
