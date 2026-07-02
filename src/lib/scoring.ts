export type Match = {
  id: string;
  team_a: string;
  team_b: string;
  match_date: string | null;
  result_a: number | null;
  result_b: number | null;
  status: string;
};

export type Prediction = {
  id: string;
  match_id: string;
  player_id: string;
  score_a: number;
  score_b: number;
};

/**
 * 3 pts = acertou o placar exato
 * 1 pt  = acertou o resultado (vitória de quem / empate), placar diferente
 * 0 pt  = errou o resultado
 * null  = partida ainda sem resultado real, não dá pra pontuar
 */
export function computePoints(pred: Prediction, match: Match): number | null {
  if (match.result_a === null || match.result_b === null) return null;

  if (pred.score_a === match.result_a && pred.score_b === match.result_b) return 3;

  const predSign = Math.sign(pred.score_a - pred.score_b);
  const realSign = Math.sign(match.result_a - match.result_b);
  return predSign === realSign ? 1 : 0;
}
