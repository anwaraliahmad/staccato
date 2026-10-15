// Record the canvas plus whatever Staccato is hearing to a video file.

const TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

export class Recorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  static get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  start(canvas: HTMLCanvasElement, audio: MediaStream): void {
    if (this.recording) return;
    const stream = new MediaStream([...canvas.captureStream(60).getVideoTracks(), ...audio.getAudioTracks()]);
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    this.recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size) this.chunks.push(e.data);
    });
    this.recorder.start(1000);
  }

  /** Stop and hand back the file. */
  stop(): Promise<File | null> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        for (const track of recorder.stream.getVideoTracks()) track.stop();
        const type = recorder.mimeType || 'video/webm';
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        resolve(new File(this.chunks, `staccato-${stamp}.${ext}`, { type }));
        this.recorder = null;
      }, { once: true });
      recorder.stop();
    });
  }
}

export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
