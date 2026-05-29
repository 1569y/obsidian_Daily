import { TFile, TFolder, Vault } from "obsidian";

import {
  appendToDayNestSection,
  buildDayNestAppendBlock,
  ensureDayNestSection,
} from "../core/daynestDailyNoteContent";
import type { DayNestDailyNoteTarget } from "../core/daynestDailyNoteSettings";
import type {
  DayNestDailyNoteAppendResult,
  DayNestDailyNoteRepositoryContract,
} from "../core/daynestStorageContracts";

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function getParentFolderPath(filePath: string): string {
  const normalized = trimSlashes(filePath);
  const lastSlashIndex = normalized.lastIndexOf("/");

  if (lastSlashIndex <= 0) {
    return "";
  }

  return normalized.slice(0, lastSlashIndex);
}

export class DayNestDailyNoteRepository
  implements DayNestDailyNoteRepositoryContract
{
  constructor(private readonly vault: Vault) {}

  async appendToTarget(
    target: DayNestDailyNoteTarget,
    content: string,
    createdAt?: string
  ): Promise<DayNestDailyNoteAppendResult> {
    const existing = this.vault.getAbstractFileByPath(target.filePath);

    if (existing instanceof TFolder) {
      return {
        status: "invalid_target",
        filePath: target.filePath,
        message: "Resolved daily note target points to a folder.",
      };
    }

    if (existing instanceof TFile) {
      const appendBlock = buildDayNestAppendBlock(content, createdAt);
      await this.vault.process(existing, (currentContent) => {
        const withSection = ensureDayNestSection(
          currentContent,
          target.appendSectionHeading
        );

        return appendToDayNestSection(
          withSection,
          target.appendSectionHeading,
          appendBlock
        );
      });

      return {
        status: "appended",
        filePath: target.filePath,
      };
    }

    if (!target.createIfMissing) {
      return {
        status: "missing",
        filePath: target.filePath,
        message: "Target daily note does not exist and createIfMissing is false.",
      };
    }

    const parentFolderCheck = await this.ensureParentFolders(target.filePath);
    if (parentFolderCheck) {
      return parentFolderCheck;
    }

    const appendBlock = buildDayNestAppendBlock(content, createdAt);
    const seededContent = ensureDayNestSection("", target.appendSectionHeading);
    const initialContent = appendToDayNestSection(
      seededContent,
      target.appendSectionHeading,
      appendBlock
    );

    await this.vault.create(target.filePath, initialContent);

    return {
      status: "created",
      filePath: target.filePath,
    };
  }

  private async ensureParentFolders(
    filePath: string
  ): Promise<DayNestDailyNoteAppendResult | null> {
    const parentFolderPath = getParentFolderPath(filePath);
    if (!parentFolderPath) {
      return null;
    }

    const parts = parentFolderPath.split("/").filter(Boolean);
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const existing = this.vault.getAbstractFileByPath(currentPath);

      if (!existing) {
        await this.vault.createFolder(currentPath);
        continue;
      }

      if (!(existing instanceof TFolder)) {
        return {
          status: "invalid_target",
          filePath,
          message: `Parent path exists but is not a folder: ${currentPath}`,
        };
      }
    }

    return null;
  }
}
