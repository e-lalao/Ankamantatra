import { Component, OnInit, OnDestroy, inject, effect } from '@angular/core';
import { Router } from '@angular/router';
import { MultiService } from '../../multi.service';
import { AudioService } from '../../audio.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css',
})
export class Lobby implements OnInit, OnDestroy {
  private router = inject(Router);
  multi  = inject(MultiService);
  audio  = inject(AudioService);

  copied = false;

  constructor() {
    // Navigate to game when host starts
    effect(() => {
      const s = this.multi.session();
      if (s?.phase === 'playing') this.router.navigate(['/multi-jeu']);
      if (s === null) this.router.navigate(['/']);       // session supprimée
    });
  }

  ngOnInit() {
    const s = this.multi.session();
    if (!s) { this.router.navigate(['/multi']); return; }
    this.multi.subscribe(s.id);
    this.multi.loadPlayers(s.id);
  }

  ngOnDestroy() {
    // Ne pas unsubscribe ici — multi-game a besoin du channel
  }

  get isHost()  { return this.multi.isHost; }
  get code()    { return this.multi.session()?.code ?? ''; }
  get players() { return this.multi.players(); }

  async startGame() {
    await this.multi.startGame();
  }

  async copyCode() {
    await navigator.clipboard.writeText(this.code);
    this.copied = true;
    setTimeout(() => this.copied = false, 2000);
  }

  async leave() {
    if (this.isHost) {
      await this.multi.deleteSession();
    } else {
      const pid = this.multi.myPlayerId();
      if (pid) await this.multi.client.from('players').delete().eq('id', pid);
      this.multi.cleanup();
    }
    this.router.navigate(['/']);
  }
}
