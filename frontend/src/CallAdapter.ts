import type { CallAdapterCallbacks, CallStatus } from "./types";

// Common audio contract across every transport (see CLAUDE.md decision #6).
const TARGET_SAMPLE_RATE = 8000;

// RMS above this (float samples in [-1, 1]) counts as speech, not silence.
const SILENCE_RMS_THRESHOLD = 0.02;
// How long RMS must stay below threshold, after speech was heard, before
// we consider the caller's turn over and send end_of_turn.
const SILENCE_DURATION_MS = 1000;
// How long RMS must stay ABOVE threshold, while the assistant is
// processing/speaking, before we treat it as a genuine barge-in rather
// than mic noise/echo picked up off the speakers.
const BARGE_IN_DURATION_MS = 300;

function downsampleTo8kHz(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input;

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const idxLow = Math.floor(srcIndex);
    const idxHigh = Math.min(idxLow + 1, input.length - 1);
    const frac = srcIndex - idxLow;
    output[i] = input[idxLow] * (1 - frac) + input[idxHigh] * frac;
  }

  return output;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function computeRMS(input: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}

// Drives one call over the /audio websocket protocol (see backend/app/main.py):
// the mic capture pipeline runs continuously for the whole call. While
// "listening" every frame is streamed to the server and silence ends the
// turn. While "processing"/"speaking" frames are only forwarded once
// sustained voice activity confirms a real barge-in (not echo/noise) --
// that both stops local playback immediately and, because the server only
// treats incoming audio during an in-flight turn as an interrupt signal,
// tells the backend to abort the reply it's generating/streaming.
export class CallAdapter {
  private callbacks: CallAdapterCallbacks;
  private status: CallStatus = "idle";

  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;

  private hasSpoken = false;
  private silenceStartedAt: number | null = null;
  private bargeInStartedAt: number | null = null;
  private playbackChunks: Int16Array[] = [];
  private fillerChunks: Int16Array[] = [];
  private receivingFiller = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private pendingPlayback: { chunks: Int16Array[]; onEnded: () => void } | null = null;

  constructor(callbacks: CallAdapterCallbacks) {
    this.callbacks = callbacks;
  }

  async startCall(wsUrl: string): Promise<void> {
    this.setStatus("connecting");
    this.debug("connecting...");

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Best-effort mitigation against the mic picking up the
          // assistant's own playback through the speakers (no headphones
          // assumed). Not a guarantee -- browser AEC quality varies.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      this.callbacks.onError("Microphone access denied.");
      this.debug("microphone access denied");
      this.setStatus("error");
      return;
    }

    this.audioContext = new AudioContext();
    this.sourceNode = this.audioContext.createMediaStreamSource(this.micStream);
    // ScriptProcessorNode is deprecated but needs no separate worklet module
    // file/build step -- simplest option for a V1 pseudo-call. Its output is
    // left untouched (silent), so connecting it to destination just makes
    // onaudioprocess fire; it doesn't loop mic audio back to the speakers.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = this.handleAudioProcess;
    this.sourceNode.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.debug("connected, listening");
      this.setStatus("listening");
    };

    this.ws.onmessage = this.handleServerMessage;

    this.ws.onerror = () => {
      this.callbacks.onError("Connection error.");
      this.debug("websocket error");
      this.setStatus("error");
    };

    this.ws.onclose = () => {
      this.debug("connection closed");
      if (this.status !== "ended") {
        this.setStatus("ended");
      }
    };
  }

  endCall(): void {
    this.debug("call ended");
    this.setStatus("ended");

    this.currentSource?.stop();
    this.currentSource = null;

    this.ws?.close();
    this.ws = null;

    this.processor?.disconnect();
    this.sourceNode?.disconnect();
    this.processor = null;
    this.sourceNode = null;

    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;

    this.audioContext?.close();
    this.audioContext = null;

    this.playbackChunks = [];
    this.fillerChunks = [];
    this.receivingFiller = false;
    this.pendingPlayback = null;
    this.hasSpoken = false;
    this.silenceStartedAt = null;
    this.bargeInStartedAt = null;
  }

  // Manual alternative to the automatic silence detection below -- lets
  // the UI offer a button for the caller to explicitly signal "I'm done
  // talking" instead of waiting out SILENCE_DURATION_MS. Silence
  // detection keeps running as before; this is purely additive.
  endTurn(): void {
    if (this.status !== "listening") return;
    this.debug("caller ended turn manually");
    this.finishTurn();
  }

  private setStatus(status: CallStatus) {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }

  private debug(message: string) {
    this.callbacks.onDebug(message);
  }

  private handleAudioProcess = (event: AudioProcessingEvent) => {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const inputData = event.inputBuffer.getChannelData(0);
    const rms = computeRMS(inputData);
    this.callbacks.onAudioLevel(rms);
    const now = performance.now();

    if (this.status === "listening") {
      const downsampled = downsampleTo8kHz(inputData, this.audioContext!.sampleRate);
      this.ws.send(floatTo16BitPCM(downsampled).buffer);

      if (rms > SILENCE_RMS_THRESHOLD) {
        this.hasSpoken = true;
        this.silenceStartedAt = null;
      } else if (this.hasSpoken) {
        if (this.silenceStartedAt === null) {
          this.silenceStartedAt = now;
        } else if (now - this.silenceStartedAt >= SILENCE_DURATION_MS) {
          this.finishTurn();
        }
      }
      return;
    }

    if (this.status === "processing" || this.status === "speaking") {
      if (rms > SILENCE_RMS_THRESHOLD) {
        if (this.bargeInStartedAt === null) {
          this.bargeInStartedAt = now;
        } else if (now - this.bargeInStartedAt >= BARGE_IN_DURATION_MS) {
          this.bargeIn();
          // Forward this frame immediately so the server sees audio without
          // an extra buffer's worth of delay.
          const downsampled = downsampleTo8kHz(inputData, this.audioContext!.sampleRate);
          this.ws.send(floatTo16BitPCM(downsampled).buffer);
        }
      } else {
        this.bargeInStartedAt = null;
      }
    }
  };

  private bargeIn() {
    this.debug("barge-in detected, interrupting assistant");

    this.currentSource?.stop();
    this.currentSource = null;
    this.playbackChunks = [];
    this.fillerChunks = [];
    this.receivingFiller = false;
    this.pendingPlayback = null;

    this.hasSpoken = true;
    this.silenceStartedAt = null;
    this.bargeInStartedAt = null;

    this.setStatus("listening");
  }

  private finishTurn() {
    this.hasSpoken = false;
    this.silenceStartedAt = null;
    this.debug("silence detected, ending turn");
    this.setStatus("processing");
    this.ws?.send(JSON.stringify({ event: "end_of_turn" }));
  }

  private handleServerMessage = (event: MessageEvent) => {
    if (typeof event.data === "string") {
      const parsed = JSON.parse(event.data);

      if (parsed.event === "filler_start") {
        this.receivingFiller = true;
        this.fillerChunks = [];
      } else if (parsed.event === "filler_end") {
        this.receivingFiller = false;
        this.debug(`playing please-wait message (${this.fillerChunks.length} chunks)`);
        const chunks = this.fillerChunks;
        this.fillerChunks = [];
        // No status/onEnded transition -- the real reply keeps accumulating
        // in the background and drives its own status change on reply_end.
        this.playAudio(chunks, () => {});
      } else if (parsed.event === "reply_end") {
        this.debug(`reply received (${this.playbackChunks.length} chunks), playing back`);
        const chunks = this.playbackChunks;
        this.playbackChunks = [];
        this.playAudio(chunks, () => this.resumeListening());
      } else if (parsed.event === "interrupted") {
        this.debug("server confirmed interruption");
        this.playbackChunks = [];
        this.fillerChunks = [];
        this.receivingFiller = false;
        this.pendingPlayback = null;
      } else if (parsed.event === "error") {
        this.debug(`server error: ${parsed.message ?? "unknown"}`);
        this.callbacks.onError(parsed.message ?? "Server error.");
      }
      return;
    }

    const chunk = new Int16Array(event.data as ArrayBuffer);
    if (this.receivingFiller) {
      this.fillerChunks.push(chunk);
    } else {
      this.playbackChunks.push(chunk);
    }
  };

  // Plays a batch of already-received PCM16 chunks (filler line or real
  // reply) through the same interruptible AudioBufferSourceNode that
  // bargeIn() knows how to stop -- callers don't need their own barge-in
  // handling, it falls out of currentSource being generic. If something
  // is already playing (e.g. the real reply arrives before the filler
  // line finishes), this queues behind it instead of overlapping audio.
  private playAudio(chunks: Int16Array[], onEnded: () => void) {
    if (this.currentSource) {
      this.pendingPlayback = { chunks, onEnded };
      return;
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

    if (totalLength === 0) {
      onEnded();
      this.playNextPending();
      return;
    }

    this.setStatus("speaking");

    const merged = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const audioContext = this.audioContext!;
    const audioBuffer = audioContext.createBuffer(1, merged.length, TARGET_SAMPLE_RATE);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < merged.length; i++) {
      channelData[i] = merged[i] / 0x8000;
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      if (this.currentSource === source) {
        this.currentSource = null;
        onEnded();
        this.playNextPending();
      }
    };
    this.currentSource = source;
    source.start();
  }

  private playNextPending() {
    if (!this.pendingPlayback) return;
    const { chunks, onEnded } = this.pendingPlayback;
    this.pendingPlayback = null;
    this.playAudio(chunks, onEnded);
  }

  private resumeListening() {
    if (this.status === "ended" || this.status === "error") return;
    this.debug("listening");
    this.setStatus("listening");
  }
}
