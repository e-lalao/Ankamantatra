import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private platformId = inject(PLATFORM_ID);

  muted = signal(false);

  private ctx: AudioContext | null = null;
  private cache: Partial<Record<string, HTMLAudioElement>> = {};
  private bgAudio: HTMLAudioElement | null = null;

  toggleMute() {
    this.muted.update(m => !m);
    if (this.bgAudio) {
      this.bgAudio.muted = this.muted();
    }
  }

  private get audioCtx(): AudioContext | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // ── Musique de fond en boucle ──
  playBgMusic() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.bgAudio) {
      this.bgAudio = new Audio('sounds/music-background-ankamantatra.mp3');
      this.bgAudio.loop = true;
      this.bgAudio.volume = 0.35;
    }
    this.bgAudio.muted = this.muted();
    this.bgAudio.play().catch(() => {
      // Autoplay bloqué : démarre au prochain geste utilisateur
      const resume = () => {
        this.bgAudio?.play().catch(() => {});
        document.removeEventListener('click', resume);
      };
      document.addEventListener('click', resume, { once: true });
    });
  }

  stopBgMusic() {
    if (!this.bgAudio) return;
    this.bgAudio.pause();
    this.bgAudio.currentTime = 0;
  }

  // ── Effets sonores ──
  play(name: 'correct' | 'wrong' | 'click' | 'woueh') {
    if (this.muted() || !isPlatformBrowser(this.platformId)) return;
    let audio = this.cache[name];
    if (!audio) {
      audio = new Audio(`sounds/${name}.mp3`);
      audio.volume = name === 'correct' ? 0.7 : name === 'woueh' ? 0.8 : 0.5;
      this.cache[name] = audio;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  // ── Tick généré par Web Audio API ──
  playTick(urgent = false) {
    if (this.muted()) return;
    const ctx = this.audioCtx;
    if (!ctx) return;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = urgent ? 1100 : 750;

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(urgent ? 0.35 : 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.start(t);
    osc.stop(t + 0.07);
  }
}
