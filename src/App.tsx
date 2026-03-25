import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import { AuthScreen } from "./features/auth/AuthScreen";
import { HomeScreen } from "./features/home/HomeScreen";
import { InvitesScreen } from "./features/invites/InvitesScreen";
import { LeagueScreen } from "./features/league/LeagueScreen";
import { NotificationsScreen } from "./features/notifications/NotificationsScreen";
import { RatingScreen } from "./features/rating/RatingScreen";
import { supabase } from "./lib/supabase";

function App() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setIsAuthenticated(Boolean(data.session));
        setSessionLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsAuthenticated(Boolean(session));
      },
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const navItems = useMemo(
    () => [
      { to: "/home", title: "Главная" },
      { to: "/invites", title: "Приглашения" },
      { to: "/league", title: "Лига" },
      { to: "/rating", title: "Рейтинг" },
      { to: "/notifications", title: "Уведомления" },
    ],
    [],
  );

  if (sessionLoading) {
    return <div className="page center">Проверяем сессию...</div>;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <h1>Лига настольного тенниса</h1>
            <p>Сотрудники: быстрый вход, приглашения, рейтинг, уведомления</p>
          </div>
          <button
            className="ghost-button"
            onClick={() => supabase.auth.signOut()}
            type="button"
          >
            Выйти
          </button>
        </header>

        <nav className="tabs">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                `tab-link ${isActive ? "tab-link-active" : ""}`
              }
              to={item.to}
            >
              {item.title}
            </NavLink>
          ))}
        </nav>

        <main className="page">
          <Routes>
            <Route element={<Navigate replace to="/home" />} path="/" />
            <Route element={<HomeScreen />} path="/home" />
            <Route element={<InvitesScreen />} path="/invites" />
            <Route element={<LeagueScreen />} path="/league" />
            <Route element={<RatingScreen />} path="/rating" />
            <Route element={<NotificationsScreen />} path="/notifications" />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
