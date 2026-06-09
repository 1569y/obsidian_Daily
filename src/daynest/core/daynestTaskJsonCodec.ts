import type {
  DayNestTaskRecord,
  DayNestTaskStatus,
} from "./daynestTaskTypes";

export const DAYNEST_TASKS_SCHEMA_VERSION = 1 as const;

export interface DayNestTasksDocument {
  schemaVersion: typeof DAYNEST_TASKS_SCHEMA_VERSION;
  tasks: DayNestTaskRecord[];
}

export type ParseDayNestTasksJsonResult =
  | {
      ok: true;
      document: DayNestTasksDocument;
    }
  | {
      ok: false;
      error: string;
    };

type ParseTaskRecordResult =
  | {
      ok: true;
      task: DayNestTaskRecord;
    }
  | {
      ok: false;
      error: string;
    };

type ReadRequiredStringResult =
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: string;
    };

type ReadOptionalStringResult =
  | {
      ok: true;
      value?: string;
    }
  | {
      ok: false;
      error: string;
    };

type ReadFiniteNumberResult =
  | {
      ok: true;
      value: number;
    }
  | {
      ok: false;
      error: string;
    };

const DOCUMENT_KEYS = new Set(["schemaVersion", "tasks"]);

const TASK_RECORD_KEYS = new Set([
  "id",
  "title",
  "status",
  "parentTaskId",
  "sortOrder",
  "dueDate",
  "scheduledDate",
  "createdAt",
  "updatedAt",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findUnexpectedKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>
): string[] {
  return Object.keys(record).filter((key) => !allowedKeys.has(key));
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  context: string
): ReadRequiredStringResult {
  const value = record[key];

  if (typeof value !== "string") {
    return {
      ok: false,
      error: `${context}.${key} must be a string.`,
    };
  }

  return {
    ok: true,
    value,
  };
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  context: string
): ReadOptionalStringResult {
  const value = record[key];

  if (value === undefined) {
    return {
      ok: true,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      error: `${context}.${key} must be a string when present.`,
    };
  }

  return {
    ok: true,
    value,
  };
}

function readFiniteNumber(
  record: Record<string, unknown>,
  key: string,
  context: string
): ReadFiniteNumberResult {
  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      error: `${context}.${key} must be a finite number.`,
    };
  }

  return {
    ok: true,
    value,
  };
}

function isDayNestTaskStatus(value: unknown): value is DayNestTaskStatus {
  return (
    value === "inbox" ||
    value === "next" ||
    value === "done" ||
    value === "cancelled"
  );
}

function parseTaskRecord(
  value: unknown,
  index: number
): ParseTaskRecordResult {
  const context = `tasks[${index}]`;

  if (!isRecord(value)) {
    return {
      ok: false,
      error: `${context} must be an object.`,
    };
  }

  const unexpectedKeys = findUnexpectedKeys(value, TASK_RECORD_KEYS);

  if (unexpectedKeys.length > 0) {
    return {
      ok: false,
      error: `${context} contains unexpected fields: ${unexpectedKeys.join(
        ", "
      )}.`,
    };
  }

  const id = readRequiredString(value, "id", context);
  if (!id.ok) {
    return id;
  }

  const title = readRequiredString(value, "title", context);
  if (!title.ok) {
    return title;
  }

  if (!isDayNestTaskStatus(value.status)) {
    return {
      ok: false,
      error: `${context}.status must be one of: inbox, next, done, cancelled.`,
    };
  }

  const sortOrder = readFiniteNumber(value, "sortOrder", context);
  if (!sortOrder.ok) {
    return sortOrder;
  }

  const parentTaskId = readOptionalString(value, "parentTaskId", context);
  if (!parentTaskId.ok) {
    return parentTaskId;
  }

  const dueDate = readOptionalString(value, "dueDate", context);
  if (!dueDate.ok) {
    return dueDate;
  }

  const scheduledDate = readOptionalString(value, "scheduledDate", context);
  if (!scheduledDate.ok) {
    return scheduledDate;
  }

  const createdAt = readRequiredString(value, "createdAt", context);
  if (!createdAt.ok) {
    return createdAt;
  }

  const updatedAt = readRequiredString(value, "updatedAt", context);
  if (!updatedAt.ok) {
    return updatedAt;
  }

  return {
    ok: true,
    task: {
      id: id.value,
      title: title.value,
      status: value.status,
      ...(parentTaskId.value !== undefined
        ? { parentTaskId: parentTaskId.value }
        : {}),
      sortOrder: sortOrder.value,
      ...(dueDate.value !== undefined ? { dueDate: dueDate.value } : {}),
      ...(scheduledDate.value !== undefined
        ? { scheduledDate: scheduledDate.value }
        : {}),
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
    },
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareTaskRecords(
  left: DayNestTaskRecord,
  right: DayNestTaskRecord
): number {
  const parentComparison = compareStrings(
    left.parentTaskId ?? "",
    right.parentTaskId ?? ""
  );

  if (parentComparison !== 0) {
    return parentComparison;
  }

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return compareStrings(left.id, right.id);
}

function toSerializableTaskRecord(
  task: DayNestTaskRecord
): DayNestTaskRecord {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    ...(task.parentTaskId !== undefined
      ? { parentTaskId: task.parentTaskId }
      : {}),
    sortOrder: task.sortOrder,
    ...(task.dueDate !== undefined ? { dueDate: task.dueDate } : {}),
    ...(task.scheduledDate !== undefined
      ? { scheduledDate: task.scheduledDate }
      : {}),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function parseDayNestTasksJson(
  json: string
): ParseDayNestTasksJsonResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Invalid JSON: ${error.message}`
          : "Invalid JSON.",
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: "Task document must be an object.",
    };
  }

  const unexpectedKeys = findUnexpectedKeys(parsed, DOCUMENT_KEYS);

  if (unexpectedKeys.length > 0) {
    return {
      ok: false,
      error: `Task document contains unexpected fields: ${unexpectedKeys.join(
        ", "
      )}.`,
    };
  }

  if (parsed.schemaVersion !== DAYNEST_TASKS_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schemaVersion: ${String(parsed.schemaVersion)}.`,
    };
  }

  if (!Array.isArray(parsed.tasks)) {
    return {
      ok: false,
      error: "Task document tasks must be an array.",
    };
  }

  const tasks: DayNestTaskRecord[] = [];

  for (let index = 0; index < parsed.tasks.length; index += 1) {
    const taskResult = parseTaskRecord(parsed.tasks[index], index);

    if (!taskResult.ok) {
      return taskResult;
    }

    tasks.push(taskResult.task);
  }

  return {
    ok: true,
    document: {
      schemaVersion: DAYNEST_TASKS_SCHEMA_VERSION,
      tasks,
    },
  };
}

export function serializeDayNestTasksJson(
  document: DayNestTasksDocument
): string {
  const tasks = [...document.tasks]
    .sort(compareTaskRecords)
    .map(toSerializableTaskRecord);

  const json = JSON.stringify(
    {
      schemaVersion: document.schemaVersion,
      tasks,
    },
    null,
    2
  );

  if (typeof json !== "string") {
    throw new Error("Failed to serialize DayNest tasks document.");
  }

  return `${json}\n`;
}
