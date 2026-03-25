import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  match_id: string;
};
type PlayerRating = { id: string; rating: number };

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const client = createClient(supabaseUrl, serviceRoleKey);

const jsonHeaders = { "Content-Type": "application/json" };

function scoreKs(a: number, b: number): number {
  const diff = Math.abs(a - b);
  if (diff === 1) return 0.8;
  if (diff === 2) return 1.0;
  return 1.2;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: jsonHeaders,
      status: 405,
    });
  }

  const payload = (await request.json()) as Payload;
  if (!payload.match_id) {
    return new Response(JSON.stringify({ error: "match_id is required" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const { data: match, error: matchError } = await client
    .from("matches")
    .select("id, division_id, player1_id, player2_id, sets_player1, sets_player2")
    .eq("id", payload.match_id)
    .single();

  if (matchError || !match) {
    return new Response(
      JSON.stringify({ error: matchError?.message ?? "Match not found" }),
      { headers: jsonHeaders, status: 404 },
    );
  }

  const { data: division } = await client
    .from("divisions")
    .select("id, season_id, coef")
    .eq("id", match.division_id)
    .single();
  const kd = division?.coef ?? 0.25;

  const { data: players } = await client
    .from("players")
    .select("id, rating")
    .in("id", [match.player1_id, match.player2_id]);

  const ratings = (players ?? []) as PlayerRating[];
  const p1 = ratings.find((x) => x.id === match.player1_id);
  const p2 = ratings.find((x) => x.id === match.player2_id);
  if (!p1 || !p2) {
    return new Response(JSON.stringify({ error: "Players not found" }), {
      headers: jsonHeaders,
      status: 404,
    });
  }

  const p1Won = Number(match.sets_player1) > Number(match.sets_player2);
  const winner = p1Won ? p1 : p2;
  const loser = p1Won ? p2 : p1;
  const ks = scoreKs(Number(match.sets_player1), Number(match.sets_player2));

  const winDelta = ((100 - (Number(winner.rating) - Number(loser.rating))) / 10) * kd * ks;
  const loseDelta = -((100 - (Number(winner.rating) - Number(loser.rating))) / 20) * kd * ks;

  const winnerAfter = Number(winner.rating) + winDelta;
  const loserAfter = Number(loser.rating) + loseDelta;

  await client.from("players").update({ rating: winnerAfter }).eq("id", winner.id);
  await client.from("players").update({ rating: loserAfter }).eq("id", loser.id);

  await client.from("rating_history").insert([
    {
      player_id: winner.id,
      match_id: match.id,
      season_id: division?.season_id,
      rating_before: winner.rating,
      rating_delta: winDelta,
      rating_after: winnerAfter,
      division_coef: kd,
      score_ks: ks,
    },
    {
      player_id: loser.id,
      match_id: match.id,
      season_id: division?.season_id,
      rating_before: loser.rating,
      rating_delta: loseDelta,
      rating_after: loserAfter,
      division_coef: kd,
      score_ks: ks,
    },
  ]);

  return new Response(
    JSON.stringify({
      ok: true,
      winner_id: winner.id,
      winner_delta: winDelta,
      loser_id: loser.id,
      loser_delta: loseDelta,
    }),
    { headers: jsonHeaders, status: 200 },
  );
});
