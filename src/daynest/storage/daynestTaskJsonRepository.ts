import { normalizePath, TFile } from "obsidian";
import type { Vault } from "obsidian";
import {
  parseDayNestTasksJson,
} from "../core/daynestTaskJsonCodec";
import {
  validateDayNestTaskRecords,
} from "../core/daynestTaskDomainValidation";
import {
  getDayNestTasksJsonPath,
} from "../core/daynestPaths";
import type {
  DayNestTaskRepositoryError,
  DayNestTaskRepositoryResult,
} from "../core/daynestStorageContracts";
import type {
  DayNestTaskId,
  DayNestTaskRecord,
} from "../core/daynestTaskTypes";

function buildSuccess<T>(
  value: T
): DayNestTaskRepositoryResult<T> {
  return {
    ok: true,
    value,
  };
}

function buildFailure<T>(
  error: DayNestTaskRepositoryError
): DayNestTaskRepositoryResult<T> {
  return {
    ok: false,
    error,
  };
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Vault-backed read-path slice for aggregate canonical DayNest task state.
 *
 * replaceAll(...) and best-effort safe-write behavior remain deliberately
 * deferred. Do not treat this class as the complete repository contract yet.
 */
export class DayNestTaskJsonRepository {
  constructor(private readonly vault: Vault) {}

  async listAll(): Promise<
    DayNestTaskRepositoryResult<DayNestTaskRecord[]>
  > {
    return this.readCanonicalTasks();
  }

  async getById(
    id: DayNestTaskId
  ): Promise<
    DayNestTaskRepositoryResult<DayNestTaskRecord | null>
  > {
    const tasksResult = await this.readCanonicalTasks();

    if (!tasksResult.ok) {
      return buildFailure(tasksResult.error);
    }

    return buildSuccess(
      tasksResult.value.find((task) => task.id === id) ?? null
    );
  }

  private async readCanonicalTasks(): Promise<
    DayNestTaskRepositoryResult<DayNestTaskRecord[]>
  > {
    const path = normalizePath(getDayNestTasksJsonPath());
    const abstractFile = this.vault.getAbstractFileByPath(path);

    if (abstractFile === null) {
      return buildSuccess([]);
    }

    if (!(abstractFile instanceof TFile)) {
      return buildFailure({
        code: "path_conflict",
        message: `Canonical DayNest task path is not a file: ${path}.`,
        path,
      });
    }

    let json: string;

    try {
      json = await this.vault.read(abstractFile);
    } catch (error: unknown) {
      return buildFailure({
        code: "read_failed",
        message: `Failed to read canonical DayNest tasks at ${path}: ${formatUnknownError(
          error
        )}`,
        path,
      });
    }

    const parseResult = parseDayNestTasksJson(json);

    if (!parseResult.ok) {
      return buildFailure({
        code: "invalid_canonical_document",
        message: `Canonical DayNest task document is invalid: ${path}.`,
        path,
        parseError: parseResult.error,
      });
    }

    const validationResult = validateDayNestTaskRecords(
      parseResult.document.tasks
    );

    if (!validationResult.ok) {
      return buildFailure({
        code: "task_domain_validation_failed",
        message: `Canonical DayNest task records are invalid: ${path}.`,
        path,
        validationIssues: validationResult.issues,
      });
    }

    return buildSuccess(parseResult.document.tasks);
  }
}
