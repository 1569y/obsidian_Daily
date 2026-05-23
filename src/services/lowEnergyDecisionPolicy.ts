import type { RiskLevel } from "../types";

interface DecisionOption {
  label: string;
  aliases: string[];
  groups: string[];
}

export interface LowEnergyDecisionState {
  isLowEnergyDecision: boolean;
  rejectedOptions: string[];
  backgroundCategory?: string;
  candidateOptions: string[];
  shouldAskBackgroundCategory: boolean;
}

interface CareerOptionSignalState {
  rejectedOptions: string[];
  interestedOptions: string[];
  confusedOptions: string[];
  needsExplanationOptions: string[];
  mentionedOptions: string[];
}

interface CareerFollowupOption {
  label: string;
  aliases: string[];
}

interface LowEnergyDecisionOptions {
  riskLevel?: RiskLevel;
}

const INTERNSHIP_REQUIREMENT_OVERLOAD_PATTERNS: RegExp[] = [
  /实习.{0,8}(要求好多|要求太多)/,
  /(岗位要求|招聘要求).{0,8}(太多|很多|看崩|看不懂)/,
  /jd.{0,8}(看不懂|看崩|太多|好多)/i,
  /要求太高/,
  /每个岗位都要会很多/,
  /不知道哪些要求是真的必须/,
  /看(岗位要求|jd|招聘要求).{0,8}(很乱|很焦虑|很累)/i,
  /(岗位要求|jd|招聘要求).{0,12}(很乱|很焦虑|很累)/i,
];

type BackgroundCategory =
  | "ai-tech"
  | "design-ux"
  | "business"
  | "media-content"
  | "education-support"
  | "hardware-engineering";

const LOW_ENERGY_PATTERNS: RegExp[] = [
  /完蛋了/,
  /感觉很乱/,
  /脑子很乱/,
  /不知道怎么办/,
  /不知道怎么选/,
  /不知道该选什么/,
  /我什么都不会/,
  /感觉自己什么都不会/,
  /学得太杂/,
  /没有一块很精/,
  /没有特别精的/,
  /时间不够了?/,
  /来不及了?/,
  /好慌/,
  /很慌/,
  /没有力气/,
  /好累/,
  /撑不住/,
  /很焦虑/,
  /很迷茫/,
  /一团乱/,
];

const SAFETY_BLOCK_PATTERNS: RegExp[] = [
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
  /吃药结束/,
  /结束生命/,
  /结束这一切/,
  /了结自己/,
  /再也不想醒来/,
  /如果我不在了/,
  /想消失/,
  /结束自己/,
];

const CAREER_PATTERNS: RegExp[] = [
  /实习/,
  /找工作/,
  /求职/,
  /岗位/,
  /投递/,
  /简历/,
  /面试/,
  /主方向/,
  /职业规划/,
  /职业/,
  /深度不够/,
  /offer/i,
  /校招/,
  /秋招/,
  /春招/,
  /转行/,
  /申请/,
  /岗位要求/,
  /hr/i,
];

const ROLE_CONTEXT_PATTERNS: RegExp[] = [
  /ai/i,
  /人工智能/,
  /计算机/,
  /\bcs\b/i,
  /软件工程/,
  /技术/,
  /开发/,
  /算法/,
  /大模型/,
  /llm/i,
  /agent/i,
  /机器学习/,
  /深度学习/,
  /编程/,
  /代码/,
  /前端/,
  /后端/,
  /数据分析/,
  /产品/,
  /运营/,
  /设计/,
  /交互/,
  /商科/,
  /金融/,
  /内容/,
  /传媒/,
  /教育/,
  /硬件/,
];

const REJECTION_PATTERNS = [
  "不是很想碰",
  "不是很想选",
  "不是很想做",
  "不是很想",
  "不太想碰",
  "不太想选",
  "不太想做",
  "不太想",
  "不想碰",
  "不想选",
  "不想做",
  "不想",
  "不喜欢",
  "不考虑",
  "排斥",
  "没兴趣",
  "不优先",
  "算了",
  "不适合",
  "不太适合",
];

const REJECTION_OPTIONS: DecisionOption[] = [
  { label: "数据分析", aliases: ["数据分析", "数据岗"], groups: ["data-analysis"] },
  { label: "商业分析", aliases: ["商业分析", "bi"], groups: ["business-analysis"] },
  {
    label: "前端开发",
    aliases: ["前端开发", "web前端", "web 前端", "前端"],
    groups: ["frontend"],
  },
  {
    label: "算法/模型训练",
    aliases: ["算法岗", "算法", "机器学习", "模型训练"],
    groups: ["algorithm"],
  },
  {
    label: "后端开发",
    aliases: ["后端开发", "服务端", "后端"],
    groups: ["backend"],
  },
  {
    label: "产品",
    aliases: ["产品经理", "ai产品", "pm", "产品"],
    groups: ["product"],
  },
  {
    label: "运营",
    aliases: ["产品运营", "内容运营", "新媒体运营", "运营"],
    groups: ["ops", "growth"],
  },
  {
    label: "测试工程",
    aliases: ["测试工程", "测试工程师", "qa", "测试"],
    groups: ["qa"],
  },
  {
    label: "设计",
    aliases: ["交互设计", "用户研究", "ux", "ui", "设计"],
    groups: ["design", "research"],
  },
  {
    label: "市场营销",
    aliases: ["市场", "营销"],
    groups: ["marketing", "brand"],
  },
  { label: "销售", aliases: ["销售"], groups: ["sales"] },
  {
    label: "咨询/行业研究",
    aliases: ["咨询"],
    groups: ["consulting"],
  },
  {
    label: "硬件/嵌入式",
    aliases: ["嵌入式", "硬件"],
    groups: ["hardware"],
  },
  { label: "供应链", aliases: ["供应链"], groups: ["supply-chain"] },
];

const SPECIFIC_BACKGROUND_OPTIONS: Record<BackgroundCategory, DecisionOption[]> = {
  "ai-tech": [
    { label: "AI产品/AI PM", aliases: [], groups: ["product"] },
    { label: "AI应用开发/LLM应用", aliases: [], groups: ["tech"] },
    { label: "模型评测/数据标注策略", aliases: [], groups: ["model-eval"] },
    { label: "算法/模型训练", aliases: [], groups: ["algorithm"] },
    { label: "多模态/交互原型", aliases: [], groups: ["design"] },
    { label: "后端开发", aliases: [], groups: ["backend"] },
    { label: "数据分析", aliases: [], groups: ["data-analysis"] },
    { label: "前端开发", aliases: [], groups: ["frontend"] },
  ],
  "design-ux": [
    { label: "UX/UI设计", aliases: [], groups: ["design"] },
    { label: "产品设计", aliases: [], groups: ["design", "product"] },
    { label: "交互设计", aliases: [], groups: ["design"] },
    { label: "用户研究", aliases: [], groups: ["research"] },
    { label: "服务设计", aliases: [], groups: ["design"] },
    { label: "设计运营", aliases: [], groups: ["ops", "design"] },
    { label: "AI产品体验设计", aliases: [], groups: ["design", "product"] },
  ],
  business: [
    { label: "产品运营", aliases: [], groups: ["ops"] },
    { label: "市场营销", aliases: [], groups: ["marketing"] },
    { label: "商业分析", aliases: [], groups: ["business-analysis"] },
    { label: "用户增长", aliases: [], groups: ["growth"] },
    { label: "品牌策划", aliases: [], groups: ["brand"] },
    { label: "项目管理", aliases: [], groups: ["project-management"] },
    { label: "咨询/行业研究", aliases: [], groups: ["consulting"] },
  ],
  "media-content": [
    { label: "内容运营", aliases: [], groups: ["ops"] },
    { label: "新媒体运营", aliases: [], groups: ["ops"] },
    { label: "品牌内容策划", aliases: [], groups: ["brand"] },
    { label: "社群运营", aliases: [], groups: ["ops"] },
    { label: "短视频策划", aliases: [], groups: ["content"] },
    { label: "公关传播", aliases: [], groups: ["pr"] },
    { label: "用户增长", aliases: [], groups: ["growth"] },
  ],
  "education-support": [
    { label: "教育产品", aliases: [], groups: ["product"] },
    { label: "学习设计", aliases: [], groups: ["education"] },
    { label: "用户支持/用户成功", aliases: [], groups: ["support"] },
    { label: "心理健康产品运营", aliases: [], groups: ["ops"] },
    { label: "社群支持", aliases: [], groups: ["support"] },
    { label: "公益项目运营", aliases: [], groups: ["ops"] },
    { label: "课程运营", aliases: [], groups: ["ops"] },
  ],
  "hardware-engineering": [
    { label: "硬件产品经理", aliases: [], groups: ["product"] },
    { label: "嵌入式开发", aliases: [], groups: ["hardware"] },
    { label: "测试工程", aliases: [], groups: ["qa"] },
    { label: "供应链/项目管理", aliases: [], groups: ["supply-chain", "project-management"] },
    { label: "工业设计", aliases: [], groups: ["design"] },
    { label: "机器人/智能硬件应用", aliases: [], groups: ["hardware"] },
    { label: "技术支持工程师", aliases: [], groups: ["support", "tech"] },
  ],
};

const UNKNOWN_BACKGROUND_OPTIONS: DecisionOption[] = [
  { label: "技术", aliases: [], groups: ["tech", "frontend", "backend", "algorithm"] },
  { label: "产品", aliases: [], groups: ["product"] },
  { label: "设计交互", aliases: [], groups: ["design", "research"] },
  { label: "运营", aliases: [], groups: ["ops", "growth"] },
  { label: "商科金融", aliases: [], groups: ["business-analysis", "marketing", "consulting", "sales"] },
  { label: "内容传媒", aliases: [], groups: ["content", "pr", "brand"] },
  { label: "教育服务", aliases: [], groups: ["education", "support"] },
  { label: "硬件工程", aliases: [], groups: ["hardware", "qa", "supply-chain"] },
  { label: "还不确定", aliases: [], groups: ["uncertain"] },
];

const BACKGROUND_LABELS: Record<BackgroundCategory, string> = {
  "ai-tech": "AI/技术相关",
  "design-ux": "设计/交互相关",
  business: "商科相关",
  "media-content": "内容/传媒相关",
  "education-support": "教育/支持相关",
  "hardware-engineering": "硬件/工程相关",
};

const CAREER_FOLLOWUP_OPTIONS: CareerFollowupOption[] = [
  {
    label: "算法研究",
    aliases: ["算法研究", "算法", "模型训练", "算法岗"],
  },
  {
    label: "AI产品",
    aliases: ["ai产品", "ai pm", "aipm", "产品经理", "产品"],
  },
  {
    label: "AI应用开发",
    aliases: ["ai应用开发", "llm应用", "llm 应用", "应用开发", "agent开发", "agent 开发"],
  },
  {
    label: "数据工程",
    aliases: ["数据工程", "ai数据方向", "ai 数据方向", "数据方向"],
  },
  {
    label: "AI+行业",
    aliases: ["ai+行业", "ai＋行业", "ai行业", "医疗", "金融", "教育行业", "制造"],
  },
  {
    label: "技术顾问",
    aliases: ["技术顾问", "ai解决方案", "ai 解决方案", "售前技术", "解决方案顾问"],
  },
];

const CAREER_FOLLOWUP_QUESTION_PATTERNS: RegExp[] = [
  /区别是什么/,
  /有什么区别/,
  /是啥/,
  /是什么/,
  /是不是/,
  /能解释一下/,
  /不太懂/,
  /哪个好/,
  /哪个更适合/,
  /怎么选/,
];

const CAREER_FOLLOWUP_STATUS_PATTERNS: RegExp[] = [
  /很有意思/,
  /做得太少/,
  /要求太高/,
  /不会入这个/,
  /大概率进不去/,
  /没意思/,
  /好无聊/,
  /有很多种/,
  /做报表/,
];

const CAREER_INTEREST_PATTERNS: RegExp[] = [/很有意思/, /感兴趣/, /想继续看/, /想了解/, /有点想试/];
const CAREER_CONFUSION_PATTERNS: RegExp[] = [
  /区别是什么/,
  /有什么区别/,
  /是啥/,
  /是什么/,
  /是不是/,
  /能解释一下/,
  /不太懂/,
  /有很多种/,
  /哪个好/,
  /哪个更适合/,
  /怎么选/,
];
const CAREER_EXPLANATION_PATTERNS: RegExp[] = [/区别是什么/, /有什么区别/, /是啥/, /是什么/, /能解释一下/, /不太懂/];
const CAREER_REJECTION_PATTERNS: RegExp[] = [
  /要求太高/,
  /不会入这个/,
  /大概率进不去/,
  /先不考虑/,
  /不优先/,
  /不太想碰/,
  /不太想做/,
  /不适合/,
];
const CAREER_SOFT_NEGATIVE_PATTERNS: RegExp[] = [/没意思/, /有点没意思/];

function isRiskBlocked(riskLevel?: RiskLevel): boolean {
  return riskLevel === "high";
}

function shouldBlockForSafety(text: string): boolean {
  return SAFETY_BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

function shouldSkipDecisionPolicy(
  text: string,
  options?: LowEnergyDecisionOptions
): boolean {
  return isRiskBlocked(options?.riskLevel) || shouldBlockForSafety(text);
}

function hasLowEnergySignal(text: string): boolean {
  return LOW_ENERGY_PATTERNS.some((pattern) => pattern.test(text));
}

function hasCareerSignal(text: string): boolean {
  if (CAREER_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (/方向/.test(text)) {
    const hasChoiceCue = /选|主方向|不知道|迷茫|乱|求职|实习|岗位|职业/.test(text);
    const hasRoleContext = ROLE_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
    return hasChoiceCue || hasRoleContext;
  }

  return false;
}

function isInternshipRequirementOverload(
  text: string,
  options?: LowEnergyDecisionOptions
): boolean {
  if (shouldSkipDecisionPolicy(text, options)) {
    return false;
  }

  const hasOverloadPattern = INTERNSHIP_REQUIREMENT_OVERLOAD_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
  if (hasOverloadPattern) {
    return true;
  }

  const hasInternshipCue = /实习|岗位要求|招聘要求|jd/i.test(text);
  const hasOverloadCue =
    /要求好多|要求太多|看不懂|看崩|要求太高|都要会很多|真的必须|很乱|很焦虑|很累/.test(
      text
    );

  return hasInternshipCue && hasOverloadCue;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function detectBackgroundCategory(text: string): BackgroundCategory | null {
  const normalized = normalizeText(text);
  const explicitNonAi = /(不是学ai的|不是学人工智能的|不是学计算机的|不是做技术的)/.test(
    normalized
  );

  const scoreMap: Record<BackgroundCategory, number> = {
    "ai-tech": 0,
    "design-ux": 0,
    business: 0,
    "media-content": 0,
    "education-support": 0,
    "hardware-engineering": 0,
  };

  const detectors: Array<{ category: BackgroundCategory; patterns: RegExp[] }> = [
    {
      category: "ai-tech",
      patterns: [
        /ai/i,
        /人工智能/,
        /计算机/,
        /\bcs\b/i,
        /软件工程/,
        /技术/,
        /开发/,
        /算法/,
        /大模型/,
        /llm/i,
        /agent/i,
        /机器学习/,
        /深度学习/,
        /编程/,
        /代码/,
      ],
    },
    {
      category: "design-ux",
      patterns: [/设计/, /ux/i, /ui/i, /交互/, /用户体验/, /视觉/, /服务设计/, /产品设计/, /figma/i],
    },
    {
      category: "business",
      patterns: [/商科/, /管理/, /市场/, /营销/, /金融/, /会计/, /商业/, /经济/, /工商管理/],
    },
    {
      category: "media-content",
      patterns: [/传媒/, /传播/, /新闻/, /新媒体/, /内容/, /短视频/, /文案/, /编辑/, /公关/],
    },
    {
      category: "education-support",
      patterns: [/教育/, /心理/, /社工/, /社会工作/, /课程/, /老师/, /教学/, /咨询/],
    },
    {
      category: "hardware-engineering",
      patterns: [/硬件/, /电子/, /机械/, /工业/, /嵌入式/, /机器人/, /自动化/, /电路/, /供应链/],
    },
  ];

  for (const detector of detectors) {
    for (const pattern of detector.patterns) {
      if (pattern.test(normalized)) {
        scoreMap[detector.category] += 1;
      }
    }
  }

  if (explicitNonAi) {
    scoreMap["ai-tech"] = 0;
  }

  let bestCategory: BackgroundCategory | null = null;
  let bestScore = 0;

  for (const category of Object.keys(scoreMap) as BackgroundCategory[]) {
    const score = scoreMap[category];
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestScore > 0 ? bestCategory : null;
}

function getRejectedGroups(rejectedOptions: string[]): Set<string> {
  const groups = new Set<string>();

  for (const rejected of rejectedOptions) {
    const matched = REJECTION_OPTIONS.find((item) => item.label === rejected);
    if (!matched) {
      continue;
    }

    for (const group of matched.groups) {
      groups.add(group);
    }
  }

  return groups;
}

function filterOptions(
  options: DecisionOption[],
  rejectedOptions: string[],
  limit?: number
): string[] {
  const rejectedGroups = getRejectedGroups(rejectedOptions);
  const filtered = options.filter((option) => {
    if (option.label === "还不确定") {
      return true;
    }

    return !option.groups.some((group) => rejectedGroups.has(group));
  });

  const labels = filtered.map((option) => option.label);
  return typeof limit === "number" ? labels.slice(0, limit) : labels;
}

function joinLabels(labels: string[]): string {
  return labels.join("、");
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}

function splitSegments(text: string): string[] {
  return text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function findMentionedCareerOptions(text: string): string[] {
  const normalized = normalizeText(text);
  const mentioned: string[] = [];

  for (const option of CAREER_FOLLOWUP_OPTIONS) {
    if (
      option.aliases.some((alias) =>
        normalized.includes(normalizeText(alias))
      )
    ) {
      mentioned.push(option.label);
    }
  }

  return uniqueStrings(mentioned);
}

function pickSignalLines(
  text: string,
  mentionedOptions: string[]
): Array<{ line: string; options: string[] }> {
  const segments = splitSegments(text);
  const lines = segments.length > 0 ? segments : [text.trim()];

  return lines
    .map((line) => {
      const options = mentionedOptions.filter((label) =>
        CAREER_FOLLOWUP_OPTIONS.find((item) => item.label === label)?.aliases.some((alias) =>
          normalizeText(line).includes(normalizeText(alias))
        )
      );

      return {
        line,
        options,
      };
    })
    .filter((item) => item.options.length > 0);
}

function extractCareerOptionSignals(text: string): CareerOptionSignalState {
  const mentionedOptions = findMentionedCareerOptions(text);

  if (mentionedOptions.length === 0) {
    return {
      rejectedOptions: [],
      interestedOptions: [],
      confusedOptions: [],
      needsExplanationOptions: [],
      mentionedOptions: [],
    };
  }

  const lines = pickSignalLines(text, mentionedOptions);
  const rejectedOptions: string[] = [];
  const interestedOptions: string[] = [];
  const confusedOptions: string[] = [];
  const needsExplanationOptions: string[] = [];

  const overallQuestionText = text.trim();
  const compareAiProductAndBuild =
    /ai产品/i.test(overallQuestionText) &&
    /ai应用开发|llm应用|应用开发/i.test(overallQuestionText) &&
    CAREER_EXPLANATION_PATTERNS.some((pattern) => pattern.test(overallQuestionText));

  for (const { line, options } of lines) {
    const hasHardReject = CAREER_REJECTION_PATTERNS.some((pattern) => pattern.test(line));
    const hasSoftNegative = CAREER_SOFT_NEGATIVE_PATTERNS.some((pattern) => pattern.test(line));
    const hasInterest = CAREER_INTEREST_PATTERNS.some((pattern) => pattern.test(line));
    const hasConfusion = CAREER_CONFUSION_PATTERNS.some((pattern) => pattern.test(line));
    const needsExplanation = CAREER_EXPLANATION_PATTERNS.some((pattern) => pattern.test(line));

    for (const option of options) {
      if (hasHardReject) {
        rejectedOptions.push(option);
      } else if (hasSoftNegative && !/可能那种就有意思了/.test(line)) {
        rejectedOptions.push(option);
      }

      if (hasInterest) {
        interestedOptions.push(option);
      }

      if (hasConfusion || /做得太少|有很多种|sql|报表/i.test(line)) {
        confusedOptions.push(option);
      }

      if (needsExplanation || /是啥/.test(line) || /是什么/.test(line)) {
        needsExplanationOptions.push(option);
      }
    }
  }

  if (compareAiProductAndBuild) {
    confusedOptions.push("AI产品", "AI应用开发");
    needsExplanationOptions.push("AI产品", "AI应用开发");
  }

  return {
    rejectedOptions: uniqueStrings(rejectedOptions),
    interestedOptions: uniqueStrings(interestedOptions),
    confusedOptions: uniqueStrings(confusedOptions),
    needsExplanationOptions: uniqueStrings(needsExplanationOptions),
    mentionedOptions,
  };
}

function buildContainLine(text: string, hasRejectedOptions: boolean): string {
  if (hasRejectedOptions) {
    return "你其实已经不是完全没方向了，而是在慢慢排除不适合自己的路。";
  }

  if (/学得太杂/.test(text) && /深度不够|hr/i.test(text) && /时间不够|来不及/.test(text)) {
    return "你现在像是被“学得太杂”“被说深度不够”和“时间不够”一起压住了。";
  }

  if (/什么都不会/.test(text) && /实习|岗位要求/.test(text)) {
    return "你现在像是一下子被岗位要求压住了，所以才会觉得自己什么都不会。";
  }

  if (/感觉很乱|脑子很乱|一团乱|不知道怎么选|不知道该选什么/.test(text)) {
    return "你现在不是没有判断力，是脑子里太乱了，从零想方向会很耗力。";
  }

  if (/好慌|很慌|很焦虑|很迷茫|撑不住/.test(text)) {
    return "你现在更像是被焦虑和选择压力一起卡住了，所以越想越难往前走。";
  }

  return "你现在更像是被选择压力一下子拖住了，所以从零想方向会特别耗力。";
}

export function detectRejectedCareerOptions(text: string): string[] {
  const normalized = normalizeText(text);
  const matched = new Set<string>();
  const rejectionPattern = REJECTION_PATTERNS.map((item) => escapeRegExp(item)).join("|");

  for (const option of REJECTION_OPTIONS) {
    for (const alias of option.aliases) {
      const escapedAlias = escapeRegExp(alias.toLowerCase());
      const rejectBefore = new RegExp(
        `(?:${rejectionPattern}).{0,6}?${escapedAlias}`,
        "i"
      );
      const rejectAfter = new RegExp(
        `${escapedAlias}.{0,6}?(?:${rejectionPattern})`,
        "i"
      );

      if (rejectBefore.test(normalized) || rejectAfter.test(normalized)) {
        matched.add(option.label);
        break;
      }
    }
  }

  return Array.from(matched);
}

export function detectCareerOptionFollowup(
  text: string,
  options?: LowEnergyDecisionOptions
): boolean {
  if (shouldSkipDecisionPolicy(text, options)) {
    return false;
  }

  const mentionedOptions = findMentionedCareerOptions(text);
  if (mentionedOptions.length === 0) {
    return false;
  }

  const hasFollowupCue =
    CAREER_FOLLOWUP_QUESTION_PATTERNS.some((pattern) => pattern.test(text)) ||
    CAREER_FOLLOWUP_STATUS_PATTERNS.some((pattern) => pattern.test(text));

  return hasFollowupCue || mentionedOptions.length >= 2;
}

export function detectLowEnergyCareerDecision(
  text: string,
  options?: LowEnergyDecisionOptions
): boolean {
  if (shouldSkipDecisionPolicy(text, options)) {
    return false;
  }

  const rejectedOptions = detectRejectedCareerOptions(text);
  const hasLowEnergy = hasLowEnergySignal(text);
  const hasCareer = hasCareerSignal(text);

  return rejectedOptions.length > 0 || (hasLowEnergy && hasCareer);
}

export function buildLowEnergyDecisionState(
  text: string,
  options?: LowEnergyDecisionOptions
): LowEnergyDecisionState {
  if (shouldSkipDecisionPolicy(text, options)) {
    return {
      isLowEnergyDecision: false,
      rejectedOptions: [],
      candidateOptions: [],
      shouldAskBackgroundCategory: false,
    };
  }

  const rejectedOptions = detectRejectedCareerOptions(text);
  const isLowEnergyDecision = detectLowEnergyCareerDecision(text, options);
  const backgroundCategory = detectBackgroundCategory(text);

  if (!isLowEnergyDecision) {
    return {
      isLowEnergyDecision: false,
      rejectedOptions,
      candidateOptions: [],
      shouldAskBackgroundCategory: false,
    };
  }

  if (!backgroundCategory) {
    return {
      isLowEnergyDecision: true,
      rejectedOptions,
      candidateOptions: filterOptions(UNKNOWN_BACKGROUND_OPTIONS, rejectedOptions),
      shouldAskBackgroundCategory: true,
    };
  }

  const candidateOptions = filterOptions(
    SPECIFIC_BACKGROUND_OPTIONS[backgroundCategory],
    rejectedOptions,
    6
  );

  if (candidateOptions.length === 0) {
    return {
      isLowEnergyDecision: true,
      rejectedOptions,
      candidateOptions: filterOptions(UNKNOWN_BACKGROUND_OPTIONS, rejectedOptions),
      shouldAskBackgroundCategory: true,
    };
  }

  return {
    isLowEnergyDecision: true,
    rejectedOptions,
    backgroundCategory,
    candidateOptions,
    shouldAskBackgroundCategory: false,
  };
}

export function buildLowEnergyCareerReply(
  text: string,
  options?: LowEnergyDecisionOptions
): string | null {
  const state = buildLowEnergyDecisionState(text, options);

  if (!state.isLowEnergyDecision) {
    return null;
  }

  const lines: string[] = [];
  const hasRejectedOptions = state.rejectedOptions.length > 0;

  if (hasRejectedOptions) {
    lines.push(
      `好，那我们先把${joinLabels(state.rejectedOptions)}放进“不优先”，不再逼你从这里面选。`
    );
  }

  lines.push(buildContainLine(text, hasRejectedOptions));

  if (state.shouldAskBackgroundCategory) {
    lines.push(
      `我们先不做开放题，我给你几个大类，你只要先选一个更接近的就好：${joinLabels(
        state.candidateOptions
      )}。哪个比较接近你现在的背景？`
    );
    return lines.join("");
  }

  const backgroundLabel = BACKGROUND_LABELS[state.backgroundCategory as BackgroundCategory];
  lines.push(
    `我先按${backgroundLabel}帮你列一版，剩下可以先看：${joinLabels(
      state.candidateOptions
    )}。`
  );
  lines.push("你不用马上选主方向，只要先划掉：这里面有没有一看到就不想碰的？");

  return lines.join("");
}

export function buildInternshipRequirementOverloadReply(
  text: string,
  options?: LowEnergyDecisionOptions
): string | null {
  if (!isInternshipRequirementOverload(text, options)) {
    return null;
  }

  return [
    "那些要求一下子堆过来，确实会让人觉得每一条都像硬门槛。",
    "我们先不急着全看懂。我在右边放了几个入口，你只要点一个最接近的就好。",
  ].join("\n\n");
}

function buildOptionExplanation(option: string): string {
  if (option === "算法研究") {
    return "算法研究更偏模型原理、训练、调参、实验和基础深度，门槛通常会高一些。如果你已经觉得它要求太高，可以先放进“不优先”。";
  }

  if (option === "技术顾问") {
    return "技术顾问更像是帮客户判断问题、拆需求、讲方案、做 demo，再解释怎么把 AI 落到业务里。它不只是销售，更吃技术理解和沟通方案能力。";
  }

  if (option === "数据工程") {
    return "数据工程不一定只是写 SQL 做报表，也可能是数据清洗、数据管道、RAG 数据准备、模型评测数据和日志分析这类偏 AI 系统支撑的工作。";
  }

  if (option === "AI+行业") {
    return "AI+行业更偏把 AI 放进医疗、金融、教育这类具体场景里。优点是方向很实，但如果你现在没有相关入口或实习资源，先放以后再看也很正常。";
  }

  return "";
}

function buildAiProductVsApplicationExplanation(): string {
  return "AI产品更偏“决定做什么、给谁用、怎么落地”，AI应用开发更偏“把模型、API、工具接起来，真的做出一个可用功能”。如果你觉得两边都有意思，可以先把它理解成一个更偏产品判断，一个更偏工程落地。";
}

function buildPreferredFollowupOptions(
  signals: CareerOptionSignalState
): string[] {
  const remaining = signals.mentionedOptions.filter(
    (option) => !signals.rejectedOptions.includes(option)
  );

  const preferredOrder = [
    "AI产品",
    "AI应用开发",
    "数据工程",
    "技术顾问",
    "算法研究",
    "AI+行业",
  ];

  return preferredOrder.filter((option) => remaining.includes(option)).slice(0, 4);
}

export function buildCareerOptionFollowupReply(
  text: string,
  options?: LowEnergyDecisionOptions
): string | null {
  if (!detectCareerOptionFollowup(text, options)) {
    return null;
  }

  const signals = extractCareerOptionSignals(text);
  if (signals.mentionedOptions.length === 0) {
    return null;
  }

  const lines: string[] = [];

  if (signals.rejectedOptions.length > 0) {
    lines.push(
      `你这一步其实已经很有进展了：${joinLabels(
        signals.rejectedOptions
      )}可以先放进“不优先”，不是彻底否定，只是现在不拿它们当主线。`
    );
  } else {
    lines.push("你现在已经不是在从零想方向了，而是在继续比较、排除和追问细节。");
  }

  const explanationParts: string[] = [];
  const shouldExplainAiPair =
    (signals.needsExplanationOptions.includes("AI产品") &&
      signals.needsExplanationOptions.includes("AI应用开发")) ||
    (signals.confusedOptions.includes("AI产品") &&
      signals.confusedOptions.includes("AI应用开发"));

  if (shouldExplainAiPair) {
    explanationParts.push(buildAiProductVsApplicationExplanation());
  }

  if (
    signals.mentionedOptions.includes("数据工程") &&
    (signals.confusedOptions.includes("数据工程") ||
      signals.needsExplanationOptions.includes("数据工程") ||
      /sql|报表/i.test(text))
  ) {
    explanationParts.push(buildOptionExplanation("数据工程"));
  }

  if (
    signals.mentionedOptions.includes("技术顾问") &&
    (signals.needsExplanationOptions.includes("技术顾问") ||
      signals.confusedOptions.includes("技术顾问"))
  ) {
    explanationParts.push(buildOptionExplanation("技术顾问"));
  }

  if (
    !signals.rejectedOptions.includes("算法研究") &&
    signals.mentionedOptions.includes("算法研究") &&
    signals.needsExplanationOptions.includes("算法研究")
  ) {
    explanationParts.push(buildOptionExplanation("算法研究"));
  }

  if (
    !signals.rejectedOptions.includes("AI+行业") &&
    signals.mentionedOptions.includes("AI+行业") &&
    signals.needsExplanationOptions.includes("AI+行业")
  ) {
    explanationParts.push(buildOptionExplanation("AI+行业"));
  }

  if (explanationParts.length === 0) {
    if (signals.mentionedOptions.includes("技术顾问")) {
      explanationParts.push(buildOptionExplanation("技术顾问"));
    } else if (signals.mentionedOptions.includes("数据工程")) {
      explanationParts.push(buildOptionExplanation("数据工程"));
    } else if (signals.mentionedOptions.includes("AI产品") && signals.mentionedOptions.includes("AI应用开发")) {
      explanationParts.push(buildAiProductVsApplicationExplanation());
    }
  }

  if (explanationParts.length > 0) {
    lines.push(explanationParts.slice(0, 3).join(""));
  }

  const followupOptions = buildPreferredFollowupOptions(signals);

  if (
    followupOptions.length === 2 &&
    followupOptions.includes("AI产品") &&
    followupOptions.includes("AI应用开发")
  ) {
    lines.push("现在先不用马上决定。你想先看更偏产品，还是更偏开发的路径？");
    return lines.join("\n\n");
  }

  if (followupOptions.length === 1 && followupOptions[0] === "技术顾问") {
    lines.push("现在先不用一下子判断它适不适合你。你更想先看它更偏沟通方案，还是更偏技术落地？");
    return lines.join("\n\n");
  }

  if (followupOptions.length === 1 && followupOptions[0] === "数据工程") {
    lines.push("如果你只是排斥传统报表那一类，我们可以先把那部分放不优先。你更想先听偏 AI 数据支撑的那种，还是先把它整体放一边？");
    return lines.join("\n\n");
  }

  if (followupOptions.length > 0) {
    lines.push(
      `现在先不用马上决定。剩下更值得继续看的可能是：${joinLabels(
        followupOptions
      )}。你只需要先选一个最想听我继续拆的方向：${joinLabels(
        followupOptions
      )}，哪个先讲？`
    );
    return lines.join("\n\n");
  }

  return lines.join("\n\n");
}

export function resolveLowEnergyDecisionReply(
  text: string,
  options?: LowEnergyDecisionOptions
): string | null {
  if (shouldSkipDecisionPolicy(text, options)) {
    return null;
  }

  return (
    buildInternshipRequirementOverloadReply(text, options) ??
    buildCareerOptionFollowupReply(text, options) ??
    buildLowEnergyCareerReply(text, options)
  );
}

export function shouldBlockOpenEndedDecisionQuestion(
  text: string,
  options?: LowEnergyDecisionOptions
): boolean {
  return resolveLowEnergyDecisionReply(text, options) !== null;
}

export function shouldSuppressDecisionActionCard(
  text: string,
  options?: LowEnergyDecisionOptions
): boolean {
  if (shouldSkipDecisionPolicy(text, options)) {
    return false;
  }

  return (
    detectCareerOptionFollowup(text, options) ||
    detectLowEnergyCareerDecision(text, options) ||
    hasCareerSignal(text)
  );
}
