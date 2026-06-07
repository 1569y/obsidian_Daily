/**
 * Canonical mutable DayNest task identity.
 *
 * Keep this as a plain string alias during the MVP. A branded identifier can
 * be introduced later if repository boundaries require stronger separation.
 */
export type DayNestTaskId = string;

/**
 * Minimal canonical task lifecycle for the MVP.
 *
 * Do not broaden this union until a later architecture decision requires it.
 */
export type DayNestTaskStatus = "inbox" | "next" | "done" | "cancelled";

/**
 * Canonical mutable task record accepted by ADR-001.
 *
 * Root tasks omit parentTaskId. Nested tasks keep a stable id and use
 * parentTaskId to express their relationship. Trees, depth, and progress are
 * derived views and must not be stored as mutable canonical fields.
 *
 * MoonTask remains a temporary legacy scaffold. Do not treat MoonTask as the
 * canonical record and do not migrate existing references in this batch.
 */
export interface DayNestTaskRecord {
  id: DayNestTaskId;
  title: string;
  status: DayNestTaskStatus;
  parentTaskId?: DayNestTaskId;

  /**
   * Deterministic order among siblings, including root-level siblings.
   * Lower values appear earlier. Renumbering is acceptable during the MVP.
   */
  sortOrder: number;

  /**
   * Local calendar deadline in YYYY-MM-DD form.
   */
  dueDate?: string;

  /**
   * Intended actionable local calendar date in YYYY-MM-DD form.
   */
  scheduledDate?: string;

  /**
   * ISO-8601 timestamp.
   */
  createdAt: string;

  /**
   * ISO-8601 timestamp.
   */
  updatedAt: string;
}
