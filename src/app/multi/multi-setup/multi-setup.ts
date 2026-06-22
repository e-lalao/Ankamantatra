import { Component, signal, inject, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MultiService } from '../../multi.service';
import { QuizService } from '../../quiz.service';
import { GameStateService } from '../../game-state.service';
import { AudioService } from '../../audio.service';

type Mode = 'choose' | 'create' | 'join';

@Component({
  selector: 'app-multi-setup',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './multi-setup.html',
  styleUrl: './multi-setup.css',
})
export class MultiSetup {
  private router      = inject(Router);
  private multi       = inject(MultiService);
  private quiz        = inject(QuizService);
  private gameState   = inject(GameStateService);
  audio               = inject(AudioService);

  mode       = signal<Mode>('choose');
  playerName = signal('');
  joinCode   = signal('');
  loading    = signal(false);
  error      = signal('');
  duration   = signal(30);
  difficulty = signal<1 | 2>(1);

  readonly durations = [15, 30, 60, 90, 120, 0];

  setName(e: Event)     { this.playerName.set((e.target as HTMLInputElement).value); }
  setCode(e: Event)     { this.joinCode.set((e.target as HTMLInputElement).value.toUpperCase()); }
  setDuration(d: number){ this.duration.set(d); this.gameState.timerDuration.set(d); }

  goCreate() { this.mode.set('create'); this.error.set(''); }
  goJoin()   { this.mode.set('join');   this.error.set(''); }
  goBack()   { this.mode.set('choose'); this.error.set(''); }

  async create() {
    if (!this.playerName().trim()) { this.error.set('Ny anaranao azafady!'); return; }
    this.loading.set(true);
    this.error.set('');
    try {
      const all = await firstValueFrom(this.quiz.fetchQuestions());
      if (!all?.length) throw new Error('Tsy hita ny fanontaniana');
      const filtered = this.quiz.filterByDifficulty(all, this.difficulty());
      if (!filtered.length) throw new Error('Tsy misy fanontaniana amin\'ity haingana ity');
      const shuffled = this.quiz.shuffle(filtered);
      await this.multi.createSession(this.playerName().trim(), this.duration(), shuffled);
      this.router.navigate(['/lobby']);
    } catch (e: any) {
      this.error.set(e.message ?? 'Misy olana, avereno indray');
    } finally {
      this.loading.set(false);
    }
  }

  async join() {
    if (!this.playerName().trim()) { this.error.set('Ny anaranao azafady!'); return; }
    if (!this.joinCode().trim())   { this.error.set('Ny teny miafina azafady!');    return; }
    this.loading.set(true);
    this.error.set('');
    try {
      await this.multi.joinSession(this.joinCode(), this.playerName().trim());
      this.router.navigate(['/lobby']);
    } catch (e: any) {
      this.error.set(e.message ?? 'Teny miafina diso na tapitra ny kilalao');
    } finally {
      this.loading.set(false);
    }
  }

  durationLabel(d: number): string {
    if (d === 0)   return '∞';
    if (d >= 60)   return d / 60 + 'min';
    return d + 's';
  }
}
