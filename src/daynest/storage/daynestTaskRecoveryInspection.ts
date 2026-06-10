import { normalizePath, TFile } from "obsidian";
import type { Vault } from "obsidian";
import {
  parseDayNestTasksJson,
} from "../core/daynestTaskJsonCodec";
import {
  validateDayNestTaskRecords,
} from "../core/daynestTaskDomainValidation";
import type {
  DayNestTaskValidationIssue,
} from "../core/daynestTaskDomainValidation";
import {
  getDayNestTasksJsonBackupPath,
  getDayNestTasksJsonPath,
  getDayNestTasksJsonTempPath,
} from "../core/daynestPaths";

export type DayNestTaskRecoveryArtifactRole =
  | "canonical"
  | "temp"
  | "backup";

export type DayNestTaskRecoveryArtifactStatus =
  | "missing"
  | "valid"
  | "path_conflict"
  | "read_failed"
  | "invalid_canonical_document"
  | "task_domain_validation_failed";

export interface DayNestTaskRecoveryArtifactInspection {
  role: DayNestTaskRecoveryArtifactRole;
  path: string;
  status: DayNestTaskRecoveryArtifactStatus;
  taskCount?: number;
  parseError?: string;
  validationIssues?: readonly DayNestTaskValidationIssue[];
  message?: string;
}

export interface DayNestTaskRecoveryInspection {
  canonical: DayNestTaskRecoveryArtifactInspection;
  temp: DayNestTaskRecoveryArtifactInspection;
  backup: DayNestTaskRecoveryArtifactInspection;
  writeBlocked: boolean;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildMissingInspection(
  role: DayNestTaskRecoveryArtifactRole,
  path: string
): DayNestTaskRecoveryArtifactInspection {
  return {
    role,
    path,
    status: "missing",
  };
}

function inspectJsonText(
  role: DayNestTaskRecoveryArtifactRole,
  path: string,
  json: string
): DayNestTaskRecoveryArtifactInspection {
  const parseResult = parseDayNestTasksJson(json);

  if (!parseResult.ok) {
    return {
      role,
      path,
      status: "invalid_canonical_document",
      parseError: parseResult.error,
      message: `DayNest task ${role} artifact is not a valid task document: ${path}.`,
    };
  }

  const validationResult = validateDayNestTaskRecords(
    parseResult.document.tasks
  );

  if (!validationResult.ok) {
    return {
      role,
      path,
      status: "task_domain_validation_failed",
      validationIssues: validationResult.issues,
      message: `DayNest task ${role} artifact contains invalid task records: ${path}.`,
    };
  }

  return {
    role,
    path,
    status: "valid",
    taskCount: parseResult.document.tasks.length,
  };
}

async function inspectCanonicalArtifact(
  vault: Vault
): Promise<DayNestTaskRecoveryArtifactInspection> {
  const role: DayNestTaskRecoveryArtifactRole = "canonical";
  const path = normalizePath(getDayNestTasksJsonPath());
  const abstractFile = vault.getAbstractFileByPath(path);

  if (abstractFile === null) {
    return buildMissingInspection(role, path);
  }

  if (!(abstractFile instanceof TFile)) {
    return {
      role,
      path,
      status: "path_conflict",
      message: `DayNest task canonical path is not a file: ${path}.`,
    };
  }

  let json: string;

  try {
    json = await vault.read(abstractFile);
  } catch (error: unknown) {
    return {
      role,
      path,
      status: "read_failed",
      message: `Failed to read DayNest task canonical artifact at ${path}: ${formatUnknownError(
        error
      )}`,
    };
  }

  return inspectJsonText(role, path, json);
}

async function inspectRecoveryArtifact(
  vault: Vault,
  role: "temp" | "backup",
  rawPath: string
): Promise<DayNestTaskRecoveryArtifactInspection> {
  const path = normalizePath(rawPath);
  let exists: boolean;

  try {
    exists = await vault.adapter.exists(path);
  } catch (error: unknown) {
    return {
      role,
      path,
      status: "read_failed",
      message: `Failed to inspect DayNest task ${role} artifact at ${path}: ${formatUnknownError(
        error
      )}`,
    };
  }

  if (!exists) {
    return buildMissingInspection(role, path);
  }

  const abstractFile = vault.getAbstractFileByPath(path);

  if (abstractFile !== null && !(abstractFile instanceof TFile)) {
    return {
      role,
      path,
      status: "path_conflict",
      message: `DayNest task ${role} artifact path is not a file: ${path}.`,
    };
  }

  let json: string;

  try {
    json = await vault.adapter.read(path);
  } catch (error: unknown) {
    return {
      role,
      path,
      status: "read_failed",
      message: `Failed to read DayNest task ${role} artifact at ${path}: ${formatUnknownError(
        error
      )}`,
    };
  }

  return inspectJsonText(role, path, json);
}

/**
 * Inspect DayNest canonical task state and recovery artifacts without
 * changing any Vault content.
 *
 * A temp or backup artifact blocks future writes regardless of validity.
 * This helper reports recovery state only. It does not choose, apply, or
 * recommend a recovery action.
 */
export async function inspectDayNestTaskRecoveryState(
  vault: Vault
): Promise<DayNestTaskRecoveryInspection> {
  const [canonical, temp, backup] = await Promise.all([
    inspectCanonicalArtifact(vault),
    inspectRecoveryArtifact(
      vault,
      "temp",
      getDayNestTasksJsonTempPath()
    ),
    inspectRecoveryArtifact(
      vault,
      "backup",
      getDayNestTasksJsonBackupPath()
    ),
  ]);

  return {
    canonical,
    temp,
    backup,
    writeBlocked:
      (canonical.status !== "missing" &&
        canonical.status !== "valid") ||
      temp.status !== "missing" ||
      backup.status !== "missing",
  };
}
