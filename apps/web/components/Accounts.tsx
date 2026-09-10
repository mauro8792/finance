"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
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
import { getDefaultAccountId, setDefaultAccountId } from "../lib/default-account";
import type { Account, AccountType, Currency } from "../lib/types";
import { PrivacyToggle } from "./PrivacyToggle";
import { EmptyState, ErrorState } from "./QueryStatus";
import { FinancialCard } from "./ui/FinancialCard";
import { Money } from "./ui/Money";
import { PageHeader } from "./ui/PageHeader";
import { Skeleton } from "./ui/Skeleton";
import { StatusBadge } from "./ui/StatusBadge";
import styles from "./Accounts.module.css";

type Panel =
  | { mode: "create" }
  | { mode: "edit"; account: Account };

export function AccountsPage() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [defaultAccountId, setDefaultId] = useState<string | null>(null);
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

  useEffect(() => {
    setDefaultId(getDefaultAccountId());
  }, []);

  async function refreshAccounts() {
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["account-balances"] });
    await queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
  }

  function makeDefault(accountId: string) {
    setDefaultAccountId(accountId);
    setDefaultId(accountId);
  }

  return (
    <section className={styles.page} aria-label="Cuentas">
      <PageHeader
        kicker="Tu dinero"
        title="Cuentas"
        description="Administrá dónde está tu plata. El dinero entra después desde Registrar."
        actions={<PrivacyToggle />}
      />

      <button
        type="button"
        className={styles.primaryCta}
        onClick={() => setPanel({ mode: "create" })}
      >
        Nueva cuenta
      </button>

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

      {query.isPending ? (
        <Skeleton count={3} height="10rem" label="Cargando cuentas" />
      ) : null}

      {query.isError ? (
        <ErrorState
          message="No pudimos cargar tus cuentas. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.data && query.data.length === 0 && panel?.mode !== "create" ? (
        <EmptyState
          message="Todavía no tenés cuentas. Creá la primera para saber en todo momento dónde está tu plata."
          action={{
            label: "Crear cuenta",
            onClick: () => setPanel({ mode: "create" }),
          }}
        />
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className={styles.grid}>
          {query.data.map((account) => (
            <li key={account.id} className={styles.gridItem}>
              <AccountCard
                account={account}
                balance={balances.data?.[account.id] ?? null}
                balanceLoading={balances.isPending}
                balanceError={balances.isError}
                isDefault={account.id === defaultAccountId}
                onMakeDefault={() => makeDefault(account.id)}
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
  isDefault,
  onMakeDefault,
  onRetryBalance,
  onEdit,
  onChanged,
}: {
  account: Account;
  balance: string | null;
  balanceLoading: boolean;
  balanceError: boolean;
  isDefault: boolean;
  onMakeDefault: () => void;
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
    <FinancialCard className={styles.card}>
      <header className={styles.cardHeader}>
        <span className={styles.typeIcon} aria-hidden="true">
          <AccountTypeIcon type={account.type} />
        </span>
        <div className={styles.cardHeading}>
          <h2 className={styles.cardTitle}>{account.name}</h2>
          <p className={styles.tags}>
            <span className={styles.typeTag}>{accountTypeLabel(account.type)}</span>
            <span className={styles.currencyTag}>{account.currency}</span>
          </p>
        </div>
        <StatusBadge
          label={account.isActive ? "Activa" : "Inactiva"}
          tone={account.isActive ? "active" : "inactive"}
        />
      </header>

      <div className={styles.balanceBlock}>
        <p className={styles.balanceLabel}>Saldo</p>
        {balanceLoading ? <Skeleton height="1.6rem" label="Cargando saldo" /> : null}
        {balanceError ? (
          <div className={styles.inlineError}>
            <p>No pudimos cargar el saldo.</p>
            <button type="button" className={styles.retry} onClick={onRetryBalance}>
              Reintentar
            </button>
          </div>
        ) : null}
        {balance !== null ? (
          <Money
            amount={balance}
            currency={account.currency}
            className={styles.balance}
          />
        ) : null}
      </div>

      {isDefault ? (
        <div className={styles.defaultRow}>
          <StatusBadge label="Predeterminada" tone="primary" />
        </div>
      ) : null}

      {toggle.isError ? (
        <p className={styles.formError} role="alert">
          {accountFormError(toggle.error)}
        </p>
      ) : null}

      <div className={styles.actions}>
        {!isDefault && account.isActive ? (
          <button type="button" className={styles.secondary} onClick={onMakeDefault}>
            Usar al registrar
          </button>
        ) : null}
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
    </FinancialCard>
  );
}

const ACCOUNT_TYPE_ICON_PATHS: Record<AccountType, string> = {
  BANK: "M12 3 2 8v2h20V8L12 3Zm-8 9v6H2v2h20v-2h-2v-6h-2v6h-3v-6h-2v6H9v-6H4Z",
  CASH: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  FUND: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Zm8 6.4V12c0 1.7-3.6 3-8 3s-8-1.3-8-3V9.4C5.6 10.4 8.6 11 12 11s6.4-.6 8-1.6Zm0 5V17c0 1.7-3.6 3-8 3s-8-1.3-8-3v-2.6C5.6 15.4 8.6 16 12 16s6.4-.6 8-1.6Z",
  INVESTMENT: "M6 20H3V10h3v10Zm5 0H8V4h3v16Zm5 0h-3v-7h3v7Zm5 0h-3V7h3v13Z",
  HOUSING_RESERVE: "M12 3 2 11h3v10h6v-6h2v6h6V11h3L12 3Z",
  OTHER:
    "M4 5h13a2 2 0 0 1 2 2v1h2v8h-2v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm12 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
};

function AccountTypeIcon({ type }: { type: AccountType | undefined }) {
  const path = ACCOUNT_TYPE_ICON_PATHS[type ?? "OTHER"];
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
      <path fill="currentColor" fillRule="evenodd" d={path} />
    </svg>
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
