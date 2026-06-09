import {
  escapeMarkdownText,
  formatDayNestDate,
} from "./daynestMarkdownSerializers";
import type { DayNestTaskRecord } from "./daynestTaskTypes";

function formatOptionalDateSuffix(
  label: "due" | "scheduled",
  value: string | undefined
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  return ` | ${label}: ${formatDayNestDate(value)}`;
}

/**
 * Render one canonical task record as one human-readable Markdown checkbox.
 *
 * This is a flat projection helper only. Task-tree indentation, stable
 * managed-block markers, hidden metadata, and manual-edit reconciliation
 * remain deferred to later architecture decisions.
 */
export function serializeDayNestTaskRecordAsCheckbox(
  task: DayNestTaskRecord
): string {
  const checkbox = task.status === "done" ? "x" : " ";
  const cancelledSuffix =
    task.status === "cancelled" ? " | status: cancelled" : "";
  const dueDateSuffix = formatOptionalDateSuffix("due", task.dueDate);
  const scheduledDateSuffix = formatOptionalDateSuffix(
    "scheduled",
    task.scheduledDate
  );

  return `- [${checkbox}] ${escapeMarkdownText(task.title)}${cancelledSuffix}${dueDateSuffix}${scheduledDateSuffix}`;
}
