import { App, FileSystemAdapter, Platform } from "obsidian";
import type { MoodNestSettings } from "../types";
import { promises as fs } from "fs";
import { constants as fsConstants } from "fs";
import { spawn } from "child_process";
import * as path from "path";

export class WhisperCppManager {
  private readonly host = "127.0.0.1";

  constructor(
    private app: App,
    private pluginId: string,
    private settings: MoodNestSettings
  ) {}

  updateSettings(settings: MoodNestSettings) {
    this.settings = settings;
  }

  async ensureReady(): Promise<void> {
    this.ensureDesktopOnly();

    const pluginDir = this.getPluginDir();
    const vendorRoot = this.getVendorRoot();
    const binPath = this.getWhisperCliPath();
    const modelPath = this.getModelPath();

    await this.ensureDir(pluginDir);
    await this.ensureDir(vendorRoot);
    await this.ensureDir(this.getTmpDir());

    await this.assertFileExists(
      binPath,
      [
        "没有找到 whisper.cpp 可执行文件。",
        `当前期望路径：${binPath}`,
        "请先把对应平台的 whisper-cli 放到：",
        this.getBinDir(),
      ].join("\n")
    );

    await this.assertFileExists(
      modelPath,
      [
        "没有找到 whisper.cpp 模型文件。",
        `当前期望路径：${modelPath}`,
        "请先把模型文件放到：",
        this.getModelsDir(),
      ].join("\n")
    );

    if (process.platform !== "win32") {
      try {
        await fs.chmod(binPath, 0o755);
      } catch (error) {
        console.warn("[MoodNest whisper.cpp] chmod failed:", error);
      }
    }
  }

  async transcribeWav(
    wavBytes: Uint8Array,
    language = "zh"
  ): Promise<string> {
    await this.ensureReady();

    const tmpDir = this.getTmpDir();
    const id = this.createJobId();
    const wavPath = path.join(tmpDir, `${id}.wav`);
    const outPrefix = path.join(tmpDir, `${id}`);

    await fs.writeFile(wavPath, wavBytes);

    const args = [
      "-m",
      this.getModelPath(),
      "-f",
      wavPath,
      "-l",
      language,
      "-otxt",
      "-ojf",
      "-of",
      outPrefix,
      "-np",
      "-nt",
    ];

    const { stdout, stderr, code } = await this.runProcess(
      this.getWhisperCliPath(),
      args
    );

    if (code !== 0) {
      await this.cleanupJobFiles(outPrefix, wavPath);
      throw new Error(
        [
          "whisper.cpp 转写失败。",
          `退出码：${String(code)}`,
          stderr ? `stderr: ${stderr}` : "",
          stdout ? `stdout: ${stdout}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    try {
      const jsonText = await this.tryReadFile(`${outPrefix}.json`);
      if (jsonText) {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        const transcript = this.extractTranscriptFromJson(parsed);
        if (transcript) {
          return transcript;
        }
      }

      const txtText = await this.tryReadFile(`${outPrefix}.txt`);
      if (txtText?.trim()) {
        return txtText.trim();
      }

      const cleanedStdout = stdout.trim();
      if (cleanedStdout) {
        return cleanedStdout;
      }

      throw new Error("whisper.cpp 已执行完成，但没有产出可用文本。");
    } finally {
      await this.cleanupJobFiles(outPrefix, wavPath);
    }
  }

  getPlatformKey(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "win32" && arch === "x64") return "win32-x64";
    if (platform === "win32" && arch === "arm64") return "win32-arm64";
    if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
    if (platform === "darwin" && arch === "x64") return "darwin-x64";
    if (platform === "linux" && arch === "x64") return "linux-x64";
    if (platform === "linux" && arch === "arm64") return "linux-arm64";

    throw new Error(
      `当前平台暂未接入 whisper.cpp 资源映射：${platform}-${arch}`
    );
    }

  getPluginDir(): string {
    const adapter = this.app.vault.adapter;

    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("当前环境不是桌面版文件系统，不能运行内置本地转写。");
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
    const exeName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
    return path.join(this.getBinDir(), exeName);
  }

  getModelPath(): string {
    return path.join(
      this.getModelsDir(),
      `ggml-${this.settings.sttEmbeddedModel}.bin`
    );
  }

  private ensureDesktopOnly(): void {
    if (!Platform.isDesktopApp) {
      throw new Error("内置本地语音转写当前只支持 Obsidian 桌面版。");
    }
  }

  private async runProcess(
    command: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: path.dirname(command),
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });

      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, code });
      });
    });
  }

  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  private async assertFileExists(filePath: string, message: string): Promise<void> {
    try {
      await fs.access(filePath, fsConstants.F_OK);
    } catch {
      throw new Error(message);
    }
  }

  private async tryReadFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  private extractTranscriptFromJson(data: Record<string, unknown>): string {
    if (typeof data.text === "string" && data.text.trim()) {
      return data.text.trim();
    }

    if (Array.isArray(data.transcription)) {
      const joined = data.transcription
        .map((item) => {
          if (item && typeof item === "object" && "text" in item) {
            const text = (item as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .join("")
        .trim();

      if (joined) return joined;
    }

    if (Array.isArray(data.segments)) {
      const joined = data.segments
        .map((item) => {
          if (item && typeof item === "object" && "text" in item) {
            const text = (item as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .join("")
        .trim();

      if (joined) return joined;
    }

    return "";
  }

  private createJobId(): string {
    return `mn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async cleanupJobFiles(outPrefix: string, wavPath: string): Promise<void> {
    const candidates = [
      wavPath,
      `${outPrefix}.txt`,
      `${outPrefix}.json`,
      `${outPrefix}.srt`,
      `${outPrefix}.vtt`,
      `${outPrefix}.csv`,
      `${outPrefix}.lrc`,
      outPrefix,
    ];

    await Promise.all(
      candidates.map(async (file) => {
        try {
          await fs.unlink(file);
        } catch {
          // ignore
        }
      })
    );
  }
}