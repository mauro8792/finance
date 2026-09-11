"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import {
  activateAccount,
  createAccount,
  deactivateAccount,
  getAccountBalance,
  getAccounts,
  reconcileAccountBalance,
  updateAccount,
} from "../lib/api";
import {
  ACCOUNT_TYPES,
  accountFormError,
  accountTypeLabel,
} from "../lib/accounts";
import { getDefaultAccountId, setDefaultAccountId } from "../lib/default-account";
import {
  isValidAmount,
  localDateTimeToIso,
  normalizeAmountInput,
  toApiAmount,
  toLocalDateTimeInput,
} from "../lib/quick-add";
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
  | { mode: "edit"; account: Account }
  | { mode: "reconcile"; account: Account; balance: string };

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
        actions={
          <>
            <button
              type="button"
              className={styles.headerCta}
              onClick={() => setPanel({ mode: "create" })}
            >
              Nueva cuenta
            </button>
            <PrivacyToggle />
          </>
        }
      />

      {panel?.mode === "create" || panel?.mode === "edit" ? (
        <AccountForm
          panel={panel}
          onClose={() => setPanel(null)}
          onSaved={async () => {
            await refreshAccounts();
            setPanel(null);
          }}
        />
      ) : null}

      {panel?.mode === "reconcile" ? (
        <ReconcileBalanceForm
          account={panel.account}
          calculatedBalance={panel.balance}
          onClose={() => setPanel(null)}
          onSaved={async () => {
            await refreshAccounts();
            setPanel(null);
          }}
        />
      ) : null}

      {query.isPending ? (
        <Skeleton count={3} height="5rem" label="Cargando cuentas" />
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
          message="Todavía no tenés cuentas."
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
                onReconcile={() => {
                  const balance = balances.data?.[account.id];
                  if (balance == null) {
                    return;
                  }
                  setPanel({ mode: "reconcile", account, balance });
                }}
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
  onReconcile,
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
  onReconcile: () => void;
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
      <div className={styles.cardTop}>
        <span className={styles.typeIcon} aria-hidden="true">
          <AccountTypeIcon type={account.type} />
        </span>
        <div className={styles.cardHeading}>
          <h2 className={styles.cardTitle}>{account.name}</h2>
          <p className={styles.tags}>
            <span className={styles.typeTag}>{accountTypeLabel(account.type)}</span>
            <span className={styles.metaDot} aria-hidden="true">
              ·
            </span>
            <span className={styles.currencyTag}>{account.currency}</span>
            <StatusBadge
              label={account.isActive ? "Activa" : "Inactiva"}
              tone={account.isActive ? "active" : "inactive"}
            />
            {isDefault ? <StatusBadge label="Predeterminada" tone="primary" /> : null}
          </p>
        </div>
        <div className={styles.balanceBlock}>
          {balanceLoading ? (
            <Skeleton height="1.1rem" label="Cargando saldo" className={styles.balanceSkeleton} />
          ) : null}
          {balance !== null ? (
            <Money
              amount={balance}
              currency={account.currency}
              className={styles.balance}
            />
          ) : null}
        </div>
      </div>

      {balanceError ? (
        <div className={styles.inlineError}>
          <p>No pudimos cargar el saldo.</p>
          <button type="button" className={styles.retry} onClick={onRetryBalance}>
            Reintentar
          </button>
        </div>
      ) : null}

      {toggle.isError ? (
        <p className={styles.formError} role="alert">
          {accountFormError(toggle.error)}
        </p>
      ) : null}

      <div className={styles.actions}>
        {!isDefault && account.isActive ? (
          <button type="button" className={styles.linkAction} onClick={onMakeDefault}>
            Usar al registrar
          </button>
        ) : null}
        <button type="button" className={styles.linkAction} onClick={onEdit}>
          Editar
        </button>
        {account.isActive && balance !== null ? (
          <button type="button" className={styles.linkAction} onClick={onReconcile}>
            Conciliar saldo
          </button>
        ) : null}
        <button
          type="button"
          className={styles.linkAction}
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
  panel: Extract<Panel, { mode: "create" } | { mode: "edit" }>;
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

function formatSignedDiff(calculated: string, observed: string): string {
  const calc = Number(calculated);
  const obs = Number(observed);
  if (!Number.isFinite(calc) || !Number.isFinite(obs)) {
    return "—";
  }
  const value = Math.round((obs - calc) * 100) / 100;
  const abs = Math.abs(value).toFixed(2);
  if (value === 0) {
    return "0.00";
  }
  return value > 0 ? `+${abs}` : `-${abs}`;
}

function ReconcileBalanceForm({
  account,
  calculatedBalance,
  onClose,
  onSaved,
}: {
  account: Account;
  calculatedBalance: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [observed, setObserved] = useState(calculatedBalance);
  const [reason, setReason] = useState(
    "Corrección de saldo inicial / conciliación con banco"
  );
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const normalized = normalizeAmountInput(observed);
      const observedBalance =
        normalized === "0" || normalized === "0.0" || normalized === "0.00"
          ? "0.00"
          : toApiAmount(observed);
      return reconcileAccountBalance(account.id, {
        observedBalance,
        reason: reason.trim(),
        occurredAt: localDateTimeToIso(occurredAt),
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      await onSaved();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeAmountInput(observed);
    const allowZero = normalized === "0" || normalized === "0.0" || normalized === "0.00";
    if (!allowZero && !isValidAmount(observed)) {
      setLocalError("Ingresá un saldo real válido.");
      return;
    }
    if (!reason.trim()) {
      setLocalError("El motivo es obligatorio.");
      return;
    }
    if (!confirmed) {
      setLocalError("Confirmá la conciliación para continuar.");
      return;
    }
    setLocalError(null);
    mutation.mutate();
  }

  const observedApi = (() => {
    const normalized = normalizeAmountInput(observed);
    if (normalized === "0" || normalized === "0.0" || normalized === "0.00") {
      return "0.00";
    }
    try {
      return toApiAmount(observed);
    } catch {
      return null;
    }
  })();

  const diffLabel =
    observedApi != null ? formatSignedDiff(calculatedBalance, observedApi) : "—";

  const errorMessage =
    localError ?? (mutation.isError ? accountFormError(mutation.error) : null);

  return (
    <form className={styles.form} onSubmit={onSubmit} aria-busy={mutation.isPending}>
      <h2 className={styles.formTitle}>Conciliar saldo</h2>
      <p className={styles.formHint}>
        Cuenta: {account.name} ({account.currency})
      </p>
      <p className={styles.formHint}>
        Saldo calculado actual:{" "}
        <Money amount={calculatedBalance} currency={account.currency} />
      </p>
      <label className={styles.field}>
        Saldo real
        <input
          type="text"
          inputMode="decimal"
          value={observed}
          onChange={(event) => setObserved(event.target.value)}
          autoComplete="off"
        />
      </label>
      <p className={styles.formHint}>Diferencia: {diffLabel}</p>
      <label className={styles.field}>
        Motivo
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label className={styles.field}>
        Fecha
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </label>
      <p className={styles.formHint} role="note">
        Esta operación ajusta el saldo de la cuenta. No se registrará como gasto ni ingreso.
      </p>
      <label className={styles.field}>
        <span>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{" "}
          Confirmo la conciliación
        </span>
      </label>
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
          {mutation.isPending ? "Conciliando..." : "Confirmar conciliación"}
        </button>
      </div>
    </form>
  );
}
