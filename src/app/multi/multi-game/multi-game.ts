import { Component, OnInit, OnDestroy, inject, signal, computed, effect, untracked } from '@angular/core';
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
  private lastQuestionKey = '';
  private resetPending    = false;

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

  get hasTimer()    { return this.duration() > 0; }
  get isHost()      { return this.multi.isHost; }
  get allAnswered() {
    const active = this.multi.players().filter(p => !p.left_game);
    return active.length > 0 && active.every(p => p.answered);
  }

  // Résultats finaux
  resultEmoji = computed(() => {
    const me = this.myPlayer();
    if (!me || !this.session()?.questions?.length) return '🎉';
    const pct = me.score / this.session()!.questions.length;
    if (pct >= 0.9) return '🌟'; if (pct >= 0.7) return '🎉';
    if (pct >= 0.5) return '👍'; return '💪';
  });

  constructor() {
    // Quand current_question change → reset UNIQUE (dédoublonné par clé)
    effect(() => {
      const s = this.session();
      const q = this.currentQ();
      if (!q || s?.phase !== 'playing') return;
      const key = `${s.id}-${s.current_question}`;
      if (untracked(() => this.lastQuestionKey) === key) return;
      this.lastQuestionKey = key;
      this.resetForNewQuestion();
    });

    // Fin de manche automatique quand tous les joueurs actifs ont répondu
    effect(() => {
      const active = this.multi.players().filter(p => !p.left_game);
      const allDone = active.length > 0 && active.every(p => p.answered);
      if (!allDone) return;
      if (this.resetPending) return;
      const state = this.cardState();
      if (state === 'idle') {
        // Quelqu'un d'autre a trouvé → révéler la réponse pour ce joueur
        this.clearTimer();
        this.revealed.set(true);
        this.cardState.set('failed');
      } else if (state === 'revealed') {
        // Tout le monde est Afapo → fin du chrono
        this.clearTimer();
        this.cardState.set('failed');
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
    this.resetPending = true;
    // Réinitialiser answered localement en premier pour que allDone ne se déclenche pas
    this.multi.players.update(list => list.map(p => ({ ...p, answered: false })));
    this.userInput.set('');
    this.cardState.set('idle');
    this.revealed.set(false);
    this.clearTimer();
    if (this.hasTimer) {
      this.timeLeft.set(this.duration());
      this.startTimer();
    }
    // Laisser le temps aux événements Supabase obsolètes de passer avant de réactiver l'effet
    setTimeout(() => { this.resetPending = false; }, 500);
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

  // Hôte : terminer le jeu maintenant → affiche le classement final pour tous
  async onEndGame() {
    await this.multi.endGame();
  }

  // Non-hôte : quitter sans supprimer sa ligne (reste dans le classement final)
  async onHivoaka() {
    await this.multi.leaveGame();
    this.router.navigate(['/']);
  }
}
