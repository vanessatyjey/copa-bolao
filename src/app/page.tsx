"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { computePoints, Match, Prediction } from "../lib/scoring";

const STORAGE_KEY = "bolao_player";

type Player = {
  id: string;
  name: string;
  avatar: string | null;
  avatar_url: string | null;
};

type View = "identify" | "bets" | "live";

type LeaderboardItem = {
  id: string;
  name: string;
  avatar_url: string | null;
  pts: number;
};

export default function Page() {
  const [view, setView] = useState<View>("identify");
  const [player, setPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoreDrafts, setScoreDrafts] = useState<
    Record<string, { a: string; b: string }>
  >({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      try {
        const p = JSON.parse(saved) as Player;
        setPlayer(p);
        setView("bets");
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    loadAll();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("bolao-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        loadMatches
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "predictions" },
        loadPredictions
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        loadPlayers
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadAll() {
    setLoading(true);

    await Promise.all([loadPlayers(), loadMatches(), loadPredictions()]);

    setLoading(false);
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from("players")
      .select("*")
      .order("created_at");

    setPlayers((data as Player[]) || []);
  }

  async function loadMatches() {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .order("match_date");

    setMatches((data as Match[]) || []);
  }

  async function loadPredictions() {
    const { data } = await supabase.from("predictions").select("*");

    setPredictions((data as Prediction[]) || []);
  }

  function pickPlayer(p: Player) {
    setPlayer(p);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    setView("bets");
  }

  function switchPlayer() {
    setPlayer(null);
    localStorage.removeItem(STORAGE_KEY);
    setView("identify");
  }

  async function submitPrediction(matchId: string) {
    if (!player) return;

    const draft = scoreDrafts[matchId];

    if (!draft || draft.a === "" || draft.b === "") {
      setErrorMsg("Preenche o placar dos dois times antes de confirmar.");
      return;
    }

    const scoreA = Number(draft.a);
    const scoreB = Number(draft.b);

    if (
      !Number.isInteger(scoreA) ||
      !Number.isInteger(scoreB) ||
      scoreA < 0 ||
      scoreB < 0
    ) {
      setErrorMsg("Coloca um placar válido.");
      return;
    }

    const { error } = await supabase.from("predictions").insert({
      match_id: matchId,
      player_id: player.id,
      score_a: scoreA,
      score_b: scoreB,
    });

    if (error) {
      setErrorMsg(
        "Esse palpite não foi salvo. Talvez você já tenha apostado nessa partida."
      );
      return;
    }

    setScoreDrafts((old) => {
      const copy = { ...old };
      delete copy[matchId];
      return copy;
    });

    await loadPredictions();
  }

  const nextMatch = useMemo(() => {
    const futureMatches = matches
      .filter((m) => {
        if (!m.match_date) return false;
        if (m.result_a !== null || m.result_b !== null) return false;
        return new Date(m.match_date).getTime() > now.getTime();
      })
      .sort(
        (a, b) =>
          new Date(a.match_date!).getTime() -
          new Date(b.match_date!).getTime()
      );

    return futureMatches[0] || null;
  }, [matches, now]);

  const leaderboard = useMemo<LeaderboardItem[]>(() => {
    const totals: Record<string, LeaderboardItem> = {};

    matches.forEach((m) => {
      if (m.result_a === null || m.result_b === null) return;

      predictions
        .filter((p) => p.match_id === m.id)
        .forEach((p) => {
          const pts = computePoints(p, m) ?? 0;
          const pl = players.find((x) => x.id === p.player_id);

          if (!pl) return;

          if (!totals[pl.id]) {
            totals[pl.id] = {
              id: pl.id,
              name: pl.name,
              avatar_url: pl.avatar_url,
              pts: 0,
            };
          }

          totals[pl.id].pts += pts;
        });
    });

    return Object.values(totals).sort((a, b) => b.pts - a.pts);
  }, [matches, predictions, players]);

  function fmtDate(iso: string | null) {
    if (!iso) return "Data a combinar";

    return new Date(iso).toLocaleString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function countdownParts(iso: string | null) {
    if (!iso) {
      return {
        expired: false,
        days: "00",
        hours: "00",
        minutes: "00",
        seconds: "00",
      };
    }

    const diff = new Date(iso).getTime() - now.getTime();

    if (diff <= 0) {
      return {
        expired: true,
        days: "00",
        hours: "00",
        minutes: "00",
        seconds: "00",
      };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      expired: false,
      days: String(days).padStart(2, "0"),
      hours: String(hours).padStart(2, "0"),
      minutes: String(minutes).padStart(2, "0"),
      seconds: String(seconds).padStart(2, "0"),
    };
  }

  function getFlagCode(team: string) {
    const name = team.toLowerCase();

    if (name.includes("brasil")) return "br";
    if (name.includes("noruega")) return "no";
    if (name.includes("japão") || name.includes("japao")) return "jp";
    if (name.includes("marrocos")) return "ma";
    if (name.includes("haiti")) return "ht";
    if (name.includes("argentina")) return "ar";
    if (name.includes("frança") || name.includes("franca")) return "fr";
    if (name.includes("alemanha")) return "de";
    if (name.includes("portugal")) return "pt";
    if (name.includes("espanha")) return "es";

    return null;
  }

  function Flag({ team }: { team: string }) {
    const code = getFlagCode(team);

    if (!code) {
      return <div className="text-5xl mb-1">🏳️</div>;
    }

    return (
      <img
        src={`https://flagcdn.com/w160/${code}.png`}
        alt={team}
        className="w-16 h-11 object-cover rounded-md mx-auto mb-2 shadow-lg border border-white/20"
      />
    );
  }
  function PlayerPhoto({
    player,
    size = 40,
  }: {
    player: { name: string; avatar_url: string | null };
    size?: number;
  }) {
    if (player.avatar_url) {
      return (
        <img
          src={player.avatar_url}
          alt={player.name}
          className="rounded-full object-cover border-2 border-gold shadow-lg shadow-black/20 shrink-0"
          style={{ width: size, height: size }}
        />
      );
    }

    return (
      <div
        className="rounded-full bg-gold/15 border-2 border-gold flex items-center justify-center text-gold font-bold shrink-0"
        style={{ width: size, height: size }}
      >
        {player.name.charAt(0).toUpperCase()}
      </div>
    );
  }

  function CountdownPanel({ match }: { match: Match | null }) {
    if (!match) {
      return (
        <div className="bg-bgpanel border border-white/10 rounded-2xl p-5 text-center font-body">
          <div className="text-xs uppercase tracking-[3px] text-inkdim font-mono">
            próximo jogo
          </div>
          <div className="text-gold font-display text-2xl uppercase mt-2">
            Aguardando partida
          </div>
        </div>
      );
    }

    const parts = countdownParts(match.match_date);

    return (
      <div className="bg-gradient-to-b from-bgpanel to-bgpanel2 border border-gold/30 rounded-2xl p-5 mb-5 shadow-xl shadow-black/20 font-body">
        <div className="text-center">
          <div className="text-xs uppercase tracking-[3px] text-gold font-mono">
            próximo jogo
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-4">
            <div className="text-center">
              <Flag team={match.team_a} />
              <div className="font-display uppercase text-xl leading-none">
                {match.team_a}
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="text-golddim font-mono text-xs uppercase mb-1">
                versus
              </div>
              <div className="w-12 h-12 rounded-full bg-gold text-bgdeep flex items-center justify-center font-display text-xl shadow-lg shadow-gold/20">
                VS
              </div>
            </div>

            <div className="text-center">
              <Flag team={match.team_b} />
              <div className="font-display uppercase text-xl leading-none">
                {match.team_b}
              </div>
            </div>
          </div>

          <div className="text-inkdim text-xs font-mono mt-4">
            {fmtDate(match.match_date)}
          </div>

          {parts.expired ? (
            <div className="mt-4 text-greenbright font-mono font-bold">
              O jogo já começou
            </div>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-[3px] text-inkdim font-mono mt-5 mb-2">
                começa em
              </div>

              <div className="grid grid-cols-4 gap-2">
                <TimeBox value={parts.days} label="dias" />
                <TimeBox value={parts.hours} label="horas" />
                <TimeBox value={parts.minutes} label="min" />
                <TimeBox value={parts.seconds} label="seg" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  function TimeBox({ value, label }: { value: string; label: string }) {
    return (
      <div className="bg-[#0A2419] border border-gold/30 rounded-xl py-3">
        <div className="font-mono text-2xl font-bold text-gold leading-none">
          {value}
        </div>
        <div className="font-mono text-[10px] uppercase text-inkdim mt-1">
          {label}
        </div>
      </div>
    );
  }

  function PredictionProgress({ matchId }: { matchId: string }) {
    const totalPlayers = players.length;
    const totalPredictions = predictions.filter((p) => p.match_id === matchId).length;
    const percent =
      totalPlayers === 0 ? 0 : Math.round((totalPredictions / totalPlayers) * 100);

    return (
      <div className="mt-4 bg-[#0A2419]/60 border border-white/10 rounded-xl p-3">
        <div className="flex justify-between text-xs font-mono text-inkdim mb-2">
          <span>Palpites enviados</span>
          <span>
            {totalPredictions}/{totalPlayers}
          </span>
        </div>

        <div className="h-2 bg-black/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  function MissingPlayers({ matchId }: { matchId: string }) {
    const predictedIds = new Set(
      predictions.filter((p) => p.match_id === matchId).map((p) => p.player_id)
    );

    const missing = players.filter((p) => !predictedIds.has(p.id));

    if (missing.length === 0) {
      return (
        <div className="mt-3 text-center text-greenbright text-xs font-mono">
          Todo mundo já apostou nessa partida ✅
        </div>
      );
    }

    return (
      <div className="mt-3 bg-black/10 border border-white/10 rounded-xl p-3">
        <div className="text-xs uppercase tracking-wide text-inkdim font-mono mb-2">
          Ainda não apostaram
        </div>

        <div className="flex flex-wrap gap-2">
          {missing.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 bg-[#0A2419]/70 rounded-full px-2 py-1 text-xs text-inkdim"
            >
              <PlayerPhoto player={p} size={22} />
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function PredictionStats({ matchId }: { matchId: string }) {
    const matchPredictions = predictions.filter((p) => p.match_id === matchId);

    if (matchPredictions.length === 0) return null;

    const grouped: Record<string, number> = {};
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;

    matchPredictions.forEach((p) => {
      const key = `${p.score_a} x ${p.score_b}`;
      grouped[key] = (grouped[key] || 0) + 1;

      const sign = Math.sign(p.score_a - p.score_b);
      if (sign > 0) homeWins++;
      else if (sign < 0) awayWins++;
      else draws++;
    });

    const scoreStats = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
    const max = scoreStats[0]?.[1] || 1;

    return (
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="text-xs uppercase tracking-wide text-inkdim font-mono mb-3">
          Estatísticas dos palpites
        </div>

        <div className="space-y-2 mb-4">
          {scoreStats.slice(0, 4).map(([score, count]) => (
            <div key={score}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-mono text-gold">{score}</span>
                <span className="text-inkdim">
                  {count} pessoa{count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <ResultBox label="Casa" value={homeWins} />
          <ResultBox label="Empate" value={draws} />
          <ResultBox label="Fora" value={awayWins} />
        </div>
      </div>
    );
  }

  function ResultBox({ label, value }: { label: string; value: number }) {
    return (
      <div className="bg-[#0A2419]/70 border border-white/10 rounded-lg p-2">
        <div className="text-gold font-mono font-bold">{value}</div>
        <div className="text-[10px] uppercase text-inkdim font-mono">
          {label}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-inkdim font-body">
        Carregando o campo...
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 pb-10">
      <header className="relative text-center pt-9 pb-7 overflow-hidden">
        <div
          className="glow-pulse absolute -top-28 left-1/2 -translate-x-1/2 w-[520px] h-[320px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(242,193,78,0.35) 0%, rgba(242,193,78,0) 70%)",
          }}
        />

        <div className="relative font-mono text-xs tracking-[3px] text-gold uppercase">
          bolão da família ⚽
        </div>

        <h1
          className="relative font-display text-4xl uppercase mt-1"
          style={{ textShadow: "0 0 24px rgba(242,193,78,0.35)" }}
        >
          Copa do Mundo
        </h1>

        <div className="relative text-inkdim text-sm font-body">
          Palpite dado é placar contado. Sem editar, sem apagar.
        </div>
      </header>

      <CountdownPanel match={nextMatch} />
      {player && (
        <div className="flex gap-2 justify-center flex-wrap mb-6 font-body">
          {(["bets", "live"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`font-mono text-xs tracking-wide uppercase px-4 py-2 rounded-lg border ${view === id
                ? "bg-gold text-bgdeep border-gold font-bold"
                : "border-white/10 text-inkdim hover:border-golddim"
                }`}
            >
              {id === "bets" ? "Palpites" : "Ao Vivo"}
            </button>
          ))}

          <button
            onClick={switchPlayer}
            className="font-mono text-xs uppercase px-4 py-2 rounded-lg border border-white/10 text-inkdim hover:border-golddim"
          >
            Trocar ({player.name})
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-redcard/10 border border-redcard/40 text-redcard text-sm rounded-lg p-3 mb-4 font-body">
          {errorMsg}{" "}
          <button className="underline" onClick={() => setErrorMsg(null)}>
            fechar
          </button>
        </div>
      )}

      {view === "identify" && (
        <div className="bg-bgpanel border border-white/10 rounded-2xl p-5 font-body">
          <div className="font-display text-xl uppercase text-gold mb-3">
            Quem é você?
          </div>

          <div className="text-xs text-inkdim mb-4">
            Escolha seu nome para entrar no bolão.
          </div>

          {players.length === 0 ? (
            <div className="text-center text-inkdim text-sm py-8">
              Nenhum participante cadastrado ainda.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {players.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickPlayer(p)}
                  className="flex items-center gap-3 bg-bgpanel2 border border-white/10 hover:border-gold px-3 py-3 rounded-xl text-sm text-left"
                >
                  <PlayerPhoto player={p} size={42} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "bets" && player && (
        <div className="font-body">
          <div className="flex items-center gap-3 bg-gold/10 border border-golddim rounded-xl px-4 py-2.5 mb-4 text-sm">
            <PlayerPhoto player={player} size={38} />
            <span>
              Apostando como <b className="text-gold">{player.name}</b>
            </span>
          </div>

          {matches.length === 0 && (
            <div className="bg-bgpanel border border-white/10 rounded-2xl p-8 text-center text-inkdim text-sm">
              <span className="block text-4xl mb-2">🥅</span>
              Nenhuma partida cadastrada ainda.
            </div>
          )}

          {matches.map((m) => {
            const myPred = predictions.find(
              (p) => p.match_id === m.id && p.player_id === player.id
            );

            const hasResult = m.result_a !== null && m.result_b !== null;
            const matchPredictions = predictions.filter(
              (p) => p.match_id === m.id
            );

            return (
              <div
                key={m.id}
                className="bg-bgpanel2 border border-white/10 rounded-2xl p-4 mb-4 shadow-lg shadow-black/10"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span
                    className={`inline-block text-[10px] font-mono uppercase tracking-wide px-2 py-1 rounded-full ${hasResult
                      ? "bg-greenbright/15 text-greenbright"
                      : "bg-gold/15 text-gold"
                      }`}
                  >
                    {hasResult ? "Encerrado" : "Aberto pra palpite"}
                  </span>

                  <span className="text-[10px] uppercase text-inkdim font-mono">
                    {fmtDate(m.match_date)}
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-3">
                  <div className="text-center">
                    <Flag team={m.team_a} />
                    <div className="font-display text-xl uppercase leading-none mt-1">
                      {m.team_a}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-golddim text-xs font-mono uppercase">
                      vs
                    </div>
                    <div className="text-gold font-display text-xl">
                      {hasResult ? `${m.result_a} x ${m.result_b}` : "x"}
                    </div>
                  </div>

                  <div className="text-center">
                    <Flag team={m.team_b} />
                    <div className="font-display text-xl uppercase leading-none mt-1">
                      {m.team_b}
                    </div>
                  </div>
                </div>

                {!hasResult && (
                  <div className="text-center mb-3">
                    <div className="text-[10px] uppercase tracking-widest text-inkdim font-mono">
                      começa em
                    </div>

                    <div className="inline-block mt-1 bg-[#0A2419] border border-gold/40 rounded-lg px-3 py-1.5 text-gold font-mono font-bold">
                      {(() => {
                        const parts = countdownParts(m.match_date);
                        return parts.expired
                          ? "O jogo já começou"
                          : `${parts.days}d ${parts.hours}h ${parts.minutes}m ${parts.seconds}s`;
                      })()}
                    </div>
                  </div>
                )}

                {myPred ? (
                  <div className="flex items-center justify-center gap-2 bg-greenbright/10 border border-dashed border-greenbright/40 rounded-lg py-2.5 text-greenbright text-sm">
                    🔒 Seu palpite:{" "}
                    <span className="font-mono font-bold text-base">
                      {myPred.score_a} x {myPred.score_b}
                    </span>
                  </div>
                ) : hasResult ? (
                  <div className="text-center text-inkdim text-xs font-mono">
                    Essa partida já foi encerrada — não deu tempo de apostar 😅
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <div className="w-[58px] h-[62px] bg-[#0A2419] border-2 border-golddim rounded-xl flex items-center justify-center">
                        <input
                          className="w-full text-center bg-transparent font-mono font-bold text-3xl text-gold outline-none"
                          inputMode="numeric"
                          maxLength={2}
                          value={scoreDrafts[m.id]?.a ?? ""}
                          onChange={(e) =>
                            setScoreDrafts((d) => ({
                              ...d,
                              [m.id]: {
                                a: e.target.value.replace(/\D/g, ""),
                                b: d[m.id]?.b ?? "",
                              },
                            }))
                          }
                        />
                      </div>

                      <span className="font-display text-inkdim text-xl">x</span>

                      <div className="w-[58px] h-[62px] bg-[#0A2419] border-2 border-golddim rounded-xl flex items-center justify-center">
                        <input
                          className="w-full text-center bg-transparent font-mono font-bold text-3xl text-gold outline-none"
                          inputMode="numeric"
                          maxLength={2}
                          value={scoreDrafts[m.id]?.b ?? ""}
                          onChange={(e) =>
                            setScoreDrafts((d) => ({
                              ...d,
                              [m.id]: {
                                a: d[m.id]?.a ?? "",
                                b: e.target.value.replace(/\D/g, ""),
                              },
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="text-center">
                      <button
                        onClick={() => submitPrediction(m.id)}
                        className="bg-gold hover:bg-[#ffd875] text-bgdeep font-bold px-5 py-2.5 rounded-lg text-sm shadow-lg shadow-gold/10"
                      >
                        Confirmar palpite
                      </button>
                    </div>

                    <div className="text-center text-inkdim text-xs mt-2">
                      Depois de confirmar, não dá mais pra mudar. Capricha! 😄
                    </div>
                  </>
                )}

                <PredictionProgress matchId={m.id} />
                <MissingPlayers matchId={m.id} />

                {matchPredictions.length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="text-xs uppercase tracking-wide text-inkdim font-mono mb-2">
                      Palpites da família
                    </div>

                    <div className="space-y-2">
                      {matchPredictions.map((p) => {
                        const pl = players.find((x) => x.id === p.player_id);

                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between bg-[#0A2419]/60 border border-white/10 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              {pl && <PlayerPhoto player={pl} size={28} />}
                              <span className="text-sm">
                                {pl?.name ?? "Participante"}
                              </span>
                            </div>

                            <div className="font-mono font-bold text-gold">
                              {p.score_a} x {p.score_b}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <PredictionStats matchId={m.id} />
              </div>
            );
          })}
        </div>
      )}
      {view === "live" && (
        <div className="font-body">
          {matches.map((m) => {
            const preds = predictions.filter((p) => p.match_id === m.id);
            const hasResult = m.result_a !== null && m.result_b !== null;

            return (
              <div
                key={m.id}
                className="bg-bgpanel2 border border-white/10 rounded-2xl p-4 mb-4 shadow-lg shadow-black/10"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span
                    className={`inline-block text-[10px] font-mono uppercase tracking-wide px-2 py-1 rounded-full ${
                      hasResult
                        ? "bg-greenbright/15 text-greenbright"
                        : "bg-gold/15 text-gold"
                    }`}
                  >
                    {hasResult ? "Resultado final" : "Aguardando resultado"}
                  </span>

                  <span className="text-[10px] uppercase text-inkdim font-mono">
                    {fmtDate(m.match_date)}
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-3">
                  <div className="text-center">
                    <Flag team={m.team_a} />
                    <div className="font-display text-xl uppercase leading-none mt-1">
                      {m.team_a}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-golddim text-xs font-mono uppercase">
                      placar
                    </div>
                    <div className="text-gold font-display text-2xl">
                      {hasResult ? `${m.result_a} x ${m.result_b}` : "— x —"}
                    </div>
                  </div>

                  <div className="text-center">
                    <Flag team={m.team_b} />
                    <div className="font-display text-xl uppercase leading-none mt-1">
                      {m.team_b}
                    </div>
                  </div>
                </div>

                {!hasResult && (
                  <div className="text-center mb-3">
                    <div className="text-[10px] uppercase tracking-widest text-inkdim font-mono">
                      começa em
                    </div>

                    <div className="inline-block mt-1 bg-[#0A2419] border border-gold/40 rounded-lg px-3 py-1.5 text-gold font-mono font-bold">
                      {(() => {
                        const parts = countdownParts(m.match_date);
                        return parts.expired
                          ? "O jogo já começou"
                          : `${parts.days}d ${parts.hours}h ${parts.minutes}m ${parts.seconds}s`;
                      })()}
                    </div>
                  </div>
                )}

                <PredictionProgress matchId={m.id} />

                {preds.length > 0 ? (
                  <table className="w-full text-sm mt-4">
                    <thead>
                      <tr className="text-inkdim text-[11px] uppercase tracking-wide">
                        <th className="text-left py-1.5 border-b border-white/10">
                          Quem
                        </th>
                        <th className="text-left py-1.5 border-b border-white/10">
                          Palpite
                        </th>
                        <th className="text-left py-1.5 border-b border-white/10">
                          Pontos
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {preds.map((p) => {
                        const pl = players.find((x) => x.id === p.player_id);
                        const pts = computePoints(p, m);

                        return (
                          <tr key={p.id} className="border-b border-white/5">
                            <td className="py-2">
                              {pl ? (
                                <div className="flex items-center gap-2">
                                  <PlayerPhoto player={pl} size={30} />
                                  <span>{pl.name}</span>
                                </div>
                              ) : (
                                "Participante"
                              )}
                            </td>

                            <td className="py-2">
                              {p.score_a} x {p.score_b}
                            </td>

                            <td
                              className={`py-2 font-mono font-bold ${
                                pts === 3
                                  ? "text-greenbright"
                                  : pts === 1
                                  ? "text-gold"
                                  : "text-inkdim"
                              }`}
                            >
                              {pts === null
                                ? "—"
                                : `${pts} pt${pts === 1 ? "" : "s"}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center text-inkdim text-xs mt-3">
                    Ninguém palpitou essa aqui ainda.
                  </div>
                )}

                <PredictionStats matchId={m.id} />
              </div>
            );
          })}

          <div className="bg-bgpanel border border-white/10 rounded-2xl p-5 mt-4">
            <div className="font-display text-xl uppercase text-gold mb-4">
              🏆 Classificação
            </div>

            {leaderboard.length === 0 ? (
              <div className="text-inkdim text-sm text-center">
                Assim que o primeiro resultado real entrar, o ranking aparece aqui.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 items-end mb-5">
                  {leaderboard[1] && (
                    <div className="text-center bg-[#0A2419]/50 border border-white/10 rounded-xl p-3 pt-5">
                      <div className="text-2xl mb-1">🥈</div>
                      <div className="flex justify-center mb-2">
                        <PlayerPhoto player={leaderboard[1]} size={44} />
                      </div>
                      <div className="text-xs truncate">{leaderboard[1].name}</div>
                      <div className="text-gold font-mono font-bold text-xs">
                        {leaderboard[1].pts} pts
                      </div>
                    </div>
                  )}

                  {leaderboard[0] && (
                    <div className="text-center bg-gold/15 border border-gold/40 rounded-xl p-3 pt-6 shadow-lg shadow-gold/10">
                      <div className="text-4xl mb-1">🥇</div>
                      <div className="flex justify-center mb-2">
                        <PlayerPhoto player={leaderboard[0]} size={56} />
                      </div>
                      <div className="text-sm font-bold truncate">
                        {leaderboard[0].name}
                      </div>
                      <div className="text-gold font-mono font-bold text-sm">
                        {leaderboard[0].pts} pts
                      </div>
                    </div>
                  )}

                  {leaderboard[2] && (
                    <div className="text-center bg-[#0A2419]/50 border border-white/10 rounded-xl p-3 pt-5">
                      <div className="text-2xl mb-1">🥉</div>
                      <div className="flex justify-center mb-2">
                        <PlayerPhoto player={leaderboard[2]} size={44} />
                      </div>
                      <div className="text-xs truncate">{leaderboard[2].name}</div>
                      <div className="text-gold font-mono font-bold text-xs">
                        {leaderboard[2].pts} pts
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  {leaderboard.slice(3).map((r, i) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 py-2.5 border-b border-white/5"
                    >
                      <div className="font-display w-7 text-golddim">
                        {i + 4}º
                      </div>

                      <PlayerPhoto player={r} size={36} />

                      <div className="flex-1 text-sm">{r.name}</div>

                      <div className="font-mono font-bold text-gold">
                        {r.pts} pt{r.pts === 1 ? "" : "s"}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
