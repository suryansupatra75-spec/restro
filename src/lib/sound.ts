// Web Audio API Synthesized Chime for New Order Notifications
// 100% zero-dependency, works offline, zero external audio asset latency

class SoundNotifier {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;

  constructor() {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("order_sound_enabled");
      if (saved !== null) {
        this.soundEnabled = saved === "true";
      }
    }
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (typeof window !== "undefined") {
      localStorage.setItem("order_sound_enabled", enabled ? "true" : "false");
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx && AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  // Play pleasant double-bell chime (F5 -> A5)
  public playNewOrderChime(): void {
    if (!this.soundEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // First Bell Tone (698.46 Hz - F5)
    this.playTone(ctx, 698.46, now, 0.45);

    // Second Bell Tone (880 Hz - A5)
    this.playTone(ctx, 880, now + 0.18, 0.6);
  }

  // Play table service call bell chime (C6 -> G5 -> C6)
  public playServiceCallChime(): void {
    if (!this.soundEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // High crisp bell chime for waiter summons
    this.playTone(ctx, 1046.50, now, 0.25);
    this.playTone(ctx, 783.99, now + 0.14, 0.25);
    this.playTone(ctx, 1046.50, now + 0.28, 0.5);
  }

  private playTone(ctx: AudioContext, freq: number, startTime: number, duration: number): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      // Rich bell harmonic
      const harmonic = ctx.createOscillator();
      harmonic.type = "triangle";
      harmonic.frequency.setValueAtTime(freq * 2, startTime);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.2, startTime);
      harmonicGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.7);

      // Main tone volume envelope
      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      harmonic.start(startTime);
      osc.stop(startTime + duration);
      harmonic.stop(startTime + duration);
    } catch {
      // Audio autoplay policy edge case handled gracefully
    }
  }
}

export const soundNotifier = new SoundNotifier();
