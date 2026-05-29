export type DayNestIntent =
  | "capture_task"
  | "capture_expense"
  | "append_daily_log"
  | "clarify_missing_fields"
  | "chat_only";

export interface MoonTask {
  id: string;
  title: string;
  status: "inbox" | "next" | "done";
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  project?: string;
  tags?: string[];
  notes?: string;
  source: "agent" | "quick_capture" | "manual";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface MoonExpense {
  id: string;
  amount: number;
  currency: string;
  category: string;
  note?: string;
  occurredAt: string;
  source: "agent" | "quick_capture" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface MoonTimer {
  id: string;
  label: string;
  status: "idle" | "running" | "stopped";
  startedAt?: string;
  stoppedAt?: string;
  elapsedMs: number;
  linkedTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MoonDailyLog {
  id: string;
  date: string;
  summary?: string;
  wins?: string[];
  blockers?: string[];
  notes?: string[];
  linkedTaskIds?: string[];
  linkedExpenseIds?: string[];
  linkedTimerIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DayNestAgentResult {
  intent: DayNestIntent;
  confidence: number;
  replyText: string;
  missingFields?: string[];
  taskDraft?: MoonTask;
  expenseDraft?: MoonExpense;
  timerDraft?: MoonTimer;
  dailyLogDraft?: MoonDailyLog;
}
