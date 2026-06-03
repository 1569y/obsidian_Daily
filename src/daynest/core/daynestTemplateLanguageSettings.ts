import { DAYNEST_DAILY_PATH } from "./daynestPaths";

export type DayNestDailyNoteIntegrationMode =
  | "daynest_only"
  | "write_to_existing_daily_note"
  | "linked_notes";

export type DayNestLanguage = "zh-CN" | "en-US";

export type DayNestTemplateMode = "builtin" | "custom";

export interface DayNestDailyNoteIntegrationSettings {
  integrationMode: DayNestDailyNoteIntegrationMode;
  dailyNoteFolder: string;
  dailyNoteDateFormat: string;
  appendSectionHeading: string;
  createIfMissing: boolean;
  importedFromObsidianDailyNotes?: boolean;
}

export interface DayNestTemplateSettings {
  templateMode: DayNestTemplateMode;
  customTemplate?: string;
}

export interface DayNestTemplateLanguageSettings {
  language: DayNestLanguage;
  template: DayNestTemplateSettings;
}

export interface DayNestDailyNoteUserSettings {
  dailyNote: DayNestDailyNoteIntegrationSettings;
  output: DayNestTemplateLanguageSettings;
}

export const DEFAULT_DAYNEST_DAILY_NOTE_USER_SETTINGS: DayNestDailyNoteUserSettings =
  {
    dailyNote: {
      integrationMode: "daynest_only",
      dailyNoteFolder: DAYNEST_DAILY_PATH,
      dailyNoteDateFormat: "YYYY-MM-DD",
      appendSectionHeading: "## DayNest",
      createIfMissing: true,
      importedFromObsidianDailyNotes: false,
    },
    output: {
      language: "zh-CN",
      template: {
        templateMode: "builtin",
      },
    },
  };
