export const DAYNEST_ROOT_PATH = "NestHub/DayNest";
export const DAYNEST_TASKS_PATH = "NestHub/DayNest/tasks";
export const DAYNEST_TASKS_JSON_PATH = "NestHub/DayNest/tasks.json";
export const DAYNEST_TASKS_JSON_TEMP_PATH =
  "NestHub/DayNest/tasks.json.tmp";
export const DAYNEST_TASKS_JSON_BACKUP_PATH =
  "NestHub/DayNest/tasks.json.bak";
export const DAYNEST_EXPENSES_PATH = "NestHub/DayNest/expenses";
export const DAYNEST_TIMERS_PATH = "NestHub/DayNest/timers";
export const DAYNEST_DAILY_PATH = "NestHub/DayNest/daily";
export const DAYNEST_INBOX_PATH = "NestHub/DayNest/inbox";

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function joinVaultPath(...segments: string[]): string {
  return segments.map(trimSlashes).filter(Boolean).join("/");
}

export function getDayNestRootPath(): string {
  return DAYNEST_ROOT_PATH;
}

export function getDayNestTasksJsonPath(): string {
  return DAYNEST_TASKS_JSON_PATH;
}

export function getDayNestTasksJsonTempPath(): string {
  return DAYNEST_TASKS_JSON_TEMP_PATH;
}

export function getDayNestTasksJsonBackupPath(): string {
  return DAYNEST_TASKS_JSON_BACKUP_PATH;
}

export function getDayNestExpensesPath(): string {
  return DAYNEST_EXPENSES_PATH;
}

export function getDayNestTimersPath(): string {
  return DAYNEST_TIMERS_PATH;
}

export function getDayNestDailyPath(): string {
  return DAYNEST_DAILY_PATH;
}

export function getDayNestInboxPath(): string {
  return DAYNEST_INBOX_PATH;
}

export function getDayNestTaskFilePath(taskId: string): string {
  return joinVaultPath(DAYNEST_TASKS_PATH, `${taskId}.md`);
}

export function getDayNestExpenseMonthFilePath(yearMonth: string): string {
  return joinVaultPath(DAYNEST_EXPENSES_PATH, `${yearMonth}.md`);
}

export function getDayNestTimerLogFilePath(date: string): string {
  return joinVaultPath(DAYNEST_TIMERS_PATH, `${date}.md`);
}

export function getDayNestDailyLogFilePath(date: string): string {
  return joinVaultPath(DAYNEST_DAILY_PATH, `${date}.md`);
}

export function getDayNestInboxFilePath(fileName: string): string {
  return joinVaultPath(DAYNEST_INBOX_PATH, `${trimSlashes(fileName)}.md`);
}
