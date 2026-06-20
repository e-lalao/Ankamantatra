import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { MultiService } from '../../multi.service';
import { QuizService } from '../../quiz.service';
import { AudioService } from '../../audio.service';

// 'revealed' = Afapo cliqué, réponse visible mais chrono continue
type CardState = 'idle' | 'revealed' | 'correct' | 'failed';

@Component({
  selector: 'app-multi-game',
  standalone: true,
  imports: [],
  templateUrl: './multi-game.html',
  styleUrl: './multi-game.css',
})
export class MultiGame implements OnInit, OnDestroy {
  private router = inject(Router);
  multi  = inject(MultiService);
  quiz   = inject(QuizService);
  audio  = inject(AudioService);

  // ── État local du joueur ──────────────────────────────────────────────
  userInput   = signal('');
  cardState   = signal<CardState>('idle');
  revealed    = signal(false);
  timeLeft    = signal(0);
  private timerRef: ReturnType<typeof setInterval> | null = null;

  // ── Dérivations depuis la session Supabase ────────────────────────────
  session  = this.multi.session;
  players  = computed(() => [...this.multi.players()].sort((a, b) => b.score - a.score));
  myPlayer = computed(() => this.multi.myPlayer);

  currentQ = computed(() => {
    const s = this.session();
    if (!s || !s.questions?.length) return null;
    return s.questions[s.current_question] ?? null;
  });

  duration = computed(() => this.session()?.timer_duration ?? 30);

  timerRatio    = computed(() => this.duration() > 0 ? this.timeLeft() / this.duration() : 0);
  circumference = 2 * Math.PI * 26;
  dashOffset    = computed(() => this.circumference * (1 - this.timerRatio()));
  timerColor    = computed(() =>
    this.timerRatio() > 0.5 ? '#22c55e' : this.timerRatio() > 0.25 ? '#f97316' : '#ef4444'
  );

  get hasTimer()     { return this.duration() > 0; }
  get isHost()       { return this.multi.isHost; }
  get allAnswered()  { return this.multi.players().every(p => p.answered); }

  // Résultats finaux
  resultEmoji = computed(() => {
    const me = this.myPlayer();
    if (!me || !this.session()?.questions?.length) return '🎉';
    const pct = me.score / this.session()!.questions.length;
    if (pct >= 0.9) return '🌟'; if (pct >= 0.7) return '🎉';
    if (pct >= 0.5) return '👍'; return '💪';
  });

  constructor() {
    // Quand current_question change → nouvelle question
    effect(() => {
      const q = this.currentQ();
      if (q && this.session()?.phase === 'playing') this.resetForNewQuestion();
    });

    // Fin automatique du chrono quand tous les joueurs ont répondu
    effect(() => {
      const allDone = this.multi.players().length > 0 &&
                      this.multi.players().every(p => p.answered);
      if (!allDone) return;
      const state = this.cardState();
      if (state === 'revealed') {
        // Afapo avait été cliqué, les autres aussi — arrêter le chrono maintenant
        this.clearTimer();
        this.cardState.set('failed');
      } else if (state === 'idle') {
        // Le joueur n'avait pas encore répondu — révéler et soumettre
        this.clearTimer();
        this.revealed.set(true);
        this.cardState.set('failed');
        this.multi.submitAnswer(false);
      }
    });

    // Redirection si session supprimée ou terminée
    effect(() => {
      const s = this.session();
      if (s === null) this.router.navigate(['/']);
    });
  }

  ngOnInit() {
    const s = this.multi.session();
    if (!s) { this.router.navigate(['/multi']); return; }
    this.audio.stopBgMusic();
    if (s.phase === 'playing') this.resetForNewQuestion();
  }

  ngOnDestroy() {
    this.clearTimer();
    this.multi.unsubscribe();
  }

  // ── Timer ─────────────────────────────────────────────────────────────
  private resetForNewQuestion() {
    this.userInput.set('');
    this.cardState.set('idle');
    this.revealed.set(false);
    this.clearTimer();
    if (this.hasTimer) {
      this.timeLeft.set(this.duration());
      this.startTimer();
    }
  }

  private startTimer() {
    this.timerRef = setInterval(() => {
      const t = this.timeLeft() - 1;
      // Sons tick uniquement si on n'a pas encore révélé la réponse
      if (this.cardState() === 'idle') {
        if (t <= 5 && t > 0) this.audio.playTick(true);
        else if (t > 5)      this.audio.playTick(false);
      }
      if (t <= 0) {
        this.timeLeft.set(0);
        this.clearTimer();
        this.onTimeUp();
      } else {
        this.timeLeft.set(t);
      }
    }, 1000);
  }

  private clearTimer() {
    if (this.timerRef) { clearInterval(this.timerRef); this.timerRef = null; }
  }

  private onTimeUp() {
    if (this.cardState() === 'idle') {
      // Temps écoulé sans réponse
      this.cardState.set('failed');
      this.revealed.set(true);
      this.audio.play('wrong');
      this.multi.submitAnswer(false);
    } else if (this.cardState() === 'revealed') {
      // Afapo avait révélé la réponse, le chrono vient de finir → Manaraka apparaît
      this.cardState.set('failed');
    }
  }

  // ── Saisie réponse ────────────────────────────────────────────────────
  onInput(e: Event) {
    if (this.cardState() !== 'idle') return;
    const val = (e.target as HTMLInputElement).value;
    this.userInput.set(val);
    const q = this.currentQ();
    if (!q) return;

    const correct =
      this.quiz.normalize(val) === this.quiz.normalize(q.reponse) ||
      this.quiz.smartMatch(val, q.reponse);

    if (correct) {
      this.clearTimer();
      this.cardState.set('correct');
      this.revealed.set(true);
      this.audio.play('correct');
      this.multi.submitAnswer(true);
    }
  }

  // ── Afapo : révèle la réponse mais le chrono continue ────────────────
  onAfapo() {
    if (this.cardState() !== 'idle') return;
    // Ne pas arrêter le chrono — il continue jusqu'à 0
    this.cardState.set('revealed');
    this.revealed.set(true);
    this.audio.play('wrong');
    this.multi.submitAnswer(false);
    // Si pas de chrono, passer directement à 'failed' pour montrer Manaraka
    if (!this.hasTimer) this.cardState.set('failed');
  }

  // ── Manaraka (hôte uniquement) ─────────────────────────────────────────
  async onManaraka() {
    await this.multi.nextQuestion();
    // L'effet (effect) sur currentQ déclenche resetForNewQuestion automatiquement
  }

  // ── Fin de partie ─────────────────────────────────────────────────────
  async onEnd() {
    await this.multi.deleteSession();
    this.router.navigate(['/']);
  }

  onHome() {
    this.multi.cleanup();
    this.router.navigate(['/']);
  }
}
