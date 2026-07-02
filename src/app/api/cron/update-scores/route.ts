import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// IMPORTANTE: esta função busca os jogos do Brasil numa API de futebol externa.
// Deixei pronta pra football-data.org (tem plano grátis), mas os nomes de
// endpoint/competição podem mudar -- confira em https://www.football-data.org/documentation/quickstart
// antes de confiar 100%. Se preferir outra API (API-Football, Sportradar etc),
// troque só o corpo desta função -- o resto do projeto não muda.
// ---------------------------------------------------------------------------
async function fetchBrazilMatches() {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_API_KEY não configurada");

  // Código 'WC' = Copa do Mundo FIFA na football-data.org.
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": apiKey },
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Falha ao consultar API de futebol: ${res.status}`);
  }

  const data = await res.json();

  const brazilMatches = (data.matches || []).filter(
    (m: any) =>
      m.homeTeam?.name?.includes("Brazil") || m.awayTeam?.name?.includes("Brazil")
  );

  return brazilMatches.map((m: any) => ({
    id: `br-${m.id}`,
    team_a: translateTeam(m.homeTeam?.name),
    team_b: translateTeam(m.awayTeam?.name),
    match_date: m.utcDate,
    result_a: m.score?.fullTime?.home ?? null,
    result_b: m.score?.fullTime?.away ?? null,
    status: mapStatus(m.status)
  }));
}

function mapStatus(apiStatus: string): "scheduled" | "live" | "final" {
  if (["FINISHED", "AWARDED"].includes(apiStatus)) return "final";
  if (["IN_PLAY", "PAUSED"].includes(apiStatus)) return "live";
  return "scheduled";
}

// Tradução simples pra exibir em português na tela. Adicione mais conforme
// os adversários do Brasil forem sendo definidos no chaveamento.
const TEAM_NAMES: Record<string, string> = {
  Brazil: "Brasil",
  Morocco: "Marrocos",
  Haiti: "Haiti",
  Scotland: "Escócia",
  Japan: "Japão",
  Norway: "Noruega"
};
function translateTeam(name: string) {
  return TEAM_NAMES[name] ?? name;
}

export async function GET(req: NextRequest) {
  // Protege a rota: só roda se o segredo bater (o Cron da Vercel manda esse
  // header sozinho quando CRON_SECRET está configurado no projeto; pra chamar
  // na mão em dia de jogo, use ?secret=SEU_CRON_SECRET na URL).
  const authHeader = req.headers.get("authorization");
  const secretParam = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  const authorized =
    authHeader === `Bearer ${expected}` || secretParam === expected;

  if (!authorized) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  try {
    const matches = await fetchBrazilMatches();

    if (matches.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: "nenhum jogo encontrado" });
    }

    const { error } = await supabaseAdmin.from("matches").upsert(matches, { onConflict: "id" });

    if (error) throw error;

    return NextResponse.json({ ok: true, updated: matches.length });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
