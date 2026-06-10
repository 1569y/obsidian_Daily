import type {
  DayNestTaskId,
  DayNestTaskRecord,
} from "./daynestTaskTypes";

export type DayNestTaskValidationIssueCode =
  | "empty_task_id"
  | "empty_task_title"
  | "invalid_sort_order"
  | "empty_parent_task_id"
  | "duplicate_task_id"
  | "missing_parent_task"
  | "self_parent_task"
  | "cyclic_parent_relationship"
  | "duplicate_sibling_sort_order"
  | "invalid_due_date"
  | "invalid_scheduled_date";

export interface DayNestTaskValidationIssue {
  code: DayNestTaskValidationIssueCode;
  message: string;
  taskId?: DayNestTaskId;
  path?: string;
}

export type ValidateDayNestTaskRecordsResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      issues: DayNestTaskValidationIssue[];
    };

interface IndexedTask {
  task: DayNestTaskRecord;
  index: number;
}

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROOT_PARENT_KEY = Symbol("root-parent");

type SiblingParentKey = DayNestTaskId | typeof ROOT_PARENT_KEY;

function createTaskPath(index: number, field: string): string {
  return `tasks[${index}].${field}`;
}

function getOptionalTaskId(
  task: DayNestTaskRecord
): { taskId: DayNestTaskId } | Record<string, never> {
  return task.id.trim().length > 0 ? { taskId: task.id } : {};
}

function validateOptionalLocalDate(
  issues: DayNestTaskValidationIssue[],
  task: DayNestTaskRecord,
  index: number,
  field: "dueDate" | "scheduledDate",
  code: "invalid_due_date" | "invalid_scheduled_date"
): void {
  const value = task[field];

  if (value === undefined) {
    return;
  }

  if (!LOCAL_DATE_PATTERN.test(value)) {
    issues.push({
      code,
      message: `${createTaskPath(
        index,
        field
      )} must use YYYY-MM-DD format when present.`,
      ...getOptionalTaskId(task),
      path: createTaskPath(index, field),
    });
  }
}

function addSiblingSortOrderIssue(
  issues: DayNestTaskValidationIssue[],
  current: IndexedTask,
  existing: IndexedTask
): void {
  issues.push({
    code: "duplicate_sibling_sort_order",
    message: `${createTaskPath(
      current.index,
      "sortOrder"
    )} duplicates the sibling sortOrder used by tasks[${
      existing.index
    }].sortOrder.`,
    ...getOptionalTaskId(current.task),
    path: createTaskPath(current.index, "sortOrder"),
  });
}

function validateTaskGraphCycles(
  indexedTasks: IndexedTask[],
  tasksById: Map<DayNestTaskId, IndexedTask>,
  duplicateIds: Set<DayNestTaskId>,
  issues: DayNestTaskValidationIssue[]
): void {
  const resolved = new Set<DayNestTaskId>();
  const reportedCycleIds = new Set<DayNestTaskId>();

  for (const indexedTask of indexedTasks) {
    const startId = indexedTask.task.id;

    if (
      startId.trim().length === 0 ||
      duplicateIds.has(startId) ||
      resolved.has(startId)
    ) {
      continue;
    }

    const chain: DayNestTaskId[] = [];
    const chainPositions = new Map<DayNestTaskId, number>();
    let currentId: DayNestTaskId | undefined = startId;

    while (currentId !== undefined) {
      if (resolved.has(currentId)) {
        break;
      }

      const cycleStart = chainPositions.get(currentId);

      if (cycleStart !== undefined) {
        const cycleIds = chain.slice(cycleStart);
        const firstCycleId = cycleIds[0];

        if (
          firstCycleId !== undefined &&
          !cycleIds.some((taskId) => reportedCycleIds.has(taskId))
        ) {
          const firstCycleTask = tasksById.get(firstCycleId);
          const cycleDescription = [...cycleIds, firstCycleId].join(" -> ");

          issues.push({
            code: "cyclic_parent_relationship",
            message: `Cyclic parent relationship detected: ${cycleDescription}.`,
            taskId: firstCycleId,
            ...(firstCycleTask !== undefined
              ? {
                  path: createTaskPath(
                    firstCycleTask.index,
                    "parentTaskId"
                  ),
                }
              : {}),
          });
        }

        for (const taskId of cycleIds) {
          reportedCycleIds.add(taskId);
        }

        break;
      }

      if (duplicateIds.has(currentId)) {
        break;
      }

      const currentTask = tasksById.get(currentId);

      if (currentTask === undefined) {
        break;
      }

      chainPositions.set(currentId, chain.length);
      chain.push(currentId);

      const parentTaskId = currentTask.task.parentTaskId;

      if (
        parentTaskId === undefined ||
        parentTaskId.trim().length === 0 ||
        parentTaskId === currentTask.task.id ||
        duplicateIds.has(parentTaskId) ||
        !tasksById.has(parentTaskId)
      ) {
        break;
      }

      currentId = parentTaskId;
    }

    for (const taskId of chain) {
      resolved.add(taskId);
    }
  }
}

/**
 * Validate semantic invariants for canonical DayNest task records.
 *
 * JSON syntax, envelope structure, and primitive field types belong to the
 * JSON codec. Storage reads, safe-write behavior, backups, and recovery
 * belong to the future repository. This validator remains pure and unwired.
 */
export function validateDayNestTaskRecords(
  tasks: readonly DayNestTaskRecord[]
): ValidateDayNestTaskRecordsResult {
  const issues: DayNestTaskValidationIssue[] = [];
  const indexedTasks: IndexedTask[] = tasks.map((task, index) => ({
    task,
    index,
  }));
  const tasksById = new Map<DayNestTaskId, IndexedTask>();
  const duplicateIds = new Set<DayNestTaskId>();
  const siblingOrders = new Map<
    SiblingParentKey,
    Map<number, IndexedTask>
  >();

  for (const indexedTask of indexedTasks) {
    const { task, index } = indexedTask;

    if (task.id.trim().length === 0) {
      issues.push({
        code: "empty_task_id",
        message: `${createTaskPath(index, "id")} must not be empty.`,
        path: createTaskPath(index, "id"),
      });
    }

    if (task.title.trim().length === 0) {
      issues.push({
        code: "empty_task_title",
        message: `${createTaskPath(index, "title")} must not be empty.`,
        ...getOptionalTaskId(task),
        path: createTaskPath(index, "title"),
      });
    }

    if (!Number.isFinite(task.sortOrder)) {
      issues.push({
        code: "invalid_sort_order",
        message: `${createTaskPath(
          index,
          "sortOrder"
        )} must be a finite number.`,
        ...getOptionalTaskId(task),
        path: createTaskPath(index, "sortOrder"),
      });
    }

    if (
      task.parentTaskId !== undefined &&
      task.parentTaskId.trim().length === 0
    ) {
      issues.push({
        code: "empty_parent_task_id",
        message: `${createTaskPath(
          index,
          "parentTaskId"
        )} must not be empty when present.`,
        ...getOptionalTaskId(task),
        path: createTaskPath(index, "parentTaskId"),
      });
    }

    validateOptionalLocalDate(
      issues,
      task,
      index,
      "dueDate",
      "invalid_due_date"
    );
    validateOptionalLocalDate(
      issues,
      task,
      index,
      "scheduledDate",
      "invalid_scheduled_date"
    );

    const existingTask = tasksById.get(task.id);

    if (existingTask !== undefined) {
      duplicateIds.add(task.id);
      issues.push({
        code: "duplicate_task_id",
        message: `${createTaskPath(
          index,
          "id"
        )} duplicates the id used by tasks[${existingTask.index}].id.`,
        ...getOptionalTaskId(task),
        path: createTaskPath(index, "id"),
      });
    } else {
      tasksById.set(task.id, indexedTask);
    }

    if (Number.isFinite(task.sortOrder)) {
      const parentKey =
        task.parentTaskId === undefined
          ? ROOT_PARENT_KEY
          : task.parentTaskId;
      let siblingOrderByValue = siblingOrders.get(parentKey);

      if (siblingOrderByValue === undefined) {
        siblingOrderByValue = new Map<number, IndexedTask>();
        siblingOrders.set(parentKey, siblingOrderByValue);
      }

      const existingSibling = siblingOrderByValue.get(task.sortOrder);

      if (existingSibling !== undefined) {
        addSiblingSortOrderIssue(
          issues,
          indexedTask,
          existingSibling
        );
      } else {
        siblingOrderByValue.set(task.sortOrder, indexedTask);
      }
    }
  }

  for (const indexedTask of indexedTasks) {
    const { task, index } = indexedTask;
    const parentTaskId = task.parentTaskId;

    if (
      parentTaskId === undefined ||
      parentTaskId.trim().length === 0
    ) {
      continue;
    }

    if (parentTaskId === task.id) {
      issues.push({
        code: "self_parent_task",
        message: `${createTaskPath(
          index,
          "parentTaskId"
        )} must not reference its own task id.`,
        ...getOptionalTaskId(task),
        path: createTaskPath(index, "parentTaskId"),
      });
      continue;
    }

    if (!tasksById.has(parentTaskId)) {
      issues.push({
        code: "missing_parent_task",
        message: `${createTaskPath(
          index,
          "parentTaskId"
        )} references a task id that does not exist.`,
        ...getOptionalTaskId(task),
        path: createTaskPath(index, "parentTaskId"),
      });
    }
  }

  validateTaskGraphCycles(
    indexedTasks,
    tasksById,
    duplicateIds,
    issues
  );

  return issues.length === 0
    ? {
        ok: true,
      }
    : {
        ok: false,
        issues,
      };
}
