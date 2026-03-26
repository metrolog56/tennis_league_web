import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Season = { id: string; name: string; year: number; month: number };
type Division = { id: string; number: number; coef: number };
type Player = { id: string; name: string; rating: number };
type DivisionPlayer = {
  id: string;
  player_id: string;
  position: number | null;
  total_points: number;
  total_sets_won: number;
  total_sets_lost: number;
  rating_delta: number;
  player?: Player;
};

export function DivisionsScreen() {
  const [season, setSeason] = useState<Season | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [playersByDivision, setPlayersByDivision] = useState<
    Record<string, DivisionPlayer[]>
  >({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const formationRule = useMemo(
    () =>
      "Тур — 1 месяц. Дивизион 6–10 игроков. По итогам тура топ‑2 поднимаются, последние‑2 опускаются (если игроков > 8 — по 3).",
    [],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage("");

      const { data: seasonRow, error: seasonError } = await supabase
        .from("seasons")
        .select("id, name, year, month")
        .eq("status", "active")
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (seasonError) {
        setMessage(`Не удалось загрузить сезон: ${seasonError.message}`);
        setLoading(false);
        return;
      }
      if (!seasonRow) {
        setMessage("Активный сезон не найден.");
        setLoading(false);
        return;
      }
      setSeason(seasonRow as Season);

      const { data: divRows, error: divError } = await supabase
        .from("divisions")
        .select("id, number, coef")
        .eq("season_id", seasonRow.id)
        .order("number", { ascending: true });

      if (divError) {
        setMessage(`Не удалось загрузить дивизионы: ${divError.message}`);
        setLoading(false);
        return;
      }

      const divs = (divRows ?? []) as Division[];
      setDivisions(divs);

      const perDivision = await Promise.all(
        divs.map(async (div) => {
          const { data, error } = await supabase
            .from("division_players")
            .select(
              "id, player_id, position, total_points, total_sets_won, total_sets_lost, rating_delta",
            )
            .eq("division_id", div.id);

          if (error) {
            return { divisionId: div.id, rows: [] as DivisionPlayer[] };
          }

          const rows = (data ?? []) as DivisionPlayer[];
          const playerIds = rows.map((r) => r.player_id);
          const { data: players } = await supabase
            .from("players")
            .select("id, name, rating")
            .in("id", playerIds);

          const byId = new Map<string, Player>(
            ((players ?? []) as Player[]).map((p) => [p.id, p]),
          );

          const enriched = rows
            .map((r) => ({ ...r, player: byId.get(r.player_id) }))
            .sort((a, b) => {
              const ap = a.total_points ?? 0;
              const bp = b.total_points ?? 0;
              if (bp !== ap) return bp - ap;
              const aset = (a.total_sets_won ?? 0) - (a.total_sets_lost ?? 0);
              const bset = (b.total_sets_won ?? 0) - (b.total_sets_lost ?? 0);
              return bset - aset;
            });

          return { divisionId: div.id, rows: enriched };
        }),
      );

      const map: Record<string, DivisionPlayer[]> = {};
      for (const item of perDivision) {
        map[item.divisionId] = item.rows;
      }
      setPlayersByDivision(map);
      setLoading(false);
    };

    void load();
  }, []);

  return (
    <section className="stack">
      <div className="card glass">
        <h2 className="h2">Дивизионы</h2>
        <p className="hint">{formationRule}</p>
        {season ? (
          <p className="hint">
            Активный сезон: <strong>{season.name}</strong>
          </p>
        ) : null}
        {message ? <p className="hint">{message}</p> : null}
      </div>

      {loading ? (
        <div className="card glass-lite">Загрузка...</div>
      ) : (
        divisions.map((div) => (
          <div key={div.id} className="card glass-lite">
            <h3 className="h3">
              Дивизион {div.number} (КД {Number(div.coef).toFixed(2)})
            </h3>
            <ol>
              {(playersByDivision[div.id] ?? []).map((row, idx) => (
                <li key={row.id}>
                  {idx + 1}. {row.player?.name ?? row.player_id.slice(0, 8)} —{" "}
                  {row.total_points} очк.,{" "}
                  {row.total_sets_won}:{row.total_sets_lost},{" "}
                  рейтинг {row.player?.rating?.toFixed(2) ?? "—"}
                </li>
              ))}
              {(playersByDivision[div.id] ?? []).length === 0 ? (
                <li>Нет данных</li>
              ) : null}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}

