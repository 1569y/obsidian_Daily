import type {
  AgentAnalysis,
  AgentReply,
  AgentResult,
  AgentMode,
  RiskLevel,
  SceneTag,
  AgentPersona,
} from "../types";
import {
  detectCareerOptionFollowup,
  buildLowEnergyDecisionState,
  resolveLowEnergyDecisionReply,
} from "./lowEnergyDecisionPolicy";
import { resolveLongTextIntakeReply } from "./longTextIntakePolicy";

type SupportStage = "contain" | "clarify" | "ground";

export class RuleBasedAgentProvider {
  constructor(private persona: AgentPersona = "balanced_supporter") {}

  setPersona(persona: AgentPersona) {
    this.persona = persona;
  }

  async run(rawText: string): Promise<AgentResult> {
    const analysis = await this.analyze(rawText);
    const reply = await this.reply(rawText, analysis);
    return { analysis, reply };
  }

  async analyze(rawText: string): Promise<AgentAnalysis> {
    const text = rawText.trim();

    if (!text) {
      return {
        emotions: [],
        intensity: 1,
        triggers: [],
        people: [],
        needs: [],
        riskLevel: "low",
        recommendedMode: "organize",
        summary: "用户暂时没有提供足够内容。",
        sceneTags: [],
        supportFocus: "先给用户一个温和、无压力的记录入口",
        responseGoal: "鼓励用户继续表达，而不是立刻分析",
        copingDirection: [],
      };
    }

    const emotions = this.detectEmotions(text);
    const intensity = this.estimateIntensity(text);
    const triggers = this.detectTriggers(text);
    const people = this.detectPeople(text);
    const needs = this.detectNeeds(text);
    const sceneTags = this.detectSceneTags(text, triggers, people, emotions);
    const riskLevel = this.detectRiskLevel(text, intensity);
    const recommendedMode = this.recommendMode(
      text,
      intensity,
      needs,
      riskLevel,
      sceneTags
    );
    const summary = this.buildSummary(
      text,
      emotions,
      triggers,
      needs,
      people,
      sceneTags
    );

    return {
      emotions,
      intensity,
      triggers,
      people,
      needs,
      riskLevel,
      recommendedMode,
      summary,
      sceneTags,
      supportFocus: this.buildSupportFocus(
        text,
        emotions,
        triggers,
        people,
        sceneTags
      ),
      responseGoal: this.buildResponseGoal(
        text,
        recommendedMode,
        riskLevel,
        sceneTags
      ),
      copingDirection: this.buildCopingDirection(
        text,
        recommendedMode,
        sceneTags,
        triggers
      ),
    };
  }

  async reply(rawText: string, analysis: AgentAnalysis): Promise<AgentReply> {
    if (analysis.riskLevel !== "high") {
      const longTextIntake = resolveLongTextIntakeReply(rawText, {
        riskLevel: analysis.riskLevel,
      });

      if (longTextIntake) {
        return {
          mode: "organize",
          message: longTextIntake.reply,
        };
      }

      const decisionReply = resolveLowEnergyDecisionReply(rawText, {
        riskLevel: analysis.riskLevel,
      });

      if (decisionReply) {
        return {
          mode: "organize",
          message: decisionReply,
        };
      }
    }

    const stage = this.inferSupportStage(rawText, analysis);

    if (stage === "contain") {
      return {
        mode: "comfort",
        message: this.buildContainReply(rawText, analysis),
      };
    }

    if (stage === "clarify") {
      return {
        mode: "clarify",
        message: this.buildClarifyReply(rawText, analysis),
        followUpPrompt: this.buildClarifyFollowup(rawText, analysis),
      };
    }

    return {
      mode: "organize",
      message: this.buildGroundReply(rawText, analysis),
    };
  }

  private detectEmotions(text: string): string[] {
    const matched = new Set<string>();

    const emotionRules: Array<[string, RegExp]> = [
      ["焦虑", /焦虑|紧张|慌|不安|压力大|喘不过气|好慌|太慌了|心里发慌/],
      ["委屈", /委屈|难受|心酸|不被理解|凭什么|为什么总是我/],
      ["愤怒", /生气|火大|烦死|气死|恼火|受不了|烦得很/],
      ["难过", /难过|伤心|失落|低落|想哭|沮丧/],
      ["自我怀疑", /我是不是很差|怀疑自己|不够好|是不是我的问题|什么都不会|我不配|不行吧|能力不够/],
      ["崩溃", /我不行了|撑不住了|快崩了|受不了了|我真的不行了|完蛋了|要疯了/],
      ["压抑", /压抑|窒息|堵得慌|憋得慌/],
      ["羞耻", /丢脸|没脸|很羞耻|很失败|太差劲/],
    ];

    for (const [emotion, rule] of emotionRules) {
      if (rule.test(text)) {
        matched.add(emotion);
      }
    }

    if (matched.size === 0) {
      matched.add("待识别");
    }

    return Array.from(matched);
  }

  private estimateIntensity(text: string): number {
    let score = 4;

    const strongPatterns = [
      /崩溃/,
      /撑不住/,
      /受不了/,
      /我不行了/,
      /特别难受/,
      /真的很/,
      /非常/,
      /快炸了/,
      /窒息/,
      /完蛋了/,
      /根本不行/,
      /好慌/,
    ];

    const mediumPatterns = [
      /有点/,
      /烦/,
      /难受/,
      /焦虑/,
      /委屈/,
      /压抑/,
      /不会/,
      /投不了/,
      /找不到/,
    ];

    for (const pattern of strongPatterns) {
      if (pattern.test(text)) score += 1.2;
    }

    for (const pattern of mediumPatterns) {
      if (pattern.test(text)) score += 0.5;
    }

    return Math.max(1, Math.min(10, Math.round(score)));
  }

  private detectTriggers(text: string): string[] {
    const matched = new Set<string>();

    const triggerRules: Array<[string, RegExp]> = [
      ["工作反馈", /开会|工作|老板|领导|同事|反馈|项目/],
      ["学习压力", /考试|作业|论文|老师|成绩|学习|课程|选课|ddl|deadline/],
      ["关系冲突", /吵架|冷淡|不回消息|关系|对象|伴侣|分手|拉扯/],
      ["家庭压力", /我妈|我爸|父母|家里人|家人|妈妈|爸爸/],
      ["被比较", /为什么别人|别人都可以|别人都行|你看看别人|拿我和别人比/],
      ["被否定", /你不行|总说我|否定我|骂我|说我/],
      ["自我否定", /我是不是很差|我不够好|怀疑自己|什么都不会|能力不够|不配/],
      ["身体疲惫", /没睡好|很累|睡不着|疲惫|好累|累死了/],

      // 求职 / 实习场景
      ["实习压力", /实习|找工|找工作|秋招|春招|暑期实习|岗位|岗位要求|JD|简历|投递|投简历|面试|offer|海投|上岸/],
      ["经验不足", /没经验|没有经验|经历不够|项目不够|不会做|学得太杂|不够扎实|不够精/],
      ["方向摇摆", /什么方向|不知道投什么|不知道选什么|不知道找什么|方向太多|方向不明确/],
    ];

    for (const [trigger, rule] of triggerRules) {
      if (rule.test(text)) {
        matched.add(trigger);
      }
    }

    return Array.from(matched);
  }

  private detectPeople(text: string): string[] {
    const people = new Set<string>();

    const rules: Array<[string, RegExp]> = [
      ["母亲", /我妈|妈妈|母亲/],
      ["父亲", /我爸|爸爸|父亲/],
      ["家人", /父母|家人|家里人/],
      ["老板", /老板|领导/],
      ["同事", /同事/],
      ["老师", /老师/],
      ["伴侣", /对象|男朋友|女朋友|伴侣/],
      ["朋友", /朋友|闺蜜|兄弟|室友/],
      ["面试官", /面试官|hr|招聘方/],
    ];

    for (const [person, rule] of rules) {
      if (rule.test(text)) {
        people.add(person);
      }
    }

    return Array.from(people);
  }

  private detectNeeds(text: string): string[] {
    const matched = new Set<string>();

    if (/安慰|陪陪我|很难受|撑不住|我不行了|好慌/.test(text)) {
      matched.add("安抚");
    }

    if (/为什么|我不知道|到底怎么了|说不清|理一理|想一想/.test(text)) {
      matched.add("梳理");
    }

    if (/帮我总结|整理一下|归档|记录/.test(text)) {
      matched.add("整理");
    }

    if (/怎么办|怎么处理|怎么回复|怎么做|怎么选|怎么准备|该怎么找/.test(text)) {
      matched.add("建议");
    }

    if (matched.size === 0) {
      matched.add("安抚");
    }

    return Array.from(matched);
  }

  private detectSceneTags(
    text: string,
    triggers: string[],
    people: string[],
    emotions: string[]
  ): SceneTag[] {
    const tags = new Set<SceneTag>();

    const hasMother = people.includes("母亲");
    const hasFather = people.includes("父亲");
    const hasFamily = people.includes("家人") || hasMother || hasFather;

    if (hasFamily || triggers.includes("家庭压力")) tags.add("family-pressure");
    if (triggers.includes("被比较")) tags.add("comparison");
    if (triggers.includes("被否定")) tags.add("negation");

    // 暂时把实习/求职也归到 work-feedback 这个大类，避免改 types
    if (triggers.includes("工作反馈") || triggers.includes("实习压力")) {
      tags.add("work-feedback");
    }

    if (triggers.includes("关系冲突")) tags.add("relationship-conflict");
    if (triggers.includes("学习压力")) tags.add("study-pressure");
    if (triggers.includes("身体疲惫")) tags.add("fatigue");

    if (triggers.includes("自我否定") || emotions.includes("自我怀疑")) {
      tags.add("self-doubt");
    }

    if (emotions.includes("崩溃") || emotions.includes("压抑")) {
      tags.add("burnout");
    }

    return Array.from(tags);
  }

  private detectRiskLevel(text: string, intensity: number): RiskLevel {
    const highRiskPatterns = [
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

    for (const pattern of highRiskPatterns) {
      if (pattern.test(text)) return "high";
    }

    if (intensity >= 8) return "medium";
    return "low";
  }

  private recommendMode(
    text: string,
    intensity: number,
    needs: string[],
    riskLevel: RiskLevel,
    sceneTags: SceneTag[]
  ): AgentMode {
    if (
      riskLevel !== "high" &&
      detectCareerOptionFollowup(text, { riskLevel })
    ) {
      return "organize";
    }

    const lowEnergyDecisionState = buildLowEnergyDecisionState(text, {
      riskLevel,
    });

    if (riskLevel !== "high" && lowEnergyDecisionState.isLowEnergyDecision) {
      return "organize";
    }

    const stage = this.inferSupportStage(text, {
      emotions: [],
      intensity,
      triggers: [],
      people: [],
      needs,
      riskLevel,
      recommendedMode: "clarify",
      summary: "",
      sceneTags,
      supportFocus: "",
      responseGoal: "",
      copingDirection: [],
    });

    if (stage === "contain") return "comfort";
    if (stage === "ground") return "organize";
    return "clarify";
  }

  private buildSummary(
    text: string,
    emotions: string[],
    triggers: string[],
    needs: string[],
    people: string[],
    sceneTags: SceneTag[]
  ): string {
    const emotionText = emotions.join("、");
    const triggerText = triggers.length ? triggers.join("、") : "暂未明确";
    const peopleText = people.length ? people.join("、") : "暂未明确";
    const needText = needs.join("、");

    if (triggers.includes("实习压力")) {
      return `用户当前围绕实习或求职产生明显压力，主要情绪为${emotionText}，涉及人物为${peopleText}，触发因素包括${triggerText}，目前更需要${needText}。`;
    }

    if (sceneTags.includes("family-pressure") && sceneTags.includes("comparison")) {
      return `用户在家庭互动中感受到明显的比较压力，当前主要情绪为${emotionText}，涉及人物为${peopleText}，触发因素包括${triggerText}，目前更需要${needText}。`;
    }

    return `用户当前主要表现为${emotionText}，涉及人物为${peopleText}，可能与${triggerText}有关，目前更需要${needText}。原始内容长度约 ${text.length} 字。`;
  }

  private buildSupportFocus(
    text: string,
    emotions: string[],
    triggers: string[],
    people: string[],
    sceneTags: SceneTag[]
  ): string {
    const practicalTarget = this.detectPracticalTarget(text);
    const hasMother = people.includes("母亲");
    const hasFamily = sceneTags.includes("family-pressure");
    const hasComparison = sceneTags.includes("comparison");
    const hasNegation = sceneTags.includes("negation");
    const hasBurnout = sceneTags.includes("burnout");
    const hasSelfDoubt = sceneTags.includes("self-doubt");

    if (this.detectRiskLevel(text, 0) === "high") {
      return "优先确认用户当下的安全，并尽量把人拉回现实支持";
    }

    if (this.isVagueEmotionExpression(text)) {
      return "原因暂不明确的烦躁/堵住";
    }

    if (detectCareerOptionFollowup(text, { riskLevel: this.detectRiskLevel(text, 0) })) {
      return "继续解释候选方向，并帮用户把范围再缩小一点";
    }

    const lowEnergyDecisionState = buildLowEnergyDecisionState(text, {
      riskLevel: this.detectRiskLevel(text, 0),
    });

    if (lowEnergyDecisionState.isLowEnergyDecision) {
      return "降低认知负担，帮助用户从排除开始";
    }

    if (triggers.includes("实习压力") || practicalTarget === "实习") {
      return "先接住实习压力和能力焦虑夹在一起的那种慌乱感";
    }

    if (hasMother && hasComparison) {
      return "先接住被母亲比较后产生的委屈和压迫感";
    }

    if (hasFamily && hasComparison && hasNegation) {
      return "先接住家庭比较和否定带来的受伤感";
    }

    if (hasBurnout) {
      return "先接住已经接近承受边缘的疲惫和崩溃感";
    }

    if (hasSelfDoubt) {
      return "先接住被触发后的自我怀疑和否定感";
    }

    if (emotions.includes("委屈")) {
      return "先接住被冒犯或不被理解后的委屈";
    }

    if (emotions.includes("焦虑")) {
      return "先接住此刻持续拉扯的紧张和不安";
    }

    return "先接住用户此刻最明显的情绪波动";
  }

  private buildResponseGoal(
    text: string,
    recommendedMode: AgentMode,
    riskLevel: RiskLevel,
    sceneTags: SceneTag[]
  ): string {
    const practicalTarget = this.detectPracticalTarget(text);

    if (riskLevel === "high") {
      return "优先稳定情绪并引导用户转向更安全的支持";
    }

    if (this.isVagueEmotionExpression(text)) {
      return "不急着找原因，先被接住";
    }

    if (detectCareerOptionFollowup(text, { riskLevel })) {
      return "先回答候选方向的区别，再继续缩小范围";
    }

    const lowEnergyDecisionState = buildLowEnergyDecisionState(text, {
      riskLevel,
    });

    if (lowEnergyDecisionState.isLowEnergyDecision) {
      return "需要先降低认知负担，由系统提供候选项";
    }

    if (practicalTarget === "实习") {
      return "先降低实习焦虑带来的羞耻感，再慢慢把问题收窄到一个现实点上";
    }

    if (recommendedMode === "comfort") {
      return "先降低被压迫感和被否定感，给用户一点稳定空间";
    }

    if (recommendedMode === "clarify") {
      return "先帮用户把情绪和触发点分开，看清最刺痛的部分";
    }

    if (recommendedMode === "organize") {
      return "先把混乱的感受整理成可保存、可回看的结构";
    }

    return "先提供温和、低刺激、不过度说教的支持";
  }

  private buildCopingDirection(
    text: string,
    recommendedMode: AgentMode,
    sceneTags: SceneTag[],
    triggers: string[]
  ): string[] {
    const practicalTarget = this.detectPracticalTarget(text);

    if (this.detectRiskLevel(text, 0) === "high") {
      return [
        "先不要一个人硬扛",
        "先联系一个你信得过的人",
        "先让自己去到有人在的地方",
      ];
    }

    if (this.isVagueEmotionExpression(text)) {
      return [
        "可以先描述身体感受或最近压力，不强迫解释",
        "先不急着找出准确原因",
        "先把这股烦和堵的感觉留住",
      ];
    }

    if (
      detectCareerOptionFollowup(text, {
        riskLevel: this.detectRiskLevel(text, 0),
      })
    ) {
      return [
        "先把已经不优先的方向放到一边",
        "先听清楚剩下方向的区别",
        "先挑一个最想继续拆的方向",
      ];
    }

    const lowEnergyDecisionState = buildLowEnergyDecisionState(text, {
      riskLevel: this.detectRiskLevel(text, 0),
    });

    if (lowEnergyDecisionState.isLowEnergyDecision) {
      return [
        "先做排除题，而不是直接选最终方向",
        "先缩小候选范围，再决定主方向",
        "先把明显不想碰的放进不优先",
      ];
    }

    if (practicalTarget === "实习") {
      return ["先不要一下子看全部岗位", "先挑一类最想投的方向", "先看最常出现的一两项要求"];
    }

    if (sceneTags.includes("family-pressure") && sceneTags.includes("comparison")) {
      return ["先不继续争辩", "慢一点呼吸", "把最刺痛的一句话写下来"];
    }

    if (sceneTags.includes("work-feedback")) {
      return ["先把反馈和自我评价分开", "写下事实部分", "暂时不急着下结论"];
    }

    if (sceneTags.includes("relationship-conflict")) {
      return ["先暂停反复猜测", "写下你最在意的点", "给自己一点缓冲时间"];
    }

    if (recommendedMode === "comfort") {
      return ["慢一点呼吸", "先坐稳或喝口水", "先不用急着解释清楚"];
    }

    if (recommendedMode === "clarify") {
      return ["先写下发生了什么", "再写下你感觉到了什么", "把事实和猜测分开"];
    }

    return ["先把这段感受保存下来", "晚一点再回看", "只补充最关键的一句"];
  }

  private inferSupportStage(
    rawText: string,
    analysis: AgentAnalysis
  ): SupportStage {
    const text = rawText.trim();
    const practicalTarget = this.detectPracticalTarget(text);

    const isOverwhelmed =
      analysis.intensity >= 8 ||
      analysis.sceneTags.includes("burnout") ||
      /完蛋了|撑不住|受不了|好慌|太慌了|我不行了|根本不知道|完全乱了/.test(text);

    if (analysis.riskLevel === "high" || isOverwhelmed) {
      return "contain";
    }

    if (this.isVagueEmotionExpression(text)) {
      return "contain";
    }

    const hasConcretePracticalCue =
      !!practicalTarget &&
      /想找|想投|简历|面试|岗位|岗位要求|要求|经验|不会|不符合|方向|怎么准备|怎么选|怎么找|投不了|找不到/.test(
        text
      );

    if (hasConcretePracticalCue) {
      return "ground";
    }

    const needsClarify =
      analysis.needs.includes("梳理") ||
      analysis.sceneTags.includes("self-doubt") ||
      analysis.sceneTags.includes("family-pressure") ||
      analysis.sceneTags.includes("comparison") ||
      analysis.sceneTags.includes("relationship-conflict") ||
      /为什么|到底|其实|但是|可是|又|一边|另一方面/.test(text);

    if (needsClarify) {
      return "clarify";
    }

    if (analysis.intensity >= 6) {
      return "contain";
    }

    return "clarify";
  }

  private detectPracticalTarget(text: string): string | null {
    if (/AI开发|AI 開發|人工智能开发|算法|机器学习|大模型|后端|前端|数据分析/.test(text)) {
      return "实习";
    }

    if (/实习|岗位|简历|投递|投简历|面试|offer|秋招|春招|海投|上岸/.test(text)) {
      return "实习";
    }

    if (/考试|作业|论文|成绩|课程|老师|学习/.test(text)) {
      return "学业";
    }

    if (/对象|伴侣|关系|吵架|冷淡|分手/.test(text)) {
      return "关系";
    }

    return null;
  }

  private isVagueEmotionExpression(text: string): boolean {
    return (
      /有点烦|有些烦|心里堵|堵得慌|有点难受|说不上来|说不出来|说不上|不知道为什么/.test(
        text
      ) &&
      !/实习|找工作|求职|岗位|投递|简历|面试|offer|秋招|春招|方向|职业|算法|AI产品|AI应用开发|技术顾问|数据工程/.test(
        text
      )
    );
  }

  private buildContainReply(rawText: string, analysis: AgentAnalysis): string {
    const text = rawText.trim();
    const practicalTarget = this.detectPracticalTarget(text);

    const hasFamily = analysis.sceneTags.includes("family-pressure");
    const hasComparison = analysis.sceneTags.includes("comparison");
    const hasNegation = analysis.sceneTags.includes("negation");
    const hasCollapse = analysis.sceneTags.includes("burnout");
    const hasSelfDoubt = analysis.sceneTags.includes("self-doubt");
    const hasWork = analysis.sceneTags.includes("work-feedback");
    const hasRelationship = analysis.sceneTags.includes("relationship-conflict");
    const hasStudy = analysis.sceneTags.includes("study-pressure");

    if (analysis.riskLevel === "high") {
      return "我现在最在意的是你的安全。你先不要一个人扛，好吗？现在能不能先联系一个你信得过的人，或者让自己去到有人在的地方？如果有马上伤害自己的冲动，请联系当地紧急服务；如果在美国，也可以拨打或短信 988。";
    }

    if (this.isVagueEmotionExpression(text)) {
      return "听起来你现在就是有点烦、有点堵，但原因还说不上来。那我们先不急着找解释，先把这股感觉接住。";
    }

    if (this.persona === "gentle_companion") {
      if (practicalTarget === "实习") {
        return "听起来你最近像是一直被“实习要求很多”和“自己好像还不够”夹在一起。现在这种环境下，找实习本来就很容易让人越看越慌。";
      }

      if (hasCollapse) {
        return "你像是已经被压到快没有力气了。现在先不用急着想清楚，也不用逼自己立刻振作，我们先把这一刻接住。";
      }

      if (hasFamily && hasComparison && hasNegation) {
        return "被家里这样比较和否定，真的会很伤。难受的不只是那几句话，而是它们很容易让人一下子觉得自己怎么做都不够。";
      }

      if (hasWork || hasStudy) {
        return "你现在像是被很多事情一起压住了，不是不想动，而是一下子根本不知道先抓哪一头。";
      }

      if (hasRelationship) {
        return "你这会儿难受的，好像不只是那件事本身，还有那种自己没有被好好放在心上的感觉。";
      }

      if (hasSelfDoubt) {
        return "我听到的，不只是累和慌，还有一点对自己的怀疑。先提醒你一下：你现在很难受，不等于你真的不行。";
      }

      return "听起来你现在真的挺难受的。我们先不急着分析，也不急着解决，先把这一刻接住。";
    }

    if (this.persona === "calm_organizer") {
      if (practicalTarget === "实习") {
        return "你现在更像是被实习门槛和自我要求同时拉扯住了，所以主观感受会很快从“慌”变成“乱”。现在这种局面下，会焦虑是很正常的。";
      }

      if (hasCollapse) {
        return "你当前的情绪负荷已经很高了。此时更重要的不是继续分析，而是先把整个人稳下来。";
      }

      if (hasFamily && hasComparison && hasNegation) {
        return "当前最刺痛你的，不只是内容本身，而是家庭场景里的比较和否定把它放大成了对自我价值的打击。";
      }

      if (hasWork || hasStudy) {
        return "你现在更像是被多条任务线同时拉扯住了，所以主观感受会从“忙”很快变成“麻”和“乱”。";
      }

      if (hasSelfDoubt) {
        return "当前核心不只是压力本身，而是压力已经开始被你内化成对能力的怀疑。";
      }

      return "你当前的状态更像是情绪和任务压力叠在了一起。先接住这部分感受，会比立刻找答案更重要。";
    }

    if (practicalTarget === "实习") {
      return "听起来你最近像是一直被“要求很多”和“自己还不够”这两件事夹在中间。现在这个环境下，找实习本来就很容易让人越看越慌。";
    }

    if (hasCollapse) {
      return "你现在像是已经被很多事一起压到快没有力气了。先不用急着处理全部，我们只先把这一刻接住。";
    }

    if (hasFamily && hasComparison && hasNegation) {
      return "被这样比较和否定，真的会让人一下子很伤。最难受的往往不只是那些话，而是它们很容易把人往“是不是我不够好”那里推。";
    }

    if (hasWork || hasStudy) {
      return "你现在更像是被事情一起压住了，不是不知道要努力，而是每一头都在拽你，所以整个人会先乱掉。";
    }

    if (hasRelationship) {
      return "你现在难受的，好像不只是那件事本身，还有那种自己没有被稳稳接住的感觉。";
    }

    if (hasSelfDoubt) {
      return "这段话里除了压力，我还听到一点对自己的怀疑。先提醒你：眼下的卡住，不等于你真的不够好。";
    }

    return "听起来你现在已经有点被压住了。先别急着把全部都理顺，我们只先抓住最难受的这一点。";
  }

  private buildClarifyReply(rawText: string, analysis: AgentAnalysis): string {
    const text = rawText.trim();
    const practicalTarget = this.detectPracticalTarget(text);

    const hasFamily = analysis.sceneTags.includes("family-pressure");
    const hasComparison = analysis.sceneTags.includes("comparison");
    const hasNegation = analysis.sceneTags.includes("negation");
    const hasWork = analysis.sceneTags.includes("work-feedback");
    const hasRelationship = analysis.sceneTags.includes("relationship-conflict");
    const hasStudy = analysis.sceneTags.includes("study-pressure");
    const hasSelfDoubt = analysis.sceneTags.includes("self-doubt");

    if (/我现在真的很乱|我现在很乱|脑子很乱|心里很乱|好乱|我不知道怎么办|我现在有点崩|我现在很慌|我现在很焦虑|我有点撑不住|我不知道该怎么说|我说不清/.test(text)) {
      return "乱的时候不用急着一下子理清楚，我们先停一下。";
    }

    if (this.persona === "gentle_companion") {
      if (practicalTarget === "实习") {
        return "听起来你不是完全没方向，而是越看这些要求，越容易觉得自己差得很多。更卡住你的，好像不只是实习本身，还有那种“我是不是还不够”的感觉。";
      }

      if (hasFamily && hasComparison && hasNegation) {
        return "我先陪你轻轻收一下：真正刺痛你的，可能不只是那些话本身，而是它们一下子把“被比较”和“被否定”都推到了你身上。";
      }

      if (hasWork || hasStudy) {
        return "我先陪你收一下这团乱：表面上是事情很多，更深一点可能是每件事一拉出来，都会碰到你对自己“够不够好”的担心。";
      }

      if (hasRelationship) {
        return "我先陪你理一下：这次让你难受的，也许不只是发生了什么，还有它让你感觉自己是不是没有被认真放在心上。";
      }

      if (hasSelfDoubt) {
        return "我先陪你看一眼这段话里的关键点：现在卡住你的，不只是现实压力，还有它已经开始碰到你对自己的怀疑。";
      }

      return "我先陪你把这一段收窄一点：表面上是事情让你不舒服，更深一点，可能是它刚好碰到了你心里最在意的地方。";
    }

    if (this.persona === "calm_organizer") {
      if (practicalTarget === "实习") {
        return "你当前更核心的拉扯，可能不是“有没有实习”，而是岗位要求正在被你体验成对能力的持续否定。现在最需要分开看的是：哪些是现实门槛，哪些已经被你听成了自我评价。";
      }

      if (hasFamily && hasComparison && hasNegation) {
        return "这段内容的核心刺痛点，不是单一事件，而是家庭情境中的比较与否定被你体验成了持续性的价值打击。";
      }

      if (hasWork || hasStudy) {
        return "当前最需要区分的是：哪些是客观任务压力，哪些已经被你主观体验成了对能力的否定。";
      }

      if (hasRelationship) {
        return "这里更核心的可能不是事件表面，而是你从中读到的关系信号，比如忽视、不确定或不被重视。";
      }

      if (hasSelfDoubt) {
        return "当前更关键的问题不是压力本身，而是压力已经开始转化成了对自我能力的负面判断。";
      }

      return "我先帮你把重点收窄：现在真正卡住你的，可能不是事情本身，而是事情触发出来的那部分内在压力。";
    }

    if (practicalTarget === "实习") {
      return "听起来你不是完全没方向，而是越看这些岗位要求，越容易觉得自己还差很多。更卡住你的，好像不只是实习本身，而是它会很快把你推到“我是不是不够好”那里去。";
    }

    if (hasFamily && hasComparison && hasNegation) {
      return "我先替你收一下重点：最刺痛你的，可能不只是那些话本身，而是它们同时带来了比较、否定和自我怀疑。";
    }

    if (hasWork || hasStudy) {
      return "我先帮你收一下这段话：现在表面上是事情堆在一起，更深一点可能是每件事都在碰你“我到底够不够好”的那一下。";
    }

    if (hasRelationship) {
      return "我先帮你理一理：你难受的也许不只是这次具体发生了什么，还有它让你感到自己是不是没有被好好在意。";
    }

    if (hasSelfDoubt) {
      return "我先帮你抓一下重点：卡住你的不只是现实压力，还有它已经开始往自我怀疑那里走了。";
    }

    return "我先帮你把这段内容收窄一点：事情本身是一层，它带来的那种内在拉扯，可能才是最卡住你的地方。";
  }

  private buildClarifyFollowup(rawText: string, analysis: AgentAnalysis): string {
    const text = rawText.trim();
    const practicalTarget = this.detectPracticalTarget(text);

    const hasFamily = analysis.sceneTags.includes("family-pressure");
    const hasComparison = analysis.sceneTags.includes("comparison");
    const hasWork = analysis.sceneTags.includes("work-feedback");
    const hasRelationship = analysis.sceneTags.includes("relationship-conflict");
    const hasStudy = analysis.sceneTags.includes("study-pressure");
    const hasSelfDoubt = analysis.sceneTags.includes("self-doubt");

    if (practicalTarget === "实习") {
      if (/AI开发|算法|机器学习|大模型|后端|前端|数据分析/.test(text)) {
        return "那你现在最想靠近的，是这个方向本身，还是你更想先确认自己能不能够到它？";
      }

      return "如果只挑一个点，现在最压你的，是岗位要求太多，还是你会忍不住觉得自己还不够？";
    }

    if (/我现在真的很乱|我现在很乱|脑子很乱|心里很乱|好乱|我不知道怎么办|我现在有点崩|我现在很慌|我现在很焦虑|我有点撑不住|我不知道该怎么说|我说不清/.test(text)) {
      return "你现在不需要解释很多，我在右边放了几个小选项。你只要点一个最接近的就好。";
    }

    if (this.persona === "gentle_companion") {
      if (hasFamily && hasComparison) {
        return "如果只挑一个点，你觉得现在最扎你的，是那一句话，还是那种“怎么都不被认可”的感觉？";
      }

      if (hasWork || hasStudy) {
        return "如果只挑一个点，现在最压你的，是事情太多本身，还是你会忍不住觉得自己不够好？";
      }

      if (hasRelationship) {
        return "如果只挑一个点，你更在意的，是那件事本身，还是那种被忽视的感觉？";
      }

      if (hasSelfDoubt) {
        return "如果只挑一个点，现在最卡你的，是外面的压力，还是你开始不相信自己？";
      }

      return "如果只挑一个点，你觉得现在最难受的那一下，落在哪儿？";
    }

    if (this.persona === "calm_organizer") {
      if (hasFamily && hasComparison) {
        return "如果继续梳理，建议先只回答一个问题：最刺痛你的，是具体的话，还是它让你形成的自我判断？";
      }

      if (hasWork || hasStudy) {
        return "如果继续梳理，建议先只区分一件事：当前更重的是任务压力，还是能力焦虑？";
      }

      if (hasRelationship) {
        return "如果继续梳理，建议先只确认一点：你更在意的是事实本身，还是关系含义？";
      }

      if (hasSelfDoubt) {
        return "如果继续梳理，建议先区分：现实问题是什么，自我否定又是从哪一步开始的？";
      }

      return "如果继续梳理，建议先只回答一个问题：现在最核心的压力点是什么？";
    }

    if (hasFamily && hasComparison) {
      return "如果只挑一个点，现在最刺痛你的，是那句比较本身，还是它让你一下子开始怀疑自己？";
    }

    if (hasWork || hasStudy) {
      return "如果只挑一个点，现在最压你的，是事情太多，还是你觉得自己哪块都还不够好？";
    }

    if (hasRelationship) {
      return "如果只挑一个点，你更想先说发生了什么，还是说你最在意的感觉是什么？";
    }

    if (hasSelfDoubt) {
      return "如果只挑一个点，现在最卡你的，是现实上的难，还是那种“我是不是不行”的感觉？";
    }

    return "如果只挑一个点，你想先说哪一块？";
  }

  private buildGroundReply(rawText: string, analysis: AgentAnalysis): string {
    const text = rawText.trim();
    const practicalTarget = this.detectPracticalTarget(text);

    if (this.persona === "gentle_companion") {
      if (practicalTarget === "实习") {
        if (/AI开发|算法|机器学习|大模型|后端|前端|数据分析/.test(text)) {
          return "听起来这确实是你比较想靠近的方向。那我们先不从零想全部方向，只先把这类岗位最常出现的要求缩成几块：经验、项目、表达方式。";
        }

        if (/简历/.test(text)) {
          return "简历这件事会让人很容易一下子把自己整体否掉。那我们先不看全部，只先挑一处你最没底的地方，好吗？";
        }

        if (/面试/.test(text)) {
          return "面试会让人特别容易把一次卡壳听成“我是不是不行”。那我们先不复盘全部，只先挑你最容易被问住的一块。";
        }

        return "听起来你不是完全没方向，而是越往前看，越容易被“还不够”这件事压住。那我们先不从零想全部方向，可以先从技术、产品、设计交互、运营里圈一个更接近的。";
      }

      if (practicalTarget === "学业") {
        return "那我们先不一下子看全部课程，只先抓最压你的那一门，或者最临近的那个截止点。";
      }

      if (practicalTarget === "关系") {
        return "那我们先不急着把整个关系都想清楚，只先看这一回最刺痛你的那一下到底是什么。";
      }

      return "那我们先不处理全部，只先挑眼前最具体、最压你的那一小块。";
    }

    if (this.persona === "calm_organizer") {
      if (practicalTarget === "实习") {
        if (/AI开发|算法|机器学习|大模型|后端|前端|数据分析/.test(text)) {
          return "这个方向本身没有问题。下一步先不要评价自己配不配，而是先把这类岗位最常出现的要求缩成 1 到 2 块，看更卡你的是经验、项目，还是表达方式。";
        }

        if (/简历/.test(text)) {
          return "简历问题更适合拆成局部处理。建议先只看一个现实点：是经历太少，还是现有经历没有被表达清楚。";
        }

        if (/面试/.test(text)) {
          return "面试焦虑先不要整体处理。建议先锁定一个问题：你最常卡在自我介绍、项目细节，还是基础知识。";
        }

        return "当前更适合先缩小范围，而不是从零想完整方向。可以先从技术、产品、设计交互、运营这些大类里圈一个更接近的。";
      }

      return "当前更适合把问题缩成一个现实对象，而不是继续围着整体感受打转。";
    }

    if (practicalTarget === "实习") {
      if (/AI开发|算法|机器学习|大模型|后端|前端|数据分析/.test(text)) {
        return "这个方向听起来确实是你比较想靠近的。那我们先不从零想全部方向，只先把这类岗位最常出现的要求看成几块：经验、项目、表达方式。";
      }

      if (/简历/.test(text)) {
        return "简历这件事最容易让人一下子把自己整体否掉。那我们先不看全部，只先挑一处你最没底的部分，比如经历、项目，或者表达方式。";
      }

      if (/面试/.test(text)) {
        return "面试卡住很正常，因为它特别容易把人往“我是不是不行”那里推。那我们先不复盘全部，只先抓你最容易被问住的那一类问题。";
      }

      return "听起来你不是完全没方向，而是越接近这个方向，越会觉得自己经验不够。那我们先不从零想全部方向，可以先从技术、产品、设计交互、运营这些大类里圈一个更接近的。";
    }

    if (practicalTarget === "学业") {
      return "那我们先不一下子看全部学业压力，只先抓最临近、最具体的那一项。";
    }

    if (practicalTarget === "关系") {
      return "那我们先不急着处理整段关系，只先看这一回最具体的那个点。";
    }

    return "那我们先不碰全部，只先把问题缩成眼前这一小块。";
  }

  private buildOrganizeReply(analysis: AgentAnalysis): string {
    const emotionText = analysis.emotions.join("、");
    const needText = analysis.needs.join("、");

    if (this.persona === "gentle_companion") {
      return `我先轻轻帮你把这段感受收好了：你现在主要是${emotionText}，也更需要${needText}。这样你后面如果想继续说，或者只是先留个记录，都会轻松一点。`;
    }

    if (this.persona === "calm_organizer") {
      return `我已经先把这段内容整理成一个初步轮廓：主要情绪是${emotionText}，当前更偏向${needText}。这份结构更适合后续保存和回看。`;
    }

    return `我先帮你把这段感受整理成一个初步轮廓了：主要情绪是${emotionText}，当前更需要的是${needText}。这样后面无论是继续说，还是保存成记录，都会更清楚一点。`;
  }
}
