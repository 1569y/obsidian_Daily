import type {
  MoonDailyLog,
  MoonExpense,
  MoonTimer,
} from "./daynestTypes";
import type { DayNestTaskValidationIssue } from "./daynestTaskDomainValidation";
import type {
  DayNestTaskId,
  DayNestTaskRecord,
} from "./daynestTaskTypes";
import type { DayNestDailyNoteTarget } from "./daynestDailyNoteSettings";

export type DayNestDailyNoteAppendStatus =
  | "appended"
  | "created"
  | "missing"
  | "invalid_target";

export interface DayNestDailyNoteAppendResult {
  status: DayNestDailyNoteAppendStatus;
  filePath: string;
  message?: string;
}

export interface DayNestDailyNoteRepositoryContract {
  appendToTarget(
    target: DayNestDailyNoteTarget,
    content: string,
    createdAt?: string
  ): Promise<DayNestDailyNoteAppendResult>;
}

export type DayNestTaskRepositoryErrorCode =
  | "invalid_canonical_document"
  | "task_domain_validation_failed"
  | "read_failed"
  | "write_failed"
  | "path_conflict"
  | "stale_temp_artifact"
  | "stale_backup_artifact";

export interface DayNestTaskRepositoryError {
  code: DayNestTaskRepositoryErrorCode;
  message: string;
  path?: string;
  parseError?: string;
  validationIssues?: readonly DayNestTaskValidationIssue[];
}

export type DayNestTaskRepositoryResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: DayNestTaskRepositoryError;
    };

/**
 * Repository boundary for aggregate canonical DayNest task state.
 *
 * A missing canonical tasks.json file represents an empty first-run state:
 * listAll() should eventually resolve successfully with [] and getById(...)
 * should eventually resolve successfully with null.
 *
 * Filesystem behavior, safe-write replacement, stale-artifact handling, and
 * recovery UX remain deferred to the repository implementation design.
 */
export interface DayNestTaskRepository {
  getById(
    id: DayNestTaskId
  ): Promise<DayNestTaskRepositoryResult<DayNestTaskRecord | null>>;

  listAll(): Promise<DayNestTaskRepositoryResult<DayNestTaskRecord[]>>;

  replaceAll(
    tasks: readonly DayNestTaskRecord[]
  ): Promise<DayNestTaskRepositoryResult<void>>;
}

export interface DayNestExpenseRepository {
  listByMonth(yearMonth: string): Promise<MoonExpense[]>;
  append(expense: MoonExpense): Promise<string>;
}

export interface DayNestTimerRepository {
  getById(id: string): Promise<MoonTimer | null>;
  listByDate(date: string): Promise<MoonTimer[]>;
  save(timer: MoonTimer): Promise<string>;
}

export interface DayNestDailyLogRepository {
  getByDate(date: string): Promise<MoonDailyLog | null>;
  save(log: MoonDailyLog): Promise<string>;
  appendNote(date: string, note: string): Promise<string>;
}
