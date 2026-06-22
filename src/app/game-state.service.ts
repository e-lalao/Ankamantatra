import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  timerDuration = signal(30);
  difficulty    = signal<1 | 2>(1);
}
