"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  activateAccount,
  createAccount,
  deactivateAccount,
  getAccountBalance,
  getAccounts,
  updateAccount,
} from "../lib/api";
import {
  ACCOUNT_TYPES,
  accountFormError,
  accountTypeLabel,
} from "../lib/accounts";
import { formatMoney } from "../lib/format-money";
import type { Account, AccountType, Currency } from "../lib/types";
import styles from "./Accounts.module.css";

type Panel =
  | { mode: "create" }
  | { mode: "edit"; account: Account };

export function AccountsPage() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });
  const balances = useQuery({
    queryKey: ["account-balances", (query.data ?? []).map((item) => item.id)],
    enabled: query.isSuccess,
    queryFn: async () => {
      const entries = await Promise.all(
        (query.data ?? []).map(async (account) => {
          const result = await getAccountBalance(account.id);
          return [account.id, result.balance] as const;
        })
      );
      return Object.fromEntries(entries) as Record<string, string>;
    },
  });

  async function refreshAccounts() {
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["account-balances"] });
    await queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
  }

  return (
    <section className={styles.page} aria-labelledby="accounts-title">
      <header className={styles.intro}>
        <p className={styles.kicker}>Cuentas</p>
        <h1 id="accounts-title" className={styles.title}>
          Cuentas
        </h1>
        <p className={styles.lead}>
          Administrá las cuentas. El dinero entra después desde Registrar.
        </p>
        <button
          type="button"
          className={styles.primaryCta}
          onClick={() => setPanel({ mode: "create" })}
        >
          Nueva cuenta
        </button>
      </header>

      {panel ? (
        <AccountForm
          panel={panel}
          onClose={() => setPanel(null)}
          onSaved={async () => {
            await refreshAccounts();
            setPanel(null);
          }}
        />
      ) : null}

      {query.isPending ? <AccountsSkeleton /> : null}

      {query.isError ? (
        <div className={styles.error} role="alert">
          <p>No pudimos cargar tus cuentas. Probá de nuevo.</p>
          <button type="button" className={styles.retry} onClick={() => query.refetch()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {query.data && query.data.length === 0 && panel?.mode !== "create" ? (
        <div className={styles.empty}>
          <p>Aún no creaste cuentas.</p>
          <button
            type="button"
            className={styles.primaryCta}
            onClick={() => setPanel({ mode: "create" })}
          >
            Crear cuenta
          </button>
        </div>
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className={styles.grid}>
          {query.data.map((account) => (
            <li key={account.id}>
              <AccountCard
                account={account}
                balance={balances.data?.[account.id] ?? null}
                balanceLoading={balances.isPending}
                balanceError={balances.isError}
                onRetryBalance={() => balances.refetch()}
                onEdit={() => setPanel({ mode: "edit", account })}
                onChanged={refreshAccounts}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AccountCard({
  account,
  balance,
  balanceLoading,
  balanceError,
  onRetryBalance,
  onEdit,
  onChanged,
}: {
  account: Account;
  balance: string | null;
  balanceLoading: boolean;
  balanceError: boolean;
  onRetryBalance: () => void;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const toggle = useMutation({
    mutationFn: () =>
      account.isActive ? deactivateAccount(account.id) : activateAccount(account.id),
    onSuccess: async () => {
      await onChanged();
    },
  });

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{account.name}</h2>
          <p className={styles.metaLine}>
            {account.currency} · {accountTypeLabel(account.type)}
          </p>
        </div>
        <span className={account.isActive ? styles.badge : styles.badgeInactive}>
          {account.isActive ? "Activa" : "Inactiva"}
        </span>
      </header>
      <p className={styles.balanceLabel}>Saldo</p>
      {balanceLoading ? <p className={styles.loading}>Cargando saldo</p> : null}
      {balanceError ? (
        <div className={styles.inlineError}>
          <p>No pudimos cargar el saldo.</p>
          <button type="button" className={styles.retry} onClick={onRetryBalance}>
            Reintentar
          </button>
        </div>
      ) : null}
      {balance !== null ? (
        <p className={styles.balance}>{formatMoney(balance, account.currency)}</p>
      ) : null}
      {toggle.isError ? (
        <p className={styles.formError} role="alert">
          {accountFormError(toggle.error)}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.edit} onClick={onEdit}>
          Editar
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {account.isActive ? "Desactivar cuenta" : "Activar cuenta"}
        </button>
      </div>
    </article>
  );
}

function AccountForm({
  panel,
  onClose,
  onSaved,
}: {
  panel: Panel;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = panel.mode === "edit";
  const [name, setName] = useState(isEdit ? panel.account.name : "");
  const [type, setType] = useState<AccountType>(
    isEdit ? (panel.account.type ?? "CASH") : "CASH"
  );
  const [currency, setCurrency] = useState<Currency>(
    isEdit ? panel.account.currency : "ARS"
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return updateAccount(panel.account.id, { name: name.trim(), type });
      }
      return createAccount({
        name: name.trim(),
        type,
        currency,
      });
    },
    onSuccess: async () => {
      await onSaved();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setLocalError("El nombre es obligatorio.");
      return;
    }
    setLocalError(null);
    mutation.mutate();
  }

  const errorMessage = localError ?? (mutation.isError ? accountFormError(mutation.error) : null);

  return (
    <form className={styles.form} onSubmit={onSubmit} aria-busy={mutation.isPending}>
      <h2 className={styles.formTitle}>{isEdit ? "Editar cuenta" : "Nueva cuenta"}</h2>
      <label className={styles.field}>
        Nombre
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label className={styles.field}>
        Tipo
        <select value={type} onChange={(event) => setType(event.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((item) => (
            <option key={item} value={item}>
              {accountTypeLabel(item)}
            </option>
          ))}
        </select>
      </label>
      {isEdit ? (
        <p className={styles.formHint}>Moneda: {panel.account.currency}. No se puede cambiar.</p>
      ) : (
        <label className={styles.field}>
          Moneda
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>
      )}
      {errorMessage ? (
        <p className={styles.formError} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryCta} disabled={mutation.isPending}>
          {mutation.isPending ? "Guardando..." : isEdit ? "Guardar" : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}

function AccountsSkeleton() {
  return (
    <div className={styles.skeleton}>
      <p className={styles.loading}>Cargando cuentas</p>
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
    </div>
  );
}
