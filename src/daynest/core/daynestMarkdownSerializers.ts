import type {
  MoonDailyLog,
  MoonExpense,
  MoonTask,
  MoonTimer,
} from "./daynestTypes";

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatList(items: string[] | undefined): string | null {
  if (!items || items.length === 0) {
    return null;
  }

  return items.map((item) => `- ${escapeMarkdownText(item)}`).join("\n");
}

function formatLinkedIds(label: string, ids: string[] | undefined): string | null {
  if (!ids || ids.length === 0) {
    return null;
  }

  return `## ${label}\n${ids.map((id) => `- ${escapeMarkdownText(id)}`).join("\n")}`;
}

export function escapeMarkdownText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, " ")
    .replace(/([*_`[\]|])/g, "\\$1")
    .trim();
}

export function formatDayNestDate(date: string): string {
  return date.trim();
}

export function formatDayNestDateTime(dateTime: string): string {
  return dateTime.trim();
}

export function serializeTaskAsObsidianCheckbox(task: MoonTask): string {
  const checkbox = task.status === "done" ? "x" : " ";
  const dueDateSuffix = isNonEmptyString(task.dueDate)
    ? ` | due: ${formatDayNestDate(task.dueDate)}`
    : "";

  return `- [${checkbox}] ${escapeMarkdownText(task.title)}${dueDateSuffix}`;
}

export function serializeMoonTaskToMarkdown(task: MoonTask): string {
  const lines = [
    serializeTaskAsObsidianCheckbox(task),
    `  - id: ${escapeMarkdownText(task.id)}`,
    `  - status: ${task.status}`,
  ];

  if (isNonEmptyString(task.priority)) {
    lines.push(`  - priority: ${task.priority}`);
  }

  if (isNonEmptyString(task.dueDate)) {
    lines.push(`  - dueDate: ${formatDayNestDate(task.dueDate)}`);
  }

  if (isNonEmptyString(task.project)) {
    lines.push(`  - project: ${escapeMarkdownText(task.project)}`);
  }

  if (task.tags && task.tags.length > 0) {
    lines.push(
      `  - tags: ${task.tags.map((tag) => `#${escapeMarkdownText(tag)}`).join(" ")}`
    );
  }

  if (isNonEmptyString(task.notes)) {
    lines.push(`  - notes: ${escapeMarkdownText(task.notes)}`);
  }

  lines.push(`  - source: ${task.source}`);
  lines.push(`  - createdAt: ${formatDayNestDateTime(task.createdAt)}`);
  lines.push(`  - updatedAt: ${formatDayNestDateTime(task.updatedAt)}`);

  if (isNonEmptyString(task.completedAt)) {
    lines.push(`  - completedAt: ${formatDayNestDateTime(task.completedAt)}`);
  }

  return lines.join("\n");
}

export function serializeMoonExpenseToMarkdown(expense: MoonExpense): string {
  const headlineParts = [
    formatDayNestDateTime(expense.occurredAt),
    `${expense.amount} ${escapeMarkdownText(expense.currency)}`,
    escapeMarkdownText(expense.category),
  ];

  if (isNonEmptyString(expense.note)) {
    headlineParts.push(escapeMarkdownText(expense.note));
  }

  return [
    `- ${headlineParts.join(" | ")}`,
    `  - id: ${escapeMarkdownText(expense.id)}`,
    `  - source: ${expense.source}`,
    `  - createdAt: ${formatDayNestDateTime(expense.createdAt)}`,
    `  - updatedAt: ${formatDayNestDateTime(expense.updatedAt)}`,
  ].join("\n");
}

export function serializeMoonTimerToMarkdown(timer: MoonTimer): string {
  const lines = [
    `- ${escapeMarkdownText(timer.label)} | status: ${timer.status} | elapsedMs: ${timer.elapsedMs}`,
    `  - id: ${escapeMarkdownText(timer.id)}`,
  ];

  if (isNonEmptyString(timer.startedAt)) {
    lines.push(`  - startedAt: ${formatDayNestDateTime(timer.startedAt)}`);
  }

  if (isNonEmptyString(timer.stoppedAt)) {
    lines.push(`  - stoppedAt: ${formatDayNestDateTime(timer.stoppedAt)}`);
  }

  if (isNonEmptyString(timer.linkedTaskId)) {
    lines.push(`  - linkedTaskId: ${escapeMarkdownText(timer.linkedTaskId)}`);
  }

  lines.push(`  - createdAt: ${formatDayNestDateTime(timer.createdAt)}`);
  lines.push(`  - updatedAt: ${formatDayNestDateTime(timer.updatedAt)}`);

  return lines.join("\n");
}

export function serializeMoonDailyLogToMarkdown(log: MoonDailyLog): string {
  const sections: string[] = ["# DayNest Daily Log", `date: ${formatDayNestDate(log.date)}`];

  if (isNonEmptyString(log.summary)) {
    sections.push(`\n## Summary\n${escapeMarkdownText(log.summary)}`);
  }

  const winsSection = formatList(log.wins);
  if (winsSection) {
    sections.push(`\n## Wins\n${winsSection}`);
  }

  const blockersSection = formatList(log.blockers);
  if (blockersSection) {
    sections.push(`\n## Blockers\n${blockersSection}`);
  }

  const notesSection = formatList(log.notes);
  if (notesSection) {
    sections.push(`\n## Notes\n${notesSection}`);
  }

  const linkedTaskIdsSection = formatLinkedIds("Linked Tasks", log.linkedTaskIds);
  if (linkedTaskIdsSection) {
    sections.push(`\n${linkedTaskIdsSection}`);
  }

  const linkedExpenseIdsSection = formatLinkedIds(
    "Linked Expenses",
    log.linkedExpenseIds
  );
  if (linkedExpenseIdsSection) {
    sections.push(`\n${linkedExpenseIdsSection}`);
  }

  const linkedTimerIdsSection = formatLinkedIds("Linked Timers", log.linkedTimerIds);
  if (linkedTimerIdsSection) {
    sections.push(`\n${linkedTimerIdsSection}`);
  }

  sections.push(`\ncreatedAt: ${formatDayNestDateTime(log.createdAt)}`);
  sections.push(`updatedAt: ${formatDayNestDateTime(log.updatedAt)}`);
  sections.push(`id: ${escapeMarkdownText(log.id)}`);

  return `${sections.join("\n")}\n`;
}
