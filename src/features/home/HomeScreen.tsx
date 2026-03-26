import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type GameRequest = {
  id: string;
  requester_id: string;
  type: "open_casual" | "open_league";
  status: "pending" | "accepted" | "cancelled" | "expired";
  accepted_by_id: string | null;
  message: string | null;
  created_at: string;
};

export function HomeScreen() {
  const [me, setMe] = useState<string | null>(null);
  const [type, setType] = useState<GameRequest["type"]>("open_casual");
  const [note, setNote] = useState("");
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const myOpenRequest = useMemo(
    () => requests.find((r) => r.requester_id === me && r.status === "pending"),
    [requests, me],
  );

  const load = async () => {
    const [{ data: auth }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("game_requests")
        .select(
          "id, requester_id, type, status, accepted_by_id, message, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    setMe(auth.user?.id ?? null);
    if (error) {
      setMessage(`Не удалось загрузить запросы: ${error.message}`);
      return;
    }
    setRequests((data ?? []) as GameRequest[]);
  };

  useEffect(() => {
    void Promise.resolve().then(load);

    const channel = supabase
      .channel("game-requests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_requests" },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const createRequest = async () => {
    if (!me) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("game_requests").insert({
      requester_id: me,
      type,
      status: "pending",
      message: note || null,
    });
    if (error) setMessage(error.message);
    await load();
    setBusy(false);
  };

  const cancelMyRequest = async () => {
    if (!myOpenRequest) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("game_requests")
      .update({ status: "cancelled" })
      .eq("id", myOpenRequest.id);
    if (error) setMessage(error.message);
    await load();
    setBusy(false);
  };

  const acceptRequest = async (id: string) => {
    if (!me) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("game_requests")
      .update({ status: "accepted", accepted_by_id: me })
      .eq("id", id);
    if (error) setMessage(error.message);
    await load();
    setBusy(false);
  };

  return (
    <section className="stack">
      <div className="card glass">
        <h2 className="h2">Ищу игру</h2>
        <p className="hint">
          Создай открытый запрос — коллеги увидят его и смогут принять.
        </p>

        <div className="grid-form">
          <label>
            Тип
            <select
              onChange={(e) => setType(e.target.value as GameRequest["type"])}
              value={type}
            >
              <option value="open_casual">Просто поиграть</option>
              <option value="open_league">Матч лиги</option>
            </select>
          </label>
          <label>
            Комментарий (опционально)
            <input
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: после 18:00"
              value={note}
            />
          </label>

          {myOpenRequest ? (
            <button disabled={busy} onClick={() => void cancelMyRequest()} type="button">
              {busy ? "..." : "Отменить мой запрос"}
            </button>
          ) : (
            <button disabled={busy || !me} onClick={() => void createRequest()} type="button">
              {busy ? "..." : "Создать запрос"}
            </button>
          )}

          {message ? <p className="hint">{message}</p> : null}
        </div>
      </div>

      <div className="card glass-lite">
        <h3 className="h3">Лента запросов</h3>
        <ul>
          {requests
            .filter((r) => r.status === "pending")
            .map((r) => (
              <li key={r.id}>
                {r.type === "open_league" ? "Матч лиги" : "Просто поиграть"}
                {r.message ? ` · ${r.message}` : ""}{" "}
                {r.requester_id === me ? (
                  <span className="hint"> (мой)</span>
                ) : (
                  <button
                    className="ghost-button"
                    disabled={busy || !me}
                    onClick={() => void acceptRequest(r.id)}
                    type="button"
                  >
                    Принять
                  </button>
                )}
              </li>
            ))}
          {requests.filter((r) => r.status === "pending").length === 0 ? (
            <li>Пока нет открытых запросов</li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
