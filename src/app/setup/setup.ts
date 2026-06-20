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
  private router = inject(Router);
  private gameState = inject(GameStateService);

  // 0 = sans chrono
  durations = [15, 30, 60, 90, 120, 0];
  selected = signal(30);

  select(d: number) { this.selected.set(d); }

  start() {
    this.gameState.timerDuration.set(this.selected());
    this.router.navigate(['/jeu']);
  }
}
