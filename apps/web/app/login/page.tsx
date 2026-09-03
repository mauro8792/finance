"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { login, ApiClientError } from "../../lib/api";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { refresh, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      await refresh();
      router.replace("/");
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === "INVALID_CREDENTIALS") {
        setError("Email o contraseña incorrectos.");
      } else {
        setError("No pudimos iniciar sesión. Probá de nuevo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "authenticated") {
    return <p className={styles.lead}>Ya estás autenticado. Redirigiendo…</p>;
  }

  return (
    <section className={styles.page}>
      <div className={styles.intro}>
        <h1 className={styles.title}>Iniciar sesión</h1>
        <p className={styles.lead}>Esta app es personal. No hay registro público.</p>
      </div>
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <label className={styles.field}>
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          Contraseña
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? "Ingresando…" : "Entrar"}
        </button>
      </form>
    </section>
  );
}
