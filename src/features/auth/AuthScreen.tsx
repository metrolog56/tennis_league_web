import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../../lib/supabase";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setMessage(`Ошибка входа: ${error.message}`);
    } else {
      setMessage("Ссылка для входа отправлена на email.");
    }

    setBusy(false);
  };

  return (
    <main className="page center">
      <section className="card auth-card">
        <h1>Лига настольного тенниса</h1>
        <p>Вход без пароля: отправим magic link на рабочую почту.</p>
        <form className="stack" onSubmit={onSubmit}>
          <label className="stack" htmlFor="email">
            <span>Email</span>
            <input
              autoComplete="email"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Отправляем..." : "Войти по ссылке"}
          </button>
        </form>
        {message ? <p className="hint">{message}</p> : null}
      </section>
    </main>
  );
}
