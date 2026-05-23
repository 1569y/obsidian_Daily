export class SpeechService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private currentMimeType = "audio/webm";

  async startRecording(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("当前环境不支持录音功能。");
    }

    if (this.isRecording()) {
      throw new Error("当前已经在录音中。");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioChunks = [];

    const mimeType = this.getSupportedMimeType();
    this.currentMimeType = mimeType ?? "audio/webm";

    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
    };

    this.mediaRecorder.start();
  }

  async stopRecording(): Promise<Blob> {
    const recorder = this.mediaRecorder;

    if (!recorder) {
      throw new Error("当前没有正在进行的录音。");
    }

    if (recorder.state !== "recording" && recorder.state !== "paused") {
      throw new Error("录音器当前不处于可停止状态。");
    }

    return new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        try {
          const audioBlob = new Blob(this.audioChunks, {
            type: this.currentMimeType,
          });
          this.cleanup();
          resolve(audioBlob);
        } catch (error) {
          this.cleanup();
          reject(error);
        }
      };

      recorder.onerror = (event) => {
        this.cleanup();
        reject(event);
      };

      recorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  hasActiveRecorder(): boolean {
    return this.mediaRecorder !== null;
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private getSupportedMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined") {
      return undefined;
    }

    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type));
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}