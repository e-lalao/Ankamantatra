import { Routes } from '@angular/router';
import { Home }       from './home/home';
import { Setup }      from './setup/setup';
import { Game }       from './game/game';
import { MultiSetup } from './multi/multi-setup/multi-setup';
import { Lobby }      from './multi/lobby/lobby';
import { MultiGame }  from './multi/multi-game/multi-game';

export const routes: Routes = [
  { path: '',          component: Home },
  { path: 'setup',     component: Setup },
  { path: 'jeu',       component: Game },
  { path: 'multi',     component: MultiSetup },
  { path: 'lobby',     component: Lobby },
  { path: 'multi-jeu', component: MultiGame },
  { path: '**',        redirectTo: '' },
];
