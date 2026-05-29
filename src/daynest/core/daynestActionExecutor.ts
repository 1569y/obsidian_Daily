import type { DayNestAction } from "./daynestActions";
import {
  type DayNestActionExecutionResult,
  type DayNestActionExecutionStatus,
  type DayNestActionExecutorContext,
  type DayNestActionExecutorContract,
} from "./daynestActionExecutorContracts";
import { DayNestAppendDailyLogExecutor } from "./daynestAppendDailyLogExecutor";

function buildRejectedResult(
  action: DayNestAction,
  status: DayNestActionExecutionStatus,
  message: string
): DayNestActionExecutionResult {
  return {
    actionId: action.id,
    kind: action.kind,
    status,
    message,
  };
}

export class DayNestActionExecutor implements DayNestActionExecutorContract {
  constructor(
    private readonly appendDailyLogExecutor = new DayNestAppendDailyLogExecutor()
  ) {}

  async execute(
    action: DayNestAction,
    context: DayNestActionExecutorContext
  ): Promise<DayNestActionExecutionResult> {
    switch (action.kind) {
      case "append_daily_log":
        return this.appendDailyLogExecutor.execute(action, context);
      case "capture_task":
      case "capture_expense":
      case "start_timer":
      case "change_daily_note_settings":
        return buildRejectedResult(
          action,
          "rejected",
          `Action kind is not supported yet: ${action.kind}`
        );
    }
  }
}
