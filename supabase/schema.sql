-- Rode isso no SQL Editor do Supabase (Project -> SQL Editor -> New query)

create extension if not exists "uuid-ossp";

-- Jogadores da família
create table if not exists players (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  avatar text not null,
  created_at timestamptz not null default now()
);

-- Partidas (populadas automaticamente pelo cron, mas também podem ser
-- cadastradas manualmente se quiser incluir outros jogos além do Brasil)
create table if not exists matches (
  id text primary key,               -- id externo da API (ou manual, ex: 'br-nor')
  team_a text not null,
  team_b text not null,
  match_date timestamptz,
  result_a integer,                  -- null = ainda não jogou / não terminou
  result_b integer,
  status text not null default 'scheduled', -- scheduled | live | final
  updated_at timestamptz not null default now()
);

-- Palpites: uma linha por (partida, jogador). O constraint UNIQUE garante
-- que ninguém consiga apostar duas vezes na mesma partida.
create table if not exists predictions (
  id uuid primary key default uuid_generate_v4(),
  match_id text not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  score_a integer not null,
  score_b integer not null,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

-- Habilita Row Level Security
alter table players enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;

-- Todo mundo (chave anônima) pode LER tudo
create policy "select players" on players for select using (true);
create policy "select matches" on matches for select using (true);
create policy "select predictions" on predictions for select using (true);

-- Todo mundo pode CRIAR jogador e CRIAR palpite (mas não editar/apagar --
-- como não existem policies de update/delete pra chave anônima, o Postgres
-- bloqueia essas operações por padrão)
create policy "insert players" on players for insert with check (true);
create policy "insert predictions" on predictions for insert with check (true);

-- matches só é alterado pelo backend (service role, usado no cron), então
-- nenhuma policy de insert/update é dada à chave anônima aqui de propósito.

-- Realtime: liga a replicação pra essas tabelas atualizarem a tela sozinhas
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table predictions;
alter publication supabase_realtime add table players;
