-- ============================================================
-- Ankamantatra – Schema Supabase Multiplayer
-- Coller ce SQL dans : Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Table sessions
CREATE TABLE IF NOT EXISTS sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,
  host_name        TEXT NOT NULL,
  timer_duration   INTEGER NOT NULL DEFAULT 30,
  questions        JSONB NOT NULL DEFAULT '[]',
  current_question INTEGER NOT NULL DEFAULT 0,
  phase            TEXT NOT NULL DEFAULT 'lobby'
                   CHECK (phase IN ('lobby', 'playing', 'done')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Table players
CREATE TABLE IF NOT EXISTS players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0,
  is_host     BOOLEAN NOT NULL DEFAULT FALSE,
  answered    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Sécurité : activer RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE players  ENABLE ROW LEVEL SECURITY;

-- Politiques RLS : accès total pour les utilisateurs anonymes (clé publique)
CREATE POLICY "anon_sessions" ON sessions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_players"  ON players  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Realtime : publier les deux tables
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- Nettoyage automatique : supprime les sessions de plus de 24h
CREATE OR REPLACE FUNCTION delete_old_sessions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '24 hours';
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER cleanup_old_sessions
  AFTER INSERT ON sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION delete_old_sessions();
