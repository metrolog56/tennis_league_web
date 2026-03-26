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

type Player = {
  id: string;
  name: string;
  rating: number;
};

type PendingMatch = {
  id: string;
  player1_id: string;
  player2_id: string;
  sets_player1: number;
  sets_player2: number;
  submitted_by: string | null;
  mySets: number;
  opponentSets: number;
  opponent_id: string;
  opponent?: Player;
};

function formatScore(mySets: number, oppSets: number) {
  return `${mySets}:${oppSets}`;
}

export function HomeScreen() {
  const [me, setMe] = useState<string | null>(null);
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [findGameOpen, setFindGameOpen] = useState(false);

  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [divisionPlayers, setDivisionPlayers] = useState<Player[]>([]);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);

  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchModalBusy, setMatchModalBusy] = useState(false);
  const [matchMode, setMatchMode] = useState<"submit" | "confirm">("submit");

  const [matchOpponentId, setMatchOpponentId] = useState<string | null>(null);
  const [scoreChip, setScoreChip] = useState<
    "3:0" | "3:1" | "3:2" | "0:3" | "1:3" | "2:3" | null
  >(null);

  const myOpenRequest = useMemo(
    () =>
      requests.find((r) => r.requester_id === me && r.status === "pending") ??
      null,
    [requests, me],
  );

  const myConfirmations = useMemo(
    () => pendingMatches.filter((m) => m.submitted_by !== me),
    [pendingMatches, me],
  );

  const loadRequests = async () => {
    const { data: auth } = await supabase.auth.getUser();
    setMe(auth.user?.id ?? null);

    const { data, error } = await supabase
      .from("game_requests")
      .select(
        "id, requester_id, type, status, accepted_by_id, message, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      setMessage(`Не удалось загрузить запросы: ${error.message}`);
      return;
    }
    setRequests((data ?? []) as GameRequest[]);
  };

  const loadDivisionData = async (meId: string) => {
    const { data: divRow, error: divErr } = await supabase
      .from("division_players")
      .select("division_id")
      .eq("player_id", meId)
      .maybeSingle();

    if (divErr) {
      setMessage(`Не удалось загрузить дивизион: ${divErr.message}`);
      return;
    }
    const divId = divRow?.division_id ?? null;
    setDivisionId(divId);

    if (!divId) {
      setDivisionPlayers([]);
      setPendingMatches([]);
      return;
    }

    const { data: dpRows, error: dpErr } = await supabase
      .from("division_players")
      .select("player_id")
      .eq("division_id", divId);
    if (dpErr) {
      setMessage(`Не удалось загрузить участников дивизиона: ${dpErr.message}`);
      return;
    }

    const playerIds = (dpRows ?? []).map((r) => r.player_id as string);
    if (playerIds.length === 0) {
      setDivisionPlayers([]);
      setPendingMatches([]);
      return;
    }

    const { data: players, error: playersErr } = await supabase
      .from("players")
      .select("id, name, rating")
      .in("id", playerIds);
    if (playersErr) {
      setMessage(`Не удалось загрузить игроков: ${playersErr.message}`);
      return;
    }

    const playerMap = new Map<string, Player>(
      ((players ?? []) as Player[]).map((p) => [p.id, p]),
    );

    const { data: matchRows, error: matchesErr } = await supabase
      .from("matches")
      .select(
        "id, player1_id, player2_id, sets_player1, sets_player2, status, submitted_by",
      )
      .eq("division_id", divId)
      .eq("status", "pending")
      .or(`player1_id.eq.${meId},player2_id.eq.${meId}`);
    if (matchesErr) {
      setMessage(`Не удалось загрузить матчи: ${matchesErr.message}`);
      return;
    }

    const transformed = (matchRows ?? []).map((m) => {
      const player1Id = m.player1_id as string;
      const player2Id = m.player2_id as string;
      const opponentId = player1Id === meId ? player2Id : player1Id;
      const mySets = player1Id === meId ? m.sets_player1 : m.sets_player2;
      const oppSets = player1Id === meId ? m.sets_player2 : m.sets_player1;

      return {
        id: m.id as string,
        player1_id: player1Id,
        player2_id: player2Id,
        sets_player1: Number(m.sets_player1 ?? 0),
        sets_player2: Number(m.sets_player2 ?? 0),
        submitted_by: (m.submitted_by as string | null) ?? null,
        mySets: Number(mySets ?? 0),
        opponentSets: Number(oppSets ?? 0),
        opponent_id: opponentId,
        opponent: playerMap.get(opponentId),
      } satisfies PendingMatch;
    });

    setDivisionPlayers((players ?? []) as Player[]);
    setPendingMatches(transformed);
  };

  useEffect(() => {
    void Promise.resolve().then(loadRequests);
    const channel = supabase
      .channel("game-requests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_requests" },
        () => void loadRequests(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    void loadDivisionData(me);
  }, [me]);

  useEffect(() => {
    if (!me || !divisionId) return;
    const channel = supabase
      .channel("matches-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `division_id=eq.${divisionId},or(player1_id.eq.${me},player2_id.eq.${me})`,
        },
        () => void loadDivisionData(me),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me, divisionId]);

  const createRequest = async (t: GameRequest["type"]) => {
    if (!me) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("game_requests").insert({
      requester_id: me,
      type: t,
      status: "pending",
      message: null,
    });
    if (error) setMessage(error.message);
    await loadRequests();
    setFindGameOpen(false);
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
    await loadRequests();
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
    await loadRequests();
    setBusy(false);
  };

  const openMatchModal = () => {
    const mode = myConfirmations.length > 0 ? "confirm" : "submit";
    setMatchMode(mode);
    setMatchModalOpen(true);
    setMatchOpponentId(
      mode === "submit"
        ? divisionPlayers.find((p) => p.id !== me)?.id ?? null
        : myConfirmations[0]?.opponent_id ?? null,
    );
    setScoreChip(null);
  };

  const closeMatchModal = () => {
    setMatchModalOpen(false);
    setMatchMode("submit");
    setMatchOpponentId(null);
    setScoreChip(null);
    setMatchModalBusy(false);
  };

  const scoreToSets = (chip: typeof scoreChip) => {
    if (!chip) return null;
    const [a, b] = chip.split(":").map((x) => Number(x));
    // chip is "myWins:oppWins" from current user perspective
    return { myWins: a, oppWins: b };
  };

  const submitMatch = async () => {
    if (!me || !divisionId || !matchOpponentId || !scoreChip) return;
    setMatchModalBusy(true);
    setMessage("");

    const sets = scoreToSets(scoreChip);
    if (!sets) return;

    const [player1_id, player2_id] =
      me < matchOpponentId
        ? [me, matchOpponentId]
        : [matchOpponentId, me];
    const player1Sets = player1_id === me ? sets.myWins : sets.oppWins;
    const player2Sets = player2_id === me ? sets.myWins : sets.oppWins;

    const { data: existing } = await supabase
      .from("matches")
      .select("id,status")
      .eq("division_id", divisionId)
      .eq("player1_id", player1_id)
      .eq("player2_id", player2_id)
      .maybeSingle();

    if (existing?.status === "played") {
      setMessage("Результат по этому матчу уже зафиксирован.");
      setMatchModalBusy(false);
      return;
    }

    if (existing?.id) {
      const { error } = await supabase.from("matches").update({
        sets_player1: player1Sets,
        sets_player2: player2Sets,
        status: "pending",
        submitted_by: me,
        played_at: null,
      }).eq("id", existing.id);
      if (error) {
        setMessage(error.message);
        setMatchModalBusy(false);
        return;
      }
    } else {
      const { error } = await supabase.from("matches").insert({
        division_id: divisionId,
        player1_id,
        player2_id,
        sets_player1: player1Sets,
        sets_player2: player2Sets,
        status: "pending",
        submitted_by: me,
      });
      if (error) {
        setMessage(error.message);
        setMatchModalBusy(false);
        return;
      }
    }

    await loadDivisionData(me);
    setMatchModalBusy(false);
    closeMatchModal();
  };

  const confirmMatch = async (matchId: string) => {
    if (!me) return;
    setMatchModalBusy(true);
    setMessage("");

    const { error: updateErr } = await supabase
      .from("matches")
      .update({ status: "played", played_at: new Date().toISOString() })
      .eq("id", matchId);

    if (updateErr) {
      setMessage(updateErr.message);
      setMatchModalBusy(false);
      return;
    }

    const { error: fnErr } = await supabase.functions.invoke(
      "calculate-rating",
      {
        body: { match_id: matchId },
      },
    );

    if (fnErr) {
      setMessage(fnErr.message);
    }

    await loadDivisionData(me);
    setMatchModalBusy(false);
    closeMatchModal();
  };

  const modeMatch = matchMode === "confirm" ? myConfirmations[0] : null;

  return (
    <section className="stack">
      <div className="card glass-lite">
        <button
          disabled={matchModalBusy}
          onClick={openMatchModal}
          style={{ width: "100%" }}
          type="button"
        >
          + Внести результат матча
        </button>
        {myConfirmations.length > 0 ? (
          <p className="hint" style={{ marginTop: "0.75rem" }}>
            Есть матч(и) на ваше подтверждение.
          </p>
        ) : null}
      </div>

      <div className="card glass">
        <h2 className="h2">Ищу игру</h2>
        <p className="hint">Кнопка → выбор типа → создание открытого запроса.</p>

        {myOpenRequest ? (
          <button
            disabled={busy}
            onClick={() => void cancelMyRequest()}
            type="button"
            style={{ width: "100%" }}
          >
            {busy ? "..." : "Отменить мой запрос"}
          </button>
        ) : (
          <button
            disabled={busy || !me}
            onClick={() => setFindGameOpen(true)}
            type="button"
            style={{ width: "100%" }}
          >
            {busy ? "..." : "Ищу игру"}
          </button>
        )}

        {message ? <p className="hint">{message}</p> : null}
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

      {findGameOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content glass">
            <h3 className="modal-title">Ищу игру</h3>
            <p className="modal-subtitle">
              Выберите тип запроса: просто поиграть или матч лиги.
            </p>
            <div className="modal-inline-actions">
              <button
                className="btn-secondary"
                type="button"
                disabled={busy}
                onClick={() => void createRequest("open_casual")}
              >
                Просто поиграть
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createRequest("open_league")}
              >
                Матч лиги
              </button>
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                type="button"
                disabled={busy}
                onClick={() => setFindGameOpen(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {matchModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content glass">
            {matchMode === "confirm" && modeMatch ? (
              <>
                <h3 className="modal-title">Подтверждение результата матча</h3>
                <p className="modal-subtitle">
                  {modeMatch.opponent?.name ?? "Соперник"} · ваш счёт{" "}
                  {formatScore(modeMatch.mySets, modeMatch.opponentSets)}
                </p>
                <div className="card glass-lite" style={{ padding: "0.75rem" }}>
                  <p className="hint" style={{ margin: 0 }}>
                    Нажмите thumbs-up, чтобы подтвердить счёт.
                  </p>
                </div>
                <div className="modal-actions">
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={matchModalBusy}
                    onClick={() => closeMatchModal()}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={matchModalBusy}
                    onClick={() => void confirmMatch(modeMatch.id)}
                  >
                    👍
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="modal-title">Внести результат матча</h3>
                <p className="modal-subtitle">
                  Выберите соперника и итоговый счёт по сетам.
                </p>

                <label>
                  Соперник
                  <select
                    onChange={(e) => setMatchOpponentId(e.target.value)}
                    value={matchOpponentId ?? ""}
                  >
                    <option value="" disabled>
                      Выберите игрока
                    </option>
                    {divisionPlayers
                      .filter((p) => p.id !== me)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>

                <div style={{ marginTop: "1rem" }}>
                  <div className="hint" style={{ marginBottom: "0.5rem" }}>
                    Итог по сетам (best-of-5):
                  </div>
                  <div className="score-chips">
                    {([
                      "3:0",
                      "3:1",
                      "3:2",
                      "0:3",
                      "1:3",
                      "2:3",
                    ] as const).map((chip) => (
                      <div
                        key={chip}
                        className={[
                          "score-chip",
                          scoreChip === chip ? "score-chip-active" : "",
                        ].join(" ")}
                        role="button"
                        tabIndex={0}
                        onClick={() => setScoreChip(chip)}
                      >
                        {chip}
                      </div>
                    ))}
                  </div>
                </div>

                {message ? <p className="hint">{message}</p> : null}

                <div className="modal-actions">
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={matchModalBusy}
                    onClick={() => closeMatchModal()}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={matchModalBusy || !matchOpponentId || !scoreChip}
                    onClick={() => void submitMatch()}
                  >
                    👍
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
