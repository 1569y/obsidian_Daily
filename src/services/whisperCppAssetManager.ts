import { App, FileSystemAdapter, Platform, requestUrl } from "obsidian";
import type { EmbeddedSttModel, MoodNestSettings } from "../types";
import { promises as fs } from "fs";
import { constants as fsConstants } from "fs";
import { spawn } from "child_process";
import * as path from "path";

type EmbeddedStatus = {
  platformKey: string;
  autoBinarySupported: boolean;
  resourceRoot: string;
  binDir: string;
  modelsDir: string;
  binaryExists: boolean;
  selectedModel: EmbeddedSttModel;
  selectedModelExists: boolean;
  models: Record<EmbeddedSttModel, boolean>;
};

export class WhisperCppAssetManager {
  private readonly whisperCppVersion = "v1.8.4";

  private readonly binaryUrls: Partial<Record<string, string>> = {
    "win32-x64": `https://github.com/ggml-org/whisper.cpp/releases/download/${this.whisperCppVersion}/whisper-bin-x64.zip`,
    "win32-ia32": `https://github.com/ggml-org/whisper.cpp/releases/download/${this.whisperCppVersion}/whisper-bin-Win32.zip`,
  };

  private readonly modelUrls: Record<EmbeddedSttModel, string> = {
    tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    small: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  };

  constructor(
    private app: App,
    private pluginId: string,
    private settings: MoodNestSettings
  ) {}

  updateSettings(settings: MoodNestSettings) {
    this.settings = settings;
  }

  async getStatus(): Promise<EmbeddedStatus> {
    const platformKey = this.getPlatformKey();
    await this.ensureDir(this.getVendorRoot());
    await this.ensureDir(this.getBinDir());
    await this.ensureDir(this.getModelsDir());
    await this.ensureDir(this.getTmpDir());

    const binaryExists = await this.fileExists(this.getWhisperCliPath());
    const models: Record<EmbeddedSttModel, boolean> = {
      tiny: await this.modelExists("tiny"),
      base: await this.modelExists("base"),
      small: await this.modelExists("small"),
    };

    return {
      platformKey,
      autoBinarySupported: !!this.binaryUrls[platformKey],
      resourceRoot: this.getVendorRoot(),
      binDir: this.getBinDir(),
      modelsDir: this.getModelsDir(),
      binaryExists,
      selectedModel: this.settings.sttEmbeddedModel,
      selectedModelExists: models[this.settings.sttEmbeddedModel],
      models,
    };
  }

  async downloadDefaultResources(): Promise<void> {
    await this.ensureDir(this.getVendorRoot());
    await this.ensureDir(this.getBinDir());
    await this.ensureDir(this.getModelsDir());
    await this.ensureDir(this.getTmpDir());

    const status = await this.getStatus();

    if (!status.binaryExists) {
      await this.downloadCurrentPlatformBinary();
    }

    if (!status.models.base) {
      await this.downloadModel("base");
    }
  }

  async downloadCurrentPlatformBinary(): Promise<void> {
    this.ensureDesktopOnly();

    const platformKey = this.getPlatformKey();
    const url = this.binaryUrls[platformKey];

    if (!url) {
      throw new Error(
        `当前平台暂未配置自动下载 whisper.cpp 引擎：${platformKey}`
      );
    }

    await this.ensureDir(this.getTmpDir());
    await this.ensureDir(this.getBinDir());

    const zipPath = path.join(
      this.getTmpDir(),
      `whispercpp-${platformKey}-${Date.now()}.zip`
    );
    const extractDir = path.join(
      this.getTmpDir(),
      `extract-${platformKey}-${Date.now()}`
    );

    try {
      await this.downloadFile(url, zipPath);
      await this.extractZip(zipPath, extractDir);

      const cliPath = await this.findFileRecursive(
        extractDir,
        process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli"
      );

      if (!cliPath) {
        throw new Error("压缩包已下载，但没有找到 whisper-cli 可执行文件。");
      }

      const sourceDir = path.dirname(cliPath);
      await this.copyDirectoryContents(sourceDir, this.getBinDir());

      if (process.platform !== "win32") {
        try {
          await fs.chmod(this.getWhisperCliPath(), 0o755);
        } catch {
          // ignore
        }
      }
    } finally {
      await this.safeRemove(zipPath);
      await this.safeRemoveDir(extractDir);
    }
  }

  async downloadModel(model: EmbeddedSttModel): Promise<void> {
    const url = this.modelUrls[model];
    const targetPath = this.getModelPath(model);

    await this.ensureDir(this.getModelsDir());

    if (!url) {
      throw new Error(`没有找到模型 ${model} 的下载地址。`);
    }

    await this.downloadFile(url, targetPath);
  }

  async removeModel(model: EmbeddedSttModel): Promise<void> {
    await this.safeRemove(this.getModelPath(model));
  }

  async removeAllModels(): Promise<void> {
    await Promise.all([
      this.removeModel("tiny"),
      this.removeModel("base"),
      this.removeModel("small"),
    ]);
  }

  async modelExists(model: EmbeddedSttModel): Promise<boolean> {
    return this.fileExists(this.getModelPath(model));
  }

  async binaryExists(): Promise<boolean> {
    return this.fileExists(this.getWhisperCliPath());
  }

  async openResourceDir(): Promise<void> {
    const dir = this.getVendorRoot();
    await this.ensureDir(dir);

    if (process.platform === "win32") {
      spawn("explorer.exe", [dir], { detached: true, windowsHide: true });
      return;
    }

    if (process.platform === "darwin") {
      spawn("open", [dir], { detached: true });
      return;
    }

    spawn("xdg-open", [dir], { detached: true });
  }

  getPlatformKey(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "win32" && arch === "x64") return "win32-x64";
    if (platform === "win32" && arch === "ia32") return "win32-ia32";
    if (platform === "win32" && arch === "arm64") return "win32-arm64";
    if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
    if (platform === "darwin" && arch === "x64") return "darwin-x64";
    if (platform === "linux" && arch === "x64") return "linux-x64";
    if (platform === "linux" && arch === "arm64") return "linux-arm64";

    return `${platform}-${arch}`;
  }

  getPluginDir(): string {
    const adapter = this.app.vault.adapter;

    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("当前环境不是桌面文件系统，不能管理内置本地转写资源。");
    }

    return path.join(
      adapter.getBasePath(),
      this.app.vault.configDir,
      "plugins",
      this.pluginId
    );
  }

  getVendorRoot(): string {
    return path.join(this.getPluginDir(), "vendor", "whispercpp");
  }

  getBinDir(): string {
    return path.join(this.getVendorRoot(), "bin", this.getPlatformKey());
  }

  getModelsDir(): string {
    return path.join(this.getVendorRoot(), "models");
  }

  getTmpDir(): string {
    return path.join(this.getVendorRoot(), "tmp");
  }

  getWhisperCliPath(): string {
    const exeName =
      process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
    return path.join(this.getBinDir(), exeName);
  }

  getModelPath(model: EmbeddedSttModel): string {
    return path.join(this.getModelsDir(), `ggml-${model}.bin`);
  }

  private ensureDesktopOnly(): void {
    if (!Platform.isDesktopApp) {
      throw new Error("内置本地语音转写当前只支持 Obsidian 桌面版。");
    }
  }

  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async downloadFile(url: string, targetPath: string): Promise<void> {
    console.log("[MoodNest whisper assets] downloading:", url);

    const response = await requestUrl({
      url,
      method: "GET",
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `下载失败：${response.status} ${response.text || response.headers["status-text"] || ""}`
      );
    }

    await fs.writeFile(targetPath, Buffer.from(response.arrayBuffer));
  }

  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    await this.ensureDir(destDir);

    if (process.platform === "win32") {
      await this.runCommand("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`,
      ]);
      return;
    }

    await this.runCommand("tar", ["-xf", zipPath, "-C", destDir]);
  }

  private async runCommand(command: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        windowsHide: true,
      });

      let stderr = "";

      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => reject(error));

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `${command} 执行失败，退出码：${String(code)}${stderr ? `\n${stderr}` : ""}`
          )
        );
      });
    });
  }

  private async findFileRecursive(
    rootDir: string,
    targetName: string
  ): Promise<string | null> {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);

      if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) {
        return fullPath;
      }

      if (entry.isDirectory()) {
        const found = await this.findFileRecursive(fullPath, targetName);
        if (found) return found;
      }
    }

    return null;
  }

  private async copyDirectoryContents(
    sourceDir: string,
    destDir: string
  ): Promise<void> {
    await this.ensureDir(destDir);
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectoryContents(sourcePath, destPath);
        continue;
      }

      await fs.copyFile(sourcePath, destPath);
    }
  }

  private async safeRemove(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore
    }
  }

  private async safeRemoveDir(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}