import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { Question } from './quiz.service';

// Clé publique (publishable) — sécurisée par les politiques RLS Supabase
const SUPABASE_URL = 'https://skwekmzirbaticuwuzag.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrd2VrbXppcmJhdGljdXd1emFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODA3MTcsImV4cCI6MjA5NzQ1NjcxN30.' +
  '-j65IxHNh309JhqiNV6xTBrdbDJaFKNlcMaqTJK9I-c';

export interface Session {
  id: string;
  code: string;
  host_name: string;
  timer_duration: number;
  questions: Question[];
  current_question: number;
  phase: 'lobby' | 'playing' | 'done';
  created_at: string;
}

export interface Player {
  id: string;
  session_id: string;
  name: string;
  score: number;
  is_host: boolean;
  answered: boolean;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class MultiService {
  readonly client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  session  = signal<Session | null>(null);
  players  = signal<Player[]>([]);
  myPlayerId = signal<string | null>(null);

  private channel: RealtimeChannel | null = null;

  get myPlayer(): Player | undefined {
    return this.players().find(p => p.id === this.myPlayerId());
  }
  get isHost(): boolean { return this.myPlayer?.is_host ?? false; }
  get sortedPlayers(): Player[] {
    return [...this.players()].sort((a, b) => b.score - a.score);
  }

  // ── Création de session (hôte) ──────────────────────────────────────────
  async createSession(
    hostName: string,
    timerDuration: number,
    questions: Question[]
  ): Promise<string> {
    const code = this.generateCode();

    const { data: session, error: sErr } = await this.client
      .from('sessions')
      .insert({ code, host_name: hostName, timer_duration: timerDuration, questions, current_question: 0, phase: 'lobby' })
      .select()
      .single();

    if (sErr) throw new Error(sErr.message);

    const { data: player, error: pErr } = await this.client
      .from('players')
      .insert({ session_id: session.id, name: hostName, is_host: true })
      .select()
      .single();

    if (pErr) throw new Error(pErr.message);

    this.session.set(session);
    this.players.set([player]);
    this.myPlayerId.set(player.id);
    return code;
  }

  // ── Rejoindre une session ───────────────────────────────────────────────
  async joinSession(code: string, playerName: string): Promise<void> {
    const { data: session, error: sErr } = await this.client
      .from('sessions')
      .select()
      .eq('code', code.toUpperCase().trim())
      .in('phase', ['lobby', 'playing'])
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    if (!session) throw new Error('Code tsy hita na session vita sahady');

    const { data: player, error: pErr } = await this.client
      .from('players')
      .insert({ session_id: session.id, name: playerName, is_host: false })
      .select()
      .single();

    if (pErr) throw new Error(pErr.message);

    this.session.set(session);
    this.myPlayerId.set(player.id);
    await this.loadPlayers(session.id);
  }

  // ── Charger les joueurs ─────────────────────────────────────────────────
  async loadPlayers(sessionId: string): Promise<void> {
    const { data } = await this.client
      .from('players')
      .select()
      .eq('session_id', sessionId)
      .order('created_at');
    if (data) this.players.set(data);
  }

  // ── Temps réel ──────────────────────────────────────────────────────────
  subscribe(sessionId: string): void {
    this.unsubscribe();
    this.channel = this.client
      .channel('game-' + sessionId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            this.session.set(null);
          } else {
            // Fusionner pour ne pas écraser les questions si payload.new les omet
            this.session.update(cur =>
              cur ? { ...cur, ...(payload.new as Session) } : (payload.new as Session)
            );
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        async () => { await this.loadPlayers(sessionId); })
      .subscribe();
  }

  unsubscribe(): void {
    if (this.channel) { this.client.removeChannel(this.channel); this.channel = null; }
  }

  // ── Actions de jeu ──────────────────────────────────────────────────────
  async startGame(): Promise<void> {
    const s = this.session();
    if (!s) return;
    await this.client.from('sessions').update({ phase: 'playing', current_question: 0 }).eq('id', s.id);
    await this.client.from('players').update({ answered: false, score: 0 }).eq('session_id', s.id);
    // Mettre à jour le signal local immédiatement (sans attendre l'event Realtime)
    this.session.update(cur => cur ? { ...cur, phase: 'playing', current_question: 0 } : null);
  }

  async submitAnswer(correct: boolean): Promise<void> {
    const pid = this.myPlayerId();
    const me = this.myPlayer;
    if (!pid || !me) return;

    const update: Partial<Player> = { answered: true };
    if (correct) update.score = me.score + 1;

    await this.client.from('players').update(update).eq('id', pid);
    this.players.update(list => list.map(p => p.id === pid ? { ...p, ...update } : p));
  }

  async nextQuestion(): Promise<void> {
    const s = this.session();
    if (!s) return;
    const next = s.current_question + 1;
    if (next >= s.questions.length) {
      await this.client.from('sessions').update({ phase: 'done' }).eq('id', s.id);
    } else {
      await this.client.from('sessions').update({ current_question: next }).eq('id', s.id);
      await this.client.from('players').update({ answered: false }).eq('session_id', s.id);
    }
  }

  async deleteSession(): Promise<void> {
    const s = this.session();
    if (s) await this.client.from('sessions').delete().eq('id', s.id);
    this.cleanup();
  }

  cleanup(): void {
    this.unsubscribe();
    this.session.set(null);
    this.players.set([]);
    this.myPlayerId.set(null);
  }

  private generateCode(): string {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
  }
}
