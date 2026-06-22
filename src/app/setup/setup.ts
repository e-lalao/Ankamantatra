import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgClass } from '@angular/common';
import { GameStateService } from '../game-state.service';

@Component({
  selector: 'app-setup',
  imports: [RouterLink, NgClass],
  templateUrl: './setup.html',
  styleUrl: './setup.css'
})
export class Setup {
  private router    = inject(Router);
  private gameState = inject(GameStateService);

  step       = signal<'difficulty' | 'timer'>('difficulty');
  difficulty = signal<1 | 2>(1);
  durations  = [15, 30, 60, 90, 120, 0];
  selected   = signal(30);

  selectDifficulty(d: 1 | 2) {
    this.difficulty.set(d);
    this.gameState.difficulty.set(d);
    this.step.set('timer');
  }

  select(d: number) { this.selected.set(d); }

  start() {
    this.gameState.timerDuration.set(this.selected());
    this.router.navigate(['/jeu']);
  }
}
