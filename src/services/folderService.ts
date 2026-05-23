import { App, TFolder } from "obsidian";

export class FolderService {
  constructor(private app: App) {}

  async ensureFolder(path: string): Promise<void> {
    if (!path) return;

    const normalized = path.replace(/^\/+|\/+$/g, "");
    if (!normalized) return;

    const parts = normalized.split("/");
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(currentPath);

      if (!existing) {
        await this.app.vault.createFolder(currentPath);
      } else if (!(existing instanceof TFolder)) {
        throw new Error(`Path exists but is not a folder: ${currentPath}`);
      }
    }
  }
}