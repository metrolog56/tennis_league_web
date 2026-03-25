import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Player = {
  id: string;
  name: string;
  rating: number;
};

export function RatingScreen() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, name, rating")
        .order("rating", { ascending: false })
        .limit(30);

      if (error) {
        setMessage(`Ошибка загрузки рейтинга: ${error.message}`);
      } else {
        setPlayers((data ?? []) as Player[]);
      }
    };
    void load();
  }, []);

  return (
    <section className="card">
      <h2>Общий рейтинг</h2>
      {message ? <p className="hint">{message}</p> : null}
      <ol>
        {players.map((player) => (
          <li key={player.id}>
            {player.name} — {player.rating.toFixed(2)}
          </li>
        ))}
        {players.length === 0 ? <li>Нет данных</li> : null}
      </ol>
    </section>
  );
}
