import {
  Component, OnInit, OnDestroy, inject, PLATFORM_ID,
  ViewChild, ElementRef, signal, computed
} from '@angular/core';
import { isPlatformBrowser, NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { QuizService, Question } from '../quiz.service';
import { GameStateService } from '../game-state.service';
import { AudioService } from '../audio.service';

type Phase = 'loading' | 'error' | 'playing' | 'correct' | 'failed' | 'done';

@Component({
  selector: 'app-game',
  imports: [FormsModule, NgClass, RouterLink],
  templateUrl: './game.html',
  styleUrl: './game.css'
})
export class Game implements OnInit, OnDestroy {
  @ViewChild('answerInput') answerInput!: ElementRef<HTMLInputElement>;

  private quiz       = inject(QuizService);
  private gameState  = inject(GameStateService);
  private router     = inject(Router);
  private platformId = inject(PLATFORM_ID);
  audio              = inject(AudioService);

  readonly circumference = 2 * Math.PI * 45;

  // ── State réactif (signals) ──
  questions    = signal<Question[]>([]);
  currentIndex = signal(0);
  score        = signal(0);
  phase        = signal<Phase>('loading');
  timeLeft     = signal(0);
  userAnswer   = '';

  private timerRef: ReturnType<typeof setInterval> | null = null;

  // ── Computed ──
  current    = computed(() => this.questions()[this.currentIndex()]);
  duration   = computed(() => this.gameState.timerDuration());
  timerRatio = computed(() => {
    const d = this.duration();
    return d > 0 ? this.timeLeft() / d : 0;
  });
  dashOffset = computed(() => this.circumference * (1 - this.timerRatio()));
  timerColor = computed(() => {
    const r = this.timerRatio();
    if (r > 0.5)  return '#22c55e';
    if (r > 0.25) return '#f97316';
    return '#ef4444';
  });

  resultEmoji = computed(() => {
    const pct = this.score() / (this.questions().length || 1);
    if (pct === 1)   return '🌟';
    if (pct >= 0.75) return '🎉';
    if (pct >= 0.5)  return '👍';
    return '💪';
  });
  resultLabel = computed(() => {
    const pct = this.score() / (this.questions().length || 1);
    if (pct === 1)   return 'Mahafinaritra!';
    if (pct >= 0.75) return 'Tsara be!';
    if (pct >= 0.5)  return 'Azo atao tsara!';
    return 'Avereno indray!';
  });

  get hasTimer(): boolean { return this.duration() > 0; }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.audio.stopBgMusic();
    this.quiz.fetchQuestions().subscribe({
      next: qs => {
        if (!qs.length) { this.phase.set('error'); return; }
        this.questions.set(this.quiz.shuffle(qs));
        this.beginQuestion();
      },
      error: () => { this.phase.set('error'); }
    });
  }

  private beginQuestion() {
    this.userAnswer = '';
    this.phase.set('playing');
    this.startTimer();
    setTimeout(() => this.answerInput?.nativeElement?.focus(), 80);
  }

  private startTimer() {
    if (!this.hasTimer) { this.timeLeft.set(0); return; }
    this.timeLeft.set(this.duration());
    this.clearTimer();
    this.timerRef = setInterval(() => {
      const t = this.timeLeft() - 1;
      this.timeLeft.set(t);

      // Tick urgent si ≤ 5 secondes restantes
      this.audio.playTick(t <= 5);

      if (t <= 0) {
        this.clearTimer();
        this.audio.play('wrong');
        this.phase.set('failed');
      }
    }, 1000);
  }

  private clearTimer() {
    if (this.timerRef) { clearInterval(this.timerRef); this.timerRef = null; }
  }

  onInput() {
    if (this.phase() !== 'playing') return;
    const correct = this.current().reponse;
    const match =
      this.quiz.normalize(this.userAnswer) === this.quiz.normalize(correct) ||
      this.quiz.smartMatch(this.userAnswer, correct);
    if (match) {
      this.clearTimer();
      this.score.update(s => s + 1);
      this.phase.set('correct');
      this.audio.play('correct');
    }
  }

  giveUp() {
    if (this.phase() !== 'playing') return;
    this.clearTimer();
    this.audio.play('wrong');
    this.phase.set('failed');
  }

  next() {
    this.audio.play('click');
    this.clearTimer();
    const next = this.currentIndex() + 1;
    if (next >= this.questions().length) {
      this.questions.set(this.quiz.shuffle(this.questions()));
      this.currentIndex.set(0);
    } else {
      this.currentIndex.set(next);
    }
    this.beginQuestion();
  }

  restart() {
    this.questions.set(this.quiz.shuffle(this.questions()));
    this.currentIndex.set(0);
    this.score.set(0);
    this.beginQuestion();
  }

  goHome() {
    this.clearTimer();
    this.router.navigate(['/']);
  }

  ngOnDestroy() { this.clearTimer(); }
}
