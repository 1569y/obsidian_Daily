import { App } from "obsidian";
import type { MoodNestSettings } from "../types";
import { WhisperCppManager } from "./whisperCppManager";

export class AsrService {
  private whisperCppManager: WhisperCppManager;

  constructor(
    private app: App,
    private pluginId: string,
    private settings: MoodNestSettings
  ) {
    this.whisperCppManager = new WhisperCppManager(
      app,
      pluginId,
      settings
    );
  }

  updateSettings(settings: MoodNestSettings) {
    this.settings = settings;
    this.whisperCppManager.updateSettings(settings);
  }

  async init(): Promise<void> {
    console.log("[MoodNest ASR] init");
    console.log("[MoodNest ASR] tier =", this.settings.sttTier);

    if (this.settings.sttTier === "embedded_local") {
      await this.whisperCppManager.ensureReady();
      return;
    }

    console.log("[MoodNest ASR] api transcription is enabled");
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error("没有可转写的录音。");
    }

    console.log("[MoodNest ASR] transcribe start");
    console.log("[MoodNest ASR] tier =", this.settings.sttTier);
    console.log("[MoodNest ASR] blob size =", audioBlob.size);
    console.log("[MoodNest ASR] blob type =", audioBlob.type);

    if (this.settings.sttTier === "api") {
      try {
        return (await this.transcribeByApi(audioBlob)).trim();
      } catch (error) {
        return await this.fallbackToEmbeddedLocal(audioBlob, error);
      }
    }

    return (await this.transcribeByEmbeddedLocal(audioBlob)).trim();
  }

  isReady(): boolean {
    return true;
  }

  private async transcribeByEmbeddedLocal(audioBlob: Blob): Promise<string> {
    const wavBytes = await this.audioBlobTo16kMonoWav(audioBlob);
    return await this.whisperCppManager.transcribeWav(wavBytes, "zh");
  }

  private async transcribeByApi(audioBlob: Blob): Promise<string> {
    const url = this.settings.sttApiBaseUrl?.trim();

    if (!url) {
      throw new Error("STT API Base URL 为空，请先在设置里填写。");
    }

    const formData = this.buildApiFormData(audioBlob);

    const headers: Record<string, string> = {};
    if (this.settings.sttApiKey?.trim()) {
      headers.Authorization = `Bearer ${this.settings.sttApiKey.trim()}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await this.safeReadText(response);
      throw new Error(
        `在线语音转写请求失败（${response.status}）${this.formatApiErrorSuffix(
          errorText
        )}`
      );
    }

    const data = await this.safeReadJson(response);
    const text = this.extractTranscript(data);

    if (!text) {
      throw new Error("在线语音转写成功，但没有返回可用文本。");
    }

    return text;
  }

  private async fallbackToEmbeddedLocal(
    audioBlob: Blob,
    apiError: unknown
  ): Promise<string> {
    const apiMessage = this.toSafeErrorMessage(apiError);
    console.warn(
      "[MoodNest ASR] api transcription failed; trying embedded_local fallback:",
      apiMessage
    );

    try {
      return (await this.transcribeByEmbeddedLocal(audioBlob)).trim();
    } catch (localError) {
      const localMessage = this.toSafeErrorMessage(localError);
      console.error(
        "[MoodNest ASR] embedded_local fallback failed:",
        localMessage
      );
      throw new Error(
        `在线语音转写失败，回退内置本地转写也没有成功。API：${apiMessage}；本地：${localMessage}`
      );
    }
  }

  private formatApiErrorSuffix(errorText: string): string {
    const safeMessage = this.extractSafeApiError(errorText);
    if (!safeMessage) {
      return "。";
    }

    return `：${safeMessage}`;
  }

  private extractSafeApiError(errorText: string): string {
    const raw = errorText.trim();
    if (!raw) {
      return "";
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const nestedError =
        parsed.error && typeof parsed.error === "object"
          ? (parsed.error as Record<string, unknown>)
          : null;
      const candidates = [
        parsed.message,
        parsed.error,
        nestedError?.message,
        parsed.msg,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          return this.limitErrorMessage(candidate);
        }
      }
    } catch {
      // Fall back to plain text handling below.
    }

    return this.limitErrorMessage(raw);
  }

  private limitErrorMessage(message: string): string {
    const compact = message.replace(/\s+/g, " ").trim();
    if (!compact) {
      return "";
    }

    return compact.length > 160 ? `${compact.slice(0, 160)}...` : compact;
  }

  private toSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return this.limitErrorMessage(error.message) || "未知错误";
    }

    if (typeof error === "string") {
      return this.limitErrorMessage(error) || "未知错误";
    }

    return "未知错误";
  }

  private buildApiFormData(audioBlob: Blob): FormData {
    const formData = new FormData();

    const extension = this.getFileExtension(audioBlob.type);
    const file = new File([audioBlob], `moodnest-audio.${extension}`, {
      type: audioBlob.type || "audio/webm",
    });

    formData.append("file", file);
    formData.append("model", this.settings.sttApiModel?.trim() || "whisper-1");
    formData.append("language", "zh");
    formData.append("response_format", "json");

    return formData;
  }

  private getFileExtension(mimeType: string): string {
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return "webm";
  }

  private extractTranscript(data: unknown): string {
    if (!data || typeof data !== "object") {
      return "";
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.text === "string" && obj.text.trim()) {
      return obj.text.trim();
    }

    if (typeof obj.transcript === "string" && obj.transcript.trim()) {
      return obj.transcript.trim();
    }

    if (typeof obj.result === "string" && obj.result.trim()) {
      return obj.result.trim();
    }

    if (Array.isArray(obj.segments)) {
      const joined = obj.segments
        .map((item) => {
          if (item && typeof item === "object" && "text" in item) {
            const text = (item as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .join("")
        .trim();

      if (joined) {
        return joined;
      }
    }

    return "";
  }

  private async safeReadJson(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text.trim()) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error("[MoodNest ASR] JSON parse failed:", error);
      throw new Error("转写服务返回的不是合法 JSON。");
    }
  }

  private async safeReadText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }

  private async audioBlobTo16kMonoWav(audioBlob: Blob): Promise<Uint8Array> {
    const arrayBuffer = await audioBlob.arrayBuffer();

    const AudioContextClass =
      window.AudioContext ||
      (window as Window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("当前环境不支持音频解码。");
    }

    const audioContext = new AudioContextClass();

    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const mono = this.mixToMono(audioBuffer);
      const resampled = this.resampleLinear(
        mono,
        audioBuffer.sampleRate,
        16000
      );
      return this.encode16BitMonoWav(resampled, 16000);
    } finally {
      await audioContext.close();
    }
  }

  private mixToMono(audioBuffer: AudioBuffer): Float32Array {
    const { numberOfChannels, length } = audioBuffer;

    if (numberOfChannels === 1) {
      return audioBuffer.getChannelData(0).slice();
    }

    const result = new Float32Array(length);

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const current = result[i] ?? 0;
        const sample = channelData[i] ?? 0;
        result[i] = current + sample / numberOfChannels;
      }
    }

    return result;
  }

  private resampleLinear(
    input: Float32Array,
    sourceRate: number,
    targetRate: number
  ): Float32Array {
    if (sourceRate === targetRate) {
      return input;
    }

    const ratio = sourceRate / targetRate;
    const newLength = Math.max(1, Math.round(input.length / ratio));
    const output = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, input.length - 1);
      const weight = position - left;

      const leftValue = input[left] ?? 0;
      const rightValue = input[right] ?? 0;

      output[i] = leftValue * (1 - weight) + rightValue * weight;
    }

    return output;
  }

  private encode16BitMonoWav(
    samples: Float32Array,
    sampleRate: number
  ): Uint8Array {
    const bytesPerSample = 2;
    const blockAlign = bytesPerSample * 1;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    this.writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.writeAscii(view, 8, "WAVE");
    this.writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    this.writeAscii(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    return new Uint8Array(buffer);
  }

  private writeAscii(view: DataView, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }
}
