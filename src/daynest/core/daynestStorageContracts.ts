import type {
  MoonDailyLog,
  MoonExpense,
  MoonTimer,
} from "./daynestTypes";
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

export interface DayNestTaskRepository {
  getById(id: DayNestTaskId): Promise<DayNestTaskRecord | null>;
  listAll(): Promise<DayNestTaskRecord[]>;
  save(task: DayNestTaskRecord): Promise<string>;
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
