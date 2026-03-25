# Tennis League Web (MVP)

MVP web-приложение лиги настольного тенниса для сотрудников:

- Auth через Supabase Magic Link
- приглашения (`casual` / `league`)
- матчи и рейтинг
- in-app уведомления + заготовка под Web Push
- React + Vite + PWA

## Локальный запуск

1. Скопируйте `.env.example` в `.env.local` и заполните:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Установите зависимости:

```bash
npm install
```

3. Запустите:

```bash
npm run dev
```

## Supabase

SQL-схема находится в:

- `supabase/migrations/20260325190000_init_league_schema.sql`

В ней:

- база таблиц по модели `players/seasons/divisions/division_players/matches/rating_history`
- таблицы MVP: `invites`, `notifications`, `push_subscriptions`
- RLS политики под `authenticated` пользователей
- триггер автосоздания профиля игрока из `auth.users`

Edge Functions:

- `supabase/functions/calculate-rating`
- `supabase/functions/send-push`
