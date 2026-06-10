import { normalizePath, TFile, TFolder } from "obsidian";
import type { Vault } from "obsidian";
import {
  DAYNEST_TASKS_SCHEMA_VERSION,
  parseDayNestTasksJson,
  serializeDayNestTasksJson,
} from "../core/daynestTaskJsonCodec";
import {
  validateDayNestTaskRecords,
} from "../core/daynestTaskDomainValidation";
import {
  getDayNestTasksJsonBackupPath,
  getDayNestTasksJsonPath,
  getDayNestTasksJsonTempPath,
} from "../core/daynestPaths";
import type {
  DayNestTaskRepository,
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
 * isolated from runtime wiring. This class now implements the full repository
 * contract but remains completely unwired from runtime execution paths.
 */
export class DayNestTaskJsonRepository
  implements DayNestTaskRepository
{
  /**
   * Serializes replaceAll(...) calls within this repository instance so local
   * writes cannot interleave the shared temp, backup, and canonical paths.
   *
   * This is not a cross-instance, cross-process, or cross-device lock.
   */
  private writeQueue: Promise<void> = Promise.resolve();

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

  async replaceAll(
    tasks: readonly DayNestTaskRecord[]
  ): Promise<DayNestTaskRepositoryResult<void>> {
    const taskSnapshot = tasks.map((task) => ({ ...task }));

    const operation = this.writeQueue.then(() =>
      this.replaceAllUnlocked(taskSnapshot)
    );

    this.writeQueue = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  private async replaceAllUnlocked(
    tasks: readonly DayNestTaskRecord[]
  ): Promise<DayNestTaskRepositoryResult<void>> {
    const canonicalPath = normalizePath(getDayNestTasksJsonPath());
    const tempPath = normalizePath(getDayNestTasksJsonTempPath());
    const backupPath = normalizePath(getDayNestTasksJsonBackupPath());
    const replacementJsonResult = this.prepareReplacementJson(tasks);

    if (!replacementJsonResult.ok) {
      return buildFailure(replacementJsonResult.error);
    }

    const canonicalEntry = this.vault.getAbstractFileByPath(
      canonicalPath
    );

    if (canonicalEntry === null) {
      return this.replaceMissingCanonical(
        canonicalPath,
        tempPath,
        replacementJsonResult.value
      );
    }

    if (!(canonicalEntry instanceof TFile)) {
      return buildFailure({
        code: "path_conflict",
        message: `Canonical DayNest task path is not a file: ${canonicalPath}.`,
        path: canonicalPath,
      });
    }

    return this.replaceExistingCanonical(
      canonicalEntry,
      canonicalPath,
      tempPath,
      backupPath,
      replacementJsonResult.value
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

    return this.validateJsonText(
      json,
      path,
      `Canonical DayNest task document is invalid: ${path}.`,
      `Canonical DayNest task records are invalid: ${path}.`
    );
  }

  private prepareReplacementJson(
    tasks: readonly DayNestTaskRecord[]
  ): DayNestTaskRepositoryResult<string> {
    const canonicalPath = normalizePath(getDayNestTasksJsonPath());
    const incomingValidationResult = validateDayNestTaskRecords(tasks);

    if (!incomingValidationResult.ok) {
      return buildFailure({
        code: "task_domain_validation_failed",
        message: `Replacement DayNest task records are invalid: ${canonicalPath}.`,
        path: canonicalPath,
        validationIssues: incomingValidationResult.issues,
      });
    }

    let replacementJson: string;

    try {
      replacementJson = serializeDayNestTasksJson({
        schemaVersion: DAYNEST_TASKS_SCHEMA_VERSION,
        tasks: [...tasks],
      });
    } catch (error: unknown) {
      return buildFailure({
        code: "write_failed",
        message: `Failed to serialize replacement DayNest task document for ${canonicalPath}: ${formatUnknownError(
          error
        )}`,
        path: canonicalPath,
      });
    }

    const replacementValidationResult = this.validateJsonText(
      replacementJson,
      canonicalPath,
      `Replacement DayNest task document is invalid: ${canonicalPath}.`,
      `Replacement DayNest task records are invalid: ${canonicalPath}.`
    );

    if (!replacementValidationResult.ok) {
      return buildFailure(replacementValidationResult.error);
    }

    return buildSuccess(replacementJson);
  }

  private validateJsonText(
    json: string,
    path: string,
    parseFailureMessage: string,
    domainFailureMessage: string
  ): DayNestTaskRepositoryResult<DayNestTaskRecord[]> {
    const parseResult = parseDayNestTasksJson(json);

    if (!parseResult.ok) {
      return buildFailure({
        code: "invalid_canonical_document",
        message: parseFailureMessage,
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
        message: domainFailureMessage,
        path,
        validationIssues: validationResult.issues,
      });
    }

    return buildSuccess(parseResult.document.tasks);
  }

  private async ensureParentFolders(
    filePath: string
  ): Promise<DayNestTaskRepositoryResult<void>> {
    const normalizedFilePath = normalizePath(filePath);
    const filePathParts = normalizedFilePath
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    if (filePathParts.length <= 1) {
      return buildSuccess(undefined);
    }

    const folderParts = filePathParts.slice(0, -1);
    let currentPath = "";

    for (const part of folderParts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const normalizedCurrentPath = normalizePath(currentPath);
      const existing = this.vault.getAbstractFileByPath(
        normalizedCurrentPath
      );

      if (existing === null) {
        try {
          await this.vault.createFolder(normalizedCurrentPath);
        } catch (error: unknown) {
          return buildFailure({
            code: "write_failed",
            message: `Failed to create DayNest task parent folder at ${normalizedCurrentPath}: ${formatUnknownError(
              error
            )}`,
            path: normalizedCurrentPath,
          });
        }
        continue;
      }

      if (!(existing instanceof TFolder)) {
        return buildFailure({
          code: "path_conflict",
          message: `DayNest task parent path exists but is not a folder: ${normalizedCurrentPath}.`,
          path: normalizedCurrentPath,
        });
      }
    }

    return buildSuccess(undefined);
  }

  private async ensureNoStaleArtifacts(
    tempPath: string,
    backupPath: string
  ): Promise<DayNestTaskRepositoryResult<void>> {
    let tempExists: boolean;

    try {
      tempExists = await this.vault.adapter.exists(tempPath);
    } catch (error: unknown) {
      return buildFailure({
        code: "read_failed",
        message: `Failed to inspect DayNest task temp artifact at ${tempPath}: ${formatUnknownError(
          error
        )}`,
        path: tempPath,
      });
    }

    if (tempExists) {
      return buildFailure({
        code: "stale_temp_artifact",
        message: `Stale DayNest task temp artifact exists: ${tempPath}.`,
        path: tempPath,
      });
    }

    let backupExists: boolean;

    try {
      backupExists = await this.vault.adapter.exists(backupPath);
    } catch (error: unknown) {
      return buildFailure({
        code: "read_failed",
        message: `Failed to inspect DayNest task backup artifact at ${backupPath}: ${formatUnknownError(
          error
        )}`,
        path: backupPath,
      });
    }

    if (backupExists) {
      return buildFailure({
        code: "stale_backup_artifact",
        message: `Stale DayNest task backup artifact exists: ${backupPath}.`,
        path: backupPath,
      });
    }

    return buildSuccess(undefined);
  }

  private async readAndValidateArtifact(
    path: string,
    parseFailureMessage: string,
    domainFailureMessage: string
  ): Promise<DayNestTaskRepositoryResult<DayNestTaskRecord[]>> {
    let json: string;

    try {
      json = await this.vault.adapter.read(path);
    } catch (error: unknown) {
      return buildFailure({
        code: "read_failed",
        message: `Failed to read DayNest task artifact at ${path}: ${formatUnknownError(
          error
        )}`,
        path,
      });
    }

    return this.validateJsonText(
      json,
      path,
      parseFailureMessage,
      domainFailureMessage
    );
  }

  private async readAndValidateCanonicalFile(
    file: TFile,
    path: string
  ): Promise<DayNestTaskRepositoryResult<DayNestTaskRecord[]>> {
    let json: string;

    try {
      json = await this.vault.read(file);
    } catch (error: unknown) {
      return buildFailure({
        code: "read_failed",
        message: `Failed to read canonical DayNest tasks at ${path}: ${formatUnknownError(
          error
        )}`,
        path,
      });
    }

    return this.validateJsonText(
      json,
      path,
      `Canonical DayNest task document is invalid: ${path}.`,
      `Canonical DayNest task records are invalid: ${path}.`
    );
  }

  private async replaceMissingCanonical(
    canonicalPath: string,
    tempPath: string,
    replacementJson: string
  ): Promise<DayNestTaskRepositoryResult<void>> {
    const ensureFoldersResult = await this.ensureParentFolders(
      canonicalPath
    );

    if (!ensureFoldersResult.ok) {
      return buildFailure(ensureFoldersResult.error);
    }

    const staleArtifactResult = await this.ensureNoStaleArtifacts(
      tempPath,
      normalizePath(getDayNestTasksJsonBackupPath())
    );

    if (!staleArtifactResult.ok) {
      return buildFailure(staleArtifactResult.error);
    }

    if (this.vault.getAbstractFileByPath(canonicalPath) !== null) {
      return buildFailure({
        code: "path_conflict",
        message: `Canonical DayNest task path is no longer missing: ${canonicalPath}.`,
        path: canonicalPath,
      });
    }

    try {
      await this.vault.adapter.write(tempPath, replacementJson);
    } catch (error: unknown) {
      return buildFailure({
        code: "write_failed",
        message: `Failed to write DayNest task temp artifact at ${tempPath}: ${formatUnknownError(
          error
        )}`,
        path: tempPath,
      });
    }

    const tempValidationResult = await this.readAndValidateArtifact(
      tempPath,
      `Temporary DayNest task document is invalid: ${tempPath}.`,
      `Temporary DayNest task records are invalid: ${tempPath}.`
    );

    if (!tempValidationResult.ok) {
      return buildFailure(tempValidationResult.error);
    }

    let createdFile: TFile;

    try {
      createdFile = await this.vault.create(
        canonicalPath,
        replacementJson
      );
    } catch (error: unknown) {
      return buildFailure({
        code: "write_failed",
        message: `Failed to create canonical DayNest tasks at ${canonicalPath}: ${formatUnknownError(
          error
        )}`,
        path: canonicalPath,
      });
    }

    const canonicalValidationResult =
      await this.readAndValidateCanonicalFile(
        createdFile,
        canonicalPath
      );

    if (!canonicalValidationResult.ok) {
      return buildFailure(canonicalValidationResult.error);
    }

    try {
      await this.vault.adapter.remove(tempPath);
    } catch (error: unknown) {
      return buildFailure({
        code: "canonical_write_committed_cleanup_failed",
        message: `Canonical DayNest task write committed, but cleanup failed for ${tempPath}: ${formatUnknownError(
          error
        )}`,
        path: tempPath,
      });
    }

    return buildSuccess(undefined);
  }

  private async replaceExistingCanonical(
    canonicalFile: TFile,
    canonicalPath: string,
    tempPath: string,
    backupPath: string,
    replacementJson: string
  ): Promise<DayNestTaskRepositoryResult<void>> {
    const existingCanonicalValidationResult =
      await this.readAndValidateCanonicalFile(
        canonicalFile,
        canonicalPath
      );

    if (!existingCanonicalValidationResult.ok) {
      return buildFailure(existingCanonicalValidationResult.error);
    }

    const ensureFoldersResult = await this.ensureParentFolders(
      canonicalPath
    );

    if (!ensureFoldersResult.ok) {
      return buildFailure(ensureFoldersResult.error);
    }

    const staleArtifactResult = await this.ensureNoStaleArtifacts(
      tempPath,
      backupPath
    );

    if (!staleArtifactResult.ok) {
      return buildFailure(staleArtifactResult.error);
    }

    try {
      await this.vault.adapter.write(tempPath, replacementJson);
    } catch (error: unknown) {
      return buildFailure({
        code: "write_failed",
        message: `Failed to write DayNest task temp artifact at ${tempPath}: ${formatUnknownError(
          error
        )}`,
        path: tempPath,
      });
    }

    const tempValidationResult = await this.readAndValidateArtifact(
      tempPath,
      `Temporary DayNest task document is invalid: ${tempPath}.`,
      `Temporary DayNest task records are invalid: ${tempPath}.`
    );

    if (!tempValidationResult.ok) {
      return buildFailure(tempValidationResult.error);
    }

    try {
      await this.vault.adapter.copy(canonicalPath, backupPath);
    } catch (error: unknown) {
      return buildFailure({
        code: "write_failed",
        message: `Failed to create DayNest task backup artifact at ${backupPath}: ${formatUnknownError(
          error
        )}`,
        path: backupPath,
      });
    }

    try {
      await this.vault.modify(canonicalFile, replacementJson);
    } catch (error: unknown) {
      return buildFailure({
        code: "write_failed",
        message: `Failed to update canonical DayNest tasks at ${canonicalPath}: ${formatUnknownError(
          error
        )}`,
        path: canonicalPath,
      });
    }

    const canonicalValidationResult =
      await this.readAndValidateCanonicalFile(
        canonicalFile,
        canonicalPath
      );

    if (!canonicalValidationResult.ok) {
      return buildFailure(canonicalValidationResult.error);
    }

    try {
      await this.vault.adapter.remove(tempPath);
    } catch (error: unknown) {
      return buildFailure({
        code: "canonical_write_committed_cleanup_failed",
        message: `Canonical DayNest task write committed, but cleanup failed for ${tempPath}: ${formatUnknownError(
          error
        )}`,
        path: tempPath,
      });
    }

    try {
      await this.vault.adapter.remove(backupPath);
    } catch (error: unknown) {
      return buildFailure({
        code: "canonical_write_committed_cleanup_failed",
        message: `Canonical DayNest task write committed, but cleanup failed for ${backupPath}: ${formatUnknownError(
          error
        )}`,
        path: backupPath,
      });
    }

    return buildSuccess(undefined);
  }
}
