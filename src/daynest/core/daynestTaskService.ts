import { createDayNestTaskRecord } from "./daynestTaskAdapters";
import type {
  DayNestTaskRepository,
  DayNestTaskRepositoryError,
} from "./daynestStorageContracts";
import type {
  DayNestTaskDraft,
  DayNestTaskId,
  DayNestTaskRecord,
} from "./daynestTaskTypes";

export type DayNestTaskServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DayNestTaskServiceError };

export type DayNestTaskServiceError =
  | {
      code: "repository_error";
      message: string;
      repositoryError: DayNestTaskRepositoryError;
    }
  | {
      code: "generated_id_collision";
      message: string;
      taskId: DayNestTaskId;
    }
  | {
      code: "parent_task_not_found";
      message: string;
      parentTaskId: DayNestTaskId;
    }
  | {
      code: "invalid_sibling_sort_order";
      message: string;
      parentTaskId?: DayNestTaskId;
    };

function buildSuccess<T>(
  value: T
): DayNestTaskServiceResult<T> {
  return {
    ok: true,
    value,
  };
}

function buildFailure<T>(
  error: DayNestTaskServiceError
): DayNestTaskServiceResult<T> {
  return {
    ok: false,
    error,
  };
}

function buildRepositoryError<T>(
  repositoryError: DayNestTaskRepositoryError
): DayNestTaskServiceResult<T> {
  return buildFailure({
    code: "repository_error",
    message: repositoryError.message,
    repositoryError,
  });
}

function hasParentTask(
  records: readonly DayNestTaskRecord[],
  parentTaskId: DayNestTaskId
): boolean {
  return records.some((record) => record.id === parentTaskId);
}

function hasTaskId(
  records: readonly DayNestTaskRecord[],
  taskId: DayNestTaskId
): boolean {
  return records.some((record) => record.id === taskId);
}

function getSiblingRecords(
  records: readonly DayNestTaskRecord[],
  parentTaskId: DayNestTaskId | undefined
): DayNestTaskRecord[] {
  if (parentTaskId === undefined) {
    return records.filter((record) => record.parentTaskId === undefined);
  }

  return records.filter(
    (record) => record.parentTaskId === parentTaskId
  );
}

function getNextSortOrder(
  siblings: readonly DayNestTaskRecord[],
  parentTaskId: DayNestTaskId | undefined
): DayNestTaskServiceResult<number> {
  if (siblings.length === 0) {
    return buildSuccess(0);
  }

  let maxSortOrder = Number.NEGATIVE_INFINITY;

  for (const sibling of siblings) {
    if (!Number.isFinite(sibling.sortOrder)) {
      return buildFailure({
        code: "invalid_sibling_sort_order",
        message:
          parentTaskId === undefined
            ? "Root sibling sortOrder must be finite."
            : `Sibling sortOrder must be finite for parent task ${parentTaskId}.`,
        ...(parentTaskId !== undefined ? { parentTaskId } : {}),
      });
    }

    if (sibling.sortOrder > maxSortOrder) {
      maxSortOrder = sibling.sortOrder;
    }
  }

  return buildSuccess(maxSortOrder + 1);
}

export class DayNestTaskService {
  /**
   * Serializes local createTask(...) read-modify-write operations.
   * This is not a cross-window, cross-process, or cross-device lock.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: DayNestTaskRepository,
    private readonly createId: () => DayNestTaskId,
    private readonly now: () => string
  ) {}

  async createTask(
    draft: DayNestTaskDraft
  ): Promise<DayNestTaskServiceResult<DayNestTaskRecord>> {
    const draftSnapshot = { ...draft };
    const operation = this.queue.then(() =>
      this.createTaskUnlocked(draftSnapshot)
    );

    this.queue = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  private async createTaskUnlocked(
    draftSnapshot: DayNestTaskDraft
  ): Promise<DayNestTaskServiceResult<DayNestTaskRecord>> {
    const recordsResult = await this.repository.listAll();

    if (!recordsResult.ok) {
      return buildRepositoryError(recordsResult.error);
    }

    const records = recordsResult.value;
    const parentTaskId = draftSnapshot.parentTaskId;

    if (
      parentTaskId !== undefined &&
      !hasParentTask(records, parentTaskId)
    ) {
      return buildFailure({
        code: "parent_task_not_found",
        message: `Parent task was not found: ${parentTaskId}.`,
        parentTaskId,
      });
    }

    const taskId = this.createId();

    if (hasTaskId(records, taskId)) {
      return buildFailure({
        code: "generated_id_collision",
        message: `Generated task id already exists: ${taskId}.`,
        taskId,
      });
    }

    const siblings = getSiblingRecords(records, parentTaskId);
    const sortOrderResult = getNextSortOrder(siblings, parentTaskId);

    if (!sortOrderResult.ok) {
      return sortOrderResult;
    }

    const createdTask = createDayNestTaskRecord({
      draft: draftSnapshot,
      id: taskId,
      sortOrder: sortOrderResult.value,
      timestamp: this.now(),
    });
    const nextRecords = [...records, createdTask];
    const replaceResult = await this.repository.replaceAll(nextRecords);

    if (!replaceResult.ok) {
      return buildRepositoryError(replaceResult.error);
    }

    return buildSuccess(createdTask);
  }
}
