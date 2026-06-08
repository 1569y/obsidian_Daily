import type {
  DayNestTaskDraft,
  DayNestTaskId,
  DayNestTaskRecord,
} from "./daynestTaskTypes";

/**
 * Explicit metadata required when a capture draft becomes a canonical task.
 *
 * ID generation, sibling-order selection, and timestamp generation remain
 * outside this adapter so the conversion stays deterministic and testable.
 */
export interface CreateDayNestTaskRecordInput {
  draft: DayNestTaskDraft;
  id: DayNestTaskId;
  sortOrder: number;
  timestamp: string;
}

/**
 * Convert one task-capture draft into one canonical mutable task record.
 *
 * Captured tasks enter the inbox lifecycle state. Later status transitions
 * belong to explicit task-domain actions rather than the capture boundary.
 */
export function createDayNestTaskRecord(
  input: CreateDayNestTaskRecordInput
): DayNestTaskRecord {
  return {
    id: input.id,
    title: input.draft.title,
    status: "inbox",
    sortOrder: input.sortOrder,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    ...(input.draft.parentTaskId !== undefined
      ? { parentTaskId: input.draft.parentTaskId }
      : {}),
    ...(input.draft.dueDate !== undefined
      ? { dueDate: input.draft.dueDate }
      : {}),
    ...(input.draft.scheduledDate !== undefined
      ? { scheduledDate: input.draft.scheduledDate }
      : {}),
  };
}
