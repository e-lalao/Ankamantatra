import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { AudioService } from '../audio.service';
import { MultiService } from '../multi.service';

type Lang = 'mg' | 'fr' | 'en';

const T = {
  mg: {
    gameTitle:    'Ny Ankamantatra',
    gameText:     'Ny ankamantatra dia kilalao malgasy, natao ho an\'ny daholobe. Nanodidina ny afo hariva, na rehefa mivory ny ankizy marobe, no nifankalozana ankamantatra — fomba fanabeazana sy famolavolana ny saina fahiny. Ny ankamantatra ao amin\'ity lalao ity dia voaangona avy amin\'ny boky sy ny lovan-tsofina nentim-paharazana.Ahitana ankamantatra vaovao vao nofonin\'ny ankehitriny ihany koa.',
    aboutTitle:   'Momba ny e-lalao',
    aboutText:    'Ny e-lalao dia tetikasa miezaka hanandratana ny fiteny sy ny kolontsaina malgasy amin\'ny alalan\'ny teknolojia maoderina. Misokatra ho an\'ny fiaraha-miasa, ny torohevitra ary ny famatsiana rehetra izahay. Ny hevitrao dia sarobidy aminay — aza misalasala mifandraisa raha misy tianao zaraina.',
    contactBtn:   'Mifandraisa aminay',
    contactLabel: 'Alefaso ny hevitrao',
    footerLine:   'Natao tamin\'ny fitiavana ho an\'ny kolontsaina malgasy',
  },
  fr: {
    gameTitle:    "L'Ankamantatra",
    gameText:     "L'ankamantatra est un jeu malgache pour tous, petits et grands. Autour du feu le soir, ou lorsque les enfants se retrouvaient en nombre, on s'échangeait des ankamantatra — une façon d'éduquer et de forger l'esprit d'antan. Les devinettes de ce jeu sont collectées dans des livres et puisées dans la tradition orale ancestrale. On y trouve également des ankamantatra nouveaux, tout juste composés par la génération actuelle.",
    aboutTitle:   'À propos d\'e-lalao',
    aboutText:    "e-lalao est un projet dédié à la valorisation de la langue et de la culture malgaches à travers la technologie moderne. Nous sommes ouverts à toute collaboration, conseil ou soutien. Vos idées nous sont précieuses — n'hésitez pas à nous écrire.",
    contactBtn:   'Nous contacter',
    contactLabel: 'Envoyez-nous vos idées et suggestions',
    footerLine:   'Fait avec amour pour la culture malgache',
  },
  en: {
    gameTitle:    'Ankamantatra',
    gameText:     'Ankamantatra is a Malagasy game, open to everyone. Around the evening fire, or whenever children gathered in numbers, riddles were exchanged — a way of educating and shaping the minds of old. The riddles in this game are collected from books and drawn from ancestral oral tradition. New riddles freshly composed by today\'s generation are also featured.',
    aboutTitle:   'About e-lalao',
    aboutText:    'e-lalao is a project dedicated to promoting the Malagasy language and culture through modern technology. We are open to all collaborations, advice and support. Your ideas matter to us — feel free to reach out.',
    contactBtn:   'Contact us',
    contactLabel: 'Send us your ideas and feedback',
    footerLine:   'Made with love for Malagasy culture',
  },
} as const;

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit, OnDestroy {
  private router = inject(Router);
  private multi  = inject(MultiService);
  audio          = inject(AudioService);

  imageAnim    = signal(false);
  lang         = signal<Lang>('mg');
  t            = computed(() => T[this.lang()]);
  visitorCount = signal<number | null>(null);
  started      = signal(false);

  readonly email = 'fanomezanasarobidy2003@gmail.com';
  readonly year  = new Date().getFullYear();

  async ngOnInit() {
    const { data } = await this.multi.client.rpc('increment_visitors');
    if (data != null) this.visitorCount.set(data as number);
  }
  ngOnDestroy() {}

  onStart() {
    this.started.set(true);
    this.audio.playBgMusic();
  }

  onHilalao() {
    this.audio.play('woueh');
    this.imageAnim.set(true);
    setTimeout(() => this.router.navigate(['/setup']), 750);
  }

  onMulti() {
    this.audio.play('woueh');
    this.router.navigate(['/multi']);
  }

  scrollToAbout() {
    document.getElementById('apropos')?.scrollIntoView({ behavior: 'smooth' });
  }

  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
