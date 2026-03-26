export function HomeScreen() {
  return (
    <section className="stack">
      <div className="card glass">
        <h2 className="h2">Что доступно в MVP</h2>
        <ul>
          <li>Приглашения на игру (casual/league)</li>
          <li>Внесение результатов матчей best-of-5</li>
          <li>Таблицы дивизионов и общий рейтинг</li>
          <li>In-app + Web Push уведомления</li>
        </ul>
      </div>
      <div className="card glass">
        <h3 className="h3">Следующий шаг</h3>
        <p>
          Настройте переменные окружения в <code>.env.local</code>, примените
          SQL-миграции из папки <code>supabase/migrations</code> и проверьте
          создание приглашения.
        </p>
      </div>
    </section>
  );
}
