import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Row = {
  player_id: string;
  total_points: number;
  total_sets_won: number;
  total_sets_lost: number;
  rating_delta: number;
};

export function LeagueScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("division_players")
        .select(
          "player_id, total_points, total_sets_won, total_sets_lost, rating_delta",
        )
        .order("total_points", { ascending: false })
        .limit(15);

      if (error) {
        setMessage(`Ошибка загрузки таблицы дивизиона: ${error.message}`);
      } else {
        setRows((data ?? []) as Row[]);
      }
    };

    void load();
  }, []);

  return (
    <section className="card glass-lite">
      <h2 className="h2">Таблица дивизиона (MVP)</h2>
      <p className="hint">
        На текущем шаге показываем сводные данные `division_players`.
      </p>
      {message ? <p className="hint">{message}</p> : null}
      <div className="table-scroll glass-table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Очки</th>
              <th>Сеты</th>
              <th>Δ рейтинг</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.player_id}>
                <td>{row.player_id.slice(0, 8)}</td>
                <td>{row.total_points}</td>
                <td>
                  {row.total_sets_won}:{row.total_sets_lost}
                </td>
                <td>{row.rating_delta}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>Нет данных</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
