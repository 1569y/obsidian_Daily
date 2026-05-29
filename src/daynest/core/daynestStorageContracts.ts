import type {
  MoonDailyLog,
  MoonExpense,
  MoonTask,
  MoonTimer,
} from "./daynestTypes";

export interface DayNestTaskRepository {
  getById(id: string): Promise<MoonTask | null>;
  listAll(): Promise<MoonTask[]>;
  save(task: MoonTask): Promise<string>;
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
