import { App, FileSystemAdapter, TFile } from "obsidian";
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export type GroundingAssetType = "audio" | "image";
export type GroundingAssetPathMode = "absolute" | "vault-relative" | "empty";
export type GroundingAssetSource = "user-config" | "plugin-default" | "fallback";

export interface GroundingAssetResolution {
  files: string[];
  source: GroundingAssetSource;
  pathMode: GroundingAssetPathMode;
  configuredPath?: string;
  warning?: string;
  error?: string;
}

type ResolveGroundingAssetOptions = {
  app: App;
  type: GroundingAssetType;
  configuredFolder?: string;
  defaultFolders: string[];
  extensions: string[];
};

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

export function detectGroundingPathMode(
  input?: string | null
): GroundingAssetPathMode {
  const value = input?.trim() ?? "";
  if (!value) {
    return "empty";
  }

  if (WINDOWS_ABSOLUTE_PATH.test(value) || value.startsWith("/")) {
    return "absolute";
  }

  return "vault-relative";
}

export function normalizeGroundingPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  if (detectGroundingPathMode(trimmed) === "absolute") {
    return path.normalize(trimmed);
  }

  return trimmed.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export async function resolveGroundingAssetFiles(
  options: ResolveGroundingAssetOptions
): Promise<GroundingAssetResolution> {
  const configuredPath = options.configuredFolder?.trim();
  const pathMode = detectGroundingPathMode(configuredPath);
  const extensions = new Set(options.extensions.map((ext) => ext.toLowerCase()));

  console.debug(
    `[MoodNest assets] type=${options.type} configuredPath=${configuredPath ?? ""}`
  );
  console.debug(`[MoodNest assets] pathMode=${pathMode}`);

  if (configuredPath) {
    try {
      const files = await listSupportedFiles(
        options.app,
        normalizeGroundingPath(configuredPath),
        pathMode,
        extensions
      );

      if (files.length > 0) {
        console.debug("[MoodNest assets] source=user-config");
        console.debug(`[MoodNest assets] foundFiles=${files.length}`);
        return {
          files,
          source: "user-config",
          pathMode,
          configuredPath,
        };
      }

      const warning = buildMissingFilesWarning(options.type, configuredPath);
      console.warn("[MoodNest assets] error=no-files-in-configured-path");
      const fallback = await resolvePluginDefaultFiles(options, extensions);
      return {
        ...fallback,
        pathMode,
        configuredPath,
        warning,
        error: "no-files-in-configured-path",
      };
    } catch (error) {
      const warning = buildPathErrorWarning(options.type, pathMode, configuredPath);
      console.warn(
        `[MoodNest assets] error=${error instanceof Error ? error.message : String(error)}`
      );
      const fallback = await resolvePluginDefaultFiles(options, extensions);
      return {
        ...fallback,
        pathMode,
        configuredPath,
        warning,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return resolvePluginDefaultFiles(options, extensions);
}

export async function readGroundingBinary(
  app: App,
  filePath: string
): Promise<ArrayBuffer> {
  const pathMode = detectGroundingPathMode(filePath);
  if (pathMode === "absolute") {
    if (!(app.vault.adapter instanceof FileSystemAdapter)) {
      throw new Error("absolute-path-not-supported-in-current-adapter");
    }

    const data = await readFile(normalizeGroundingPath(filePath));
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
  }

  const normalized = normalizeGroundingPath(filePath);
  const file = app.vault.getAbstractFileByPath(normalized);
  if (file && (file as TFile).path) {
    return app.vault.readBinary(file as TFile);
  }

  const adapter = app.vault.adapter as unknown as {
    readBinary?: (rawPath: string) => Promise<ArrayBuffer>;
  };
  if (typeof adapter.readBinary === "function") {
    return adapter.readBinary(normalized);
  }

  throw new Error(`unable-to-read-grounding-file:${filePath}`);
}

export function getGroundingResourceUrl(app: App, filePath: string): string | null {
  const pathMode = detectGroundingPathMode(filePath);
  if (pathMode === "absolute") {
    if (!(app.vault.adapter instanceof FileSystemAdapter)) {
      return null;
    }

    return pathToFileURL(path.resolve(normalizeGroundingPath(filePath))).href;
  }

  const normalized = normalizeGroundingPath(filePath);
  const abs = app.vault.getAbstractFileByPath(normalized);
  if (abs && (abs as TFile).path) {
    const anyVault = app.vault as unknown as {
      getResourcePath?: (file: TFile) => string;
    };
    if (typeof anyVault.getResourcePath === "function") {
      return anyVault.getResourcePath(abs as TFile);
    }
  }

  const anyAdapter = app.vault.adapter as unknown as {
    getResourcePath?: (rawPath: string) => string;
  };
  if (typeof anyAdapter.getResourcePath === "function") {
    return anyAdapter.getResourcePath(normalized);
  }

  return null;
}

export function basenameWithoutExt(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return name.replace(/\.[^.]+$/, "");
}

async function resolvePluginDefaultFiles(
  options: ResolveGroundingAssetOptions,
  extensions: Set<string>
): Promise<GroundingAssetResolution> {
  const found: string[] = [];

  for (const folder of options.defaultFolders) {
    const pathMode = detectGroundingPathMode(folder);
    const files = await listSupportedFiles(
      options.app,
      normalizeGroundingPath(folder),
      pathMode,
      extensions
    ).catch(() => []);

    if (files.length > 0) {
      found.push(...files);
    }
  }

  const unique = Array.from(new Set(found));
  const source: GroundingAssetSource = unique.length > 0 ? "plugin-default" : "fallback";
  console.debug(`[MoodNest assets] source=${source}`);
  console.debug(`[MoodNest assets] foundFiles=${unique.length}`);

  return {
    files: unique,
    source,
    pathMode: "empty",
  };
}

async function listSupportedFiles(
  app: App,
  folder: string,
  pathMode: GroundingAssetPathMode,
  extensions: Set<string>
): Promise<string[]> {
  const files =
    pathMode === "absolute"
      ? await listAbsoluteFolderRecursive(app, folder)
      : await listVaultFolderRecursive(app, folder);

  return files.filter((filePath) => {
    const ext = (filePath.split(".").pop() ?? "").toLowerCase();
    return extensions.has(ext);
  });
}

async function listVaultFolderRecursive(app: App, folder: string): Promise<string[]> {
  if (!folder) {
    return [];
  }

  const files: string[] = [];
  const stack = [folder];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const listed = await app.vault.adapter.list(current);
    (listed.files ?? []).forEach((filePath) =>
      files.push(normalizeGroundingPath(filePath))
    );
    (listed.folders ?? []).forEach((child) =>
      stack.push(normalizeGroundingPath(child))
    );
  }

  return files;
}

async function listAbsoluteFolderRecursive(
  app: App,
  folder: string
): Promise<string[]> {
  if (!(app.vault.adapter instanceof FileSystemAdapter)) {
    throw new Error("absolute-path-not-supported-in-current-adapter");
  }

  const root = path.resolve(folder);
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        return;
      }

      files.push(entryPath);
    });
  }

  return files;
}

function buildMissingFilesWarning(
  type: GroundingAssetType,
  configuredPath: string
): string {
  return type === "audio"
    ? `没有在你设置的路径里找到音频，暂时使用默认资源。`
    : `没有在你设置的路径里找到图片，暂时使用默认资源。`;
}

function buildPathErrorWarning(
  type: GroundingAssetType,
  pathMode: GroundingAssetPathMode,
  configuredPath: string
): string {
  if (pathMode === "absolute") {
    return type === "audio"
      ? `这个路径看起来是系统绝对路径：${configuredPath}。当前版本优先支持桌面端读取；如果失败，请改填 vault 内相对路径，例如 MoodNestAssets/Grounding/listen。`
      : `这个路径看起来是系统绝对路径：${configuredPath}。当前版本优先支持桌面端读取；如果失败，请改填 vault 内相对路径，例如 MoodNestAssets/Grounding/see。`;
  }

  return type === "audio"
    ? "没有读到你设置的音频路径，暂时使用默认资源。"
    : "没有读到你设置的图片路径，暂时使用默认资源。";
}
