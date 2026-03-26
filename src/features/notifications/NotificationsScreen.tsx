import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type AppNotification = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export function NotificationsScreen() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [message, setMessage] = useState("");

  const loadNotifications = async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, body, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      setMessage(`Ошибка загрузки уведомлений: ${error.message}`);
      return;
    }
    setNotifications((data ?? []) as AppNotification[]);
  };

  useEffect(() => {
    void Promise.resolve().then(loadNotifications);
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        loadNotifications,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const requestPushPermission = async () => {
    if (!("Notification" in window)) {
      setMessage("Браузер не поддерживает push-уведомления.");
      return;
    }
    const result = await Notification.requestPermission();
    setMessage(`Статус разрешения: ${result}`);
  };

  return (
    <section className="stack">
      <div className="card glass">
        <h2 className="h2">Уведомления</h2>
        <button onClick={() => void requestPushPermission()} type="button">
          Включить push в браузере
        </button>
        {message ? <p className="hint">{message}</p> : null}
      </div>
      <div className="card glass-lite">
        <h3 className="h3">Лента уведомлений</h3>
        <ul>
          {notifications.map((notification) => (
            <li key={notification.id}>
              <strong>{notification.title}</strong>: {notification.body}{" "}
              <span className="hint">
                ({new Date(notification.created_at).toLocaleString()})
              </span>
            </li>
          ))}
          {notifications.length === 0 ? <li>Нет уведомлений</li> : null}
        </ul>
      </div>
    </section>
  );
}
