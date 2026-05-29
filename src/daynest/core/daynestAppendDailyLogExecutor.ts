import type { DayNestAppendDailyLogAction } from "./daynestActions";
import type {
  DayNestActionExecutionResult,
  DayNestActionExecutionStatus,
} from "./daynestActionExecutorContracts";
import {
  resolveDayNestDailyNoteTarget,
  type DayNestDailyNoteSettings,
} from "./daynestDailyNoteSettings";
import { serializeMoonDailyLogToMarkdown } from "./daynestMarkdownSerializers";
import type { DayNestDailyNoteRepositoryContract } from "./daynestStorageContracts";

export interface DayNestAppendDailyLogExecutorContext {
  dailyNoteSettings: DayNestDailyNoteSettings;
  dailyNoteRepository: DayNestDailyNoteRepositoryContract;
  now?: Date;
}

function buildExecutionResult(
  action: DayNestAppendDailyLogAction,
  status: DayNestActionExecutionStatus,
  options?: {
    message?: string;
    filePath?: string;
    errorMessage?: string;
  }
): DayNestActionExecutionResult {
  return {
    actionId: action.id,
    kind: action.kind,
    status,
    message: options?.message,
    filePath: options?.filePath,
    errorMessage: options?.errorMessage,
  };
}

export class DayNestAppendDailyLogExecutor {
  async execute(
    action: DayNestAppendDailyLogAction,
    context: DayNestAppendDailyLogExecutorContext
  ): Promise<DayNestActionExecutionResult> {
    if (
      action.confirmationState !== "confirmed" &&
      action.confirmationState !== "not_required"
    ) {
      return buildExecutionResult(action, "pending_confirmation", {
        message: "Daily log append is waiting for confirmation.",
      });
    }

    try {
      const target = resolveDayNestDailyNoteTarget(
        context.dailyNoteSettings,
        context.now ?? new Date()
      );
      const serializedContent = serializeMoonDailyLogToMarkdown(
        action.dailyLogDraft
      );
      const repositoryResult = await context.dailyNoteRepository.appendToTarget(
        target,
        serializedContent,
        action.createdAt
      );

      if (
        repositoryResult.status === "appended" ||
        repositoryResult.status === "created"
      ) {
        return buildExecutionResult(action, "applied", {
          message: repositoryResult.message,
          filePath: repositoryResult.filePath,
        });
      }

      return buildExecutionResult(action, "rejected", {
        message: repositoryResult.message,
        filePath: repositoryResult.filePath,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unexpected append_daily_log error.";

      return buildExecutionResult(action, "failed", {
        errorMessage,
        message: "Failed to append daily log.",
      });
    }
  }
}
