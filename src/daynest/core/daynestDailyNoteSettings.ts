import { DAYNEST_DAILY_PATH } from "./daynestPaths";

const SUPPORTED_DAYNEST_DAILY_NOTE_DATE_FORMATS = [
  "YYYY-MM-DD",
  "YYYY.MM.DD",
  "YYYY/MM/DD",
] as const;

export type DayNestDailyNoteMode =
  | "custom"
  | "daynest_default"
  | "import_from_obsidian_daily_notes";

export interface DayNestDailyNoteSettings {
  mode: DayNestDailyNoteMode;
  dailyNoteFolder: string;
  dailyNoteDateFormat: string;
  appendSectionHeading: string;
  createIfMissing: boolean;
  importedFromObsidianDailyNotes?: boolean;
}

export interface DayNestDailyNoteTarget {
  mode: DayNestDailyNoteMode;
  folderPath: string;
  dateFormat: string;
  dateKey: string;
  fileName: string;
  filePath: string;
  appendSectionHeading: string;
  createIfMissing: boolean;
  importedFromObsidianDailyNotes: boolean;
}

export const DEFAULT_DAYNEST_DAILY_NOTE_SETTINGS: DayNestDailyNoteSettings = {
  mode: "daynest_default",
  dailyNoteFolder: DAYNEST_DAILY_PATH,
  dailyNoteDateFormat: "YYYY-MM-DD",
  appendSectionHeading: "## DayNest",
  createIfMissing: true,
  importedFromObsidianDailyNotes: false,
};

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function joinVaultPath(...segments: string[]): string {
  return segments.map(trimSlashes).filter(Boolean).join("/");
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function formatSupportedDayNestDate(date: Date, format: string): string {
  const year = String(date.getFullYear());
  const month = padTwoDigits(date.getMonth() + 1);
  const day = padTwoDigits(date.getDate());
  const normalizedFormat = normalizeDayNestDateFormat(format);

  if (normalizedFormat === "YYYY.MM.DD") {
    return `${year}.${month}.${day}`;
  }

  if (normalizedFormat === "YYYY/MM/DD") {
    return `${year}/${month}/${day}`;
  }

  return `${year}-${month}-${day}`;
}

export function normalizeDayNestDailyNoteFolder(folder: string): string {
  const normalized = trimSlashes(folder.replace(/\\/g, "/").trim());
  return normalized || DAYNEST_DAILY_PATH;
}

export function normalizeDayNestDateFormat(format: string): string {
  const normalized = format.trim();
  return SUPPORTED_DAYNEST_DAILY_NOTE_DATE_FORMATS.includes(
    normalized as (typeof SUPPORTED_DAYNEST_DAILY_NOTE_DATE_FORMATS)[number]
  )
    ? normalized
    : "YYYY-MM-DD";
}

export function resolveDayNestDailyNoteTarget(
  settings: DayNestDailyNoteSettings,
  date: Date
): DayNestDailyNoteTarget {
  const folderPath = normalizeDayNestDailyNoteFolder(settings.dailyNoteFolder);
  const dateFormat = normalizeDayNestDateFormat(settings.dailyNoteDateFormat);
  const dateKey = formatSupportedDayNestDate(date, dateFormat);
  const fileName = `${dateKey}.md`;

  return {
    mode: settings.mode,
    folderPath,
    dateFormat,
    dateKey,
    fileName,
    filePath: joinVaultPath(folderPath, fileName),
    appendSectionHeading: settings.appendSectionHeading.trim() || "## DayNest",
    createIfMissing: settings.createIfMissing,
    importedFromObsidianDailyNotes:
      settings.importedFromObsidianDailyNotes === true,
  };
}
