import { Notice } from "obsidian";

import type MoodNestPlugin from "../../../main";
import type { DayNestAppendDailyLogAction } from "../core/daynestActions";
import { buildDayNestActionPreview } from "../core/daynestActionPreviews";
import { DayNestActionExecutor } from "../core/daynestActionExecutor";
import { DEFAULT_DAYNEST_DAILY_NOTE_SETTINGS } from "../core/daynestDailyNoteSettings";
import { DayNestDailyNoteRepository } from "../storage/daynestDailyNoteRepository";

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatIsoDateTime(date: Date): string {
  return date.toISOString();
}

function buildSampleAppendDailyLogAction(now: Date): DayNestAppendDailyLogAction {
  const createdAt = formatIsoDateTime(now);

  return {
    id: `daynest-manual-test-${now.getTime()}`,
    kind: "append_daily_log",
    source: "manual",
    createdAt,
    confirmationState: "confirmed",
    dailyLogDraft: {
      id: `daynest-daily-log-test-${now.getTime()}`,
      date: formatIsoDate(now),
      summary: "DayNest test entry",
      notes: [`Manual dev command execution at ${createdAt}`],
      createdAt,
      updatedAt: createdAt,
    },
  };
}

export function registerDayNestManualTestCommand(plugin: MoodNestPlugin): void {
  plugin.addCommand({
    id: "daynest-run-manual-daily-log-test",
    name: "DayNest: Run Manual Daily Log Test",
    callback: async () => {
      const now = new Date();
      const action = buildSampleAppendDailyLogAction(now);
      const preview = buildDayNestActionPreview(action);
      const executor = new DayNestActionExecutor();
      const dailyNoteRepository = new DayNestDailyNoteRepository(plugin.app.vault);

      console.debug("[DayNest manual test preview]", preview);

      try {
        const result = await executor.execute(action, {
          dailyNoteSettings: DEFAULT_DAYNEST_DAILY_NOTE_SETTINGS,
          dailyNoteRepository,
          now,
        });

        if (result.status === "applied") {
          const filePathText = result.filePath ? ` ${result.filePath}` : "";
          new Notice(`DayNest test: ${result.status}${filePathText}`);
          return;
        }

        const failureMessage =
          result.message ?? "DayNest manual test did not apply.";
        console.warn("[DayNest manual test]", { preview, result });
        new Notice(`DayNest test: ${result.status} - ${failureMessage}`);
      } catch (error) {
        console.error("[DayNest manual test unexpected error]", error);
        new Notice("DayNest test failed unexpectedly.");
      }
    },
  });
}
