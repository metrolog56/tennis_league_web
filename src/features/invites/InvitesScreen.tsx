import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../../lib/supabase";

type Invite = {
  id: string;
  type: "casual" | "league";
  status: "invited" | "accepted" | "declined" | "cancelled";
  location: string | null;
  scheduled_at: string | null;
  created_at: string;
};

export function InvitesScreen() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<Invite["type"]>("league");
  const [location, setLocation] = useState("Офис");
  const [scheduledAt, setScheduledAt] = useState("");

  const loadInvites = async () => {
    const { data, error } = await supabase
      .from("invites")
      .select("id, type, status, location, scheduled_at, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      setMessage(`Не удалось загрузить приглашения: ${error.message}`);
      return;
    }
    setInvites((data ?? []) as Invite[]);
  };

  useEffect(() => {
    void Promise.resolve().then(loadInvites);

    const channel = supabase
      .channel("invites-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invites" },
        loadInvites,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const createDraftInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const { data: authData } = await supabase.auth.getUser();
    const me = authData.user?.id;
    if (!me) {
      setMessage("Нужна авторизация.");
      setBusy(false);
      return;
    }

    const { error } = await supabase.from("invites").insert({
      created_by: me,
      to_player_id: me,
      type,
      status: "invited",
      location: location || null,
      scheduled_at: scheduledAt || null,
    });

    if (error) {
      setMessage(`Ошибка создания приглашения: ${error.message}`);
    } else {
      setMessage("Черновое приглашение создано.");
      setScheduledAt("");
      void loadInvites();
    }

    setBusy(false);
  };

  return (
    <section className="stack">
      <div className="card">
        <h2>Приглашения</h2>
        <p className="hint">
          Пока упрощенно: создание чернового приглашения самому себе для проверки
          схемы и Realtime.
        </p>
        <form className="grid-form" onSubmit={createDraftInvite}>
          <label>
            Тип игры
            <select
              onChange={(event) => setType(event.target.value as Invite["type"])}
              value={type}
            >
              <option value="league">league</option>
              <option value="casual">casual</option>
            </select>
          </label>
          <label>
            Локация
            <input
              onChange={(event) => setLocation(event.target.value)}
              value={location}
            />
          </label>
          <label>
            Время
            <input
              onChange={(event) => setScheduledAt(event.target.value)}
              type="datetime-local"
              value={scheduledAt}
            />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Сохраняем..." : "Создать приглашение"}
          </button>
        </form>
        {message ? <p className="hint">{message}</p> : null}
      </div>
      <div className="card">
        <h3>Последние приглашения</h3>
        <ul>
          {invites.map((invite) => (
            <li key={invite.id}>
              {invite.type} / {invite.status} /{" "}
              {invite.scheduled_at
                ? new Date(invite.scheduled_at).toLocaleString()
                : "без времени"}
            </li>
          ))}
          {invites.length === 0 ? <li>Нет данных</li> : null}
        </ul>
      </div>
    </section>
  );
}
