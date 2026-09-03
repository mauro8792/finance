"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import {
  createCurrencyExchange,
  createTransfer,
  getAccountBalance,
  getAccounts,
} from "../lib/api";
import { formatMoney } from "../lib/format-money";
import {
  filterActiveAccounts,
  isValidAmount,
  localDateTimeToIso,
  toApiAmount,
  toLocalDateTimeInput,
} from "../lib/quick-add";
import {
  destinationAccountsForExchange,
  destinationAccountsForTransfer,
  isValidExchangeRate,
  moveFormError,
  previewExchangeToAmount,
  toApiExchangeRate,
  type MoveKind,
} from "../lib/transfers";
import type { Account } from "../lib/types";
import { EmptyState, ErrorState } from "./QueryStatus";
import styles from "./Transfers.module.css";

export function TransfersPage() {
  const [kind, setKind] = useState<MoveKind>("TRANSFER");
  const query = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });

  return (
    <section className={styles.page} aria-labelledby="transfers-title">
      <header className={styles.intro}>
        <p className={styles.kicker}>Mover dinero</p>
        <h1 id="transfers-title" className={styles.title}>
          Mover dinero
        </h1>
        <p className={styles.lead}>
          Transferí entre tus cuentas o registrá un cambio de moneda.
        </p>
      </header>

      <div className={styles.modes} role="group" aria-label="Tipo de operación">
        <button
          type="button"
          className={kind === "TRANSFER" ? styles.modeActive : styles.mode}
          onClick={() => setKind("TRANSFER")}
        >
          Transferencia
        </button>
        <button
          type="button"
          className={kind === "CURRENCY_EXCHANGE" ? styles.modeActive : styles.mode}
          onClick={() => setKind("CURRENCY_EXCHANGE")}
        >
          Cambio de moneda
        </button>
      </div>

      {query.isPending ? (
        <div className={styles.skeletonBlock} aria-busy="true" aria-label="Cargando cuentas" />
      ) : null}

      {query.isError ? (
        <ErrorState
          message="No pudimos cargar tus cuentas. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.data ? (
        filterActiveAccounts(query.data).length === 0 ? (
          <EmptyState
            message="Necesitás al menos una cuenta activa para mover dinero."
            action={{ href: "/accounts", label: "Ir a Cuentas" }}
          />
        ) : kind === "TRANSFER" ? (
          <TransferForm accounts={query.data} />
        ) : (
          <ExchangeForm accounts={query.data} />
        )
      ) : null}
    </section>
  );
}

function TransferForm({ accounts }: { accounts: Account[] }) {
  const active = filterActiveAccounts(accounts);
  const [sourceId, setSourceId] = useState(active[0]?.id ?? "");
  const destinations = destinationAccountsForTransfer(accounts, sourceId);
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [success, setSuccess] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const source = accounts.find((item) => item.id === sourceId) ?? null;

  const balance = useQuery({
    queryKey: ["account-balances", sourceId],
    enabled: Boolean(sourceId),
    queryFn: () => getAccountBalance(sourceId),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!isValidAmount(amount)) {
        throw new Error("El importe no es válido.");
      }
      if (!sourceId || !destinationId || sourceId === destinationId) {
        throw new Error("Elegí dos cuentas distintas de la misma moneda.");
      }
      return createTransfer({
        sourceAccountId: sourceId,
        destinationAccountId: destinationId,
        amount: toApiAmount(amount),
        occurredAt: localDateTimeToIso(occurredAt),
      });
    },
    onSuccess: async (result) => {
      await invalidateAfterMove(queryClient);
      setSuccess(
        `Transferencia registrada: ${formatMoney(result.out.amount, result.out.currency)}.`
      );
    },
  });

  function onSourceChange(id: string) {
    setSourceId(id);
    const next = destinationAccountsForTransfer(accounts, id);
    setDestinationId((current) =>
      next.some((item) => item.id === current) ? current : (next[0]?.id ?? "")
    );
    setSuccess(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccess(null);
    save.mutate();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.field}>
        Cuenta origen
        <select
          aria-label="Cuenta origen"
          value={sourceId}
          onChange={(event) => onSourceChange(event.target.value)}
        >
          {active.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.currency}
            </option>
          ))}
        </select>
      </label>
      {source && balance.data ? (
        <p className={styles.balance}>
          Disponible: {formatMoney(balance.data.balance, source.currency)}
        </p>
      ) : null}
      <label className={styles.field}>
        Cuenta destino
        <select
          aria-label="Cuenta destino"
          value={destinationId}
          onChange={(event) => setDestinationId(event.target.value)}
        >
          {destinations.length === 0 ? (
            <option value="">No hay otra cuenta activa en {source?.currency}</option>
          ) : (
            destinations.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency}
              </option>
            ))
          )}
        </select>
      </label>
      <label className={styles.field}>
        Importe
        <input
          aria-label="Importe"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
        />
      </label>
      <label className={styles.field}>
        Fecha
        <input
          aria-label="Fecha"
          type="datetime-local"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </label>
      {save.isError ? <p className={styles.formError}>{moveFormError(save.error)}</p> : null}
      {success ? (
        <div className={styles.success}>
          <p>{success}</p>
        </div>
      ) : null}
      <button
        type="submit"
        className={styles.primaryCta}
        disabled={save.isPending || destinations.length === 0}
      >
        Transferir
      </button>
    </form>
  );
}

function ExchangeForm({ accounts }: { accounts: Account[] }) {
  const active = filterActiveAccounts(accounts);
  const [sourceId, setSourceId] = useState(active[0]?.id ?? "");
  const destinations = destinationAccountsForExchange(accounts, sourceId);
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");
  const [fromAmount, setFromAmount] = useState("");
  const [rate, setRate] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [success, setSuccess] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const source = accounts.find((item) => item.id === sourceId) ?? null;
  const destination = accounts.find((item) => item.id === destinationId) ?? null;

  const balance = useQuery({
    queryKey: ["account-balances", sourceId],
    enabled: Boolean(sourceId),
    queryFn: () => getAccountBalance(sourceId),
  });

  const preview = useMemo(() => {
    if (!source || !destination || !isValidAmount(fromAmount) || !isValidExchangeRate(rate)) {
      return null;
    }
    return previewExchangeToAmount(
      source.currency,
      destination.currency,
      toApiAmount(fromAmount),
      toApiExchangeRate(rate)
    );
  }, [destination, fromAmount, rate, source]);

  const save = useMutation({
    mutationFn: () => {
      if (!isValidAmount(fromAmount) || !isValidExchangeRate(rate)) {
        throw new Error("Revisá el importe y la cotización.");
      }
      if (!sourceId || !destinationId || sourceId === destinationId) {
        throw new Error("Elegí cuentas de distinta moneda.");
      }
      return createCurrencyExchange({
        fromAccountId: sourceId,
        toAccountId: destinationId,
        fromAmount: toApiAmount(fromAmount),
        exchangeRate: toApiExchangeRate(rate),
        occurredAt: localDateTimeToIso(occurredAt),
      });
    },
    onSuccess: async (result) => {
      await invalidateAfterMove(queryClient);
      setSuccess(
        `Cambio registrado: entregaste ${formatMoney(result.exchange.fromAmount, result.exchange.fromCurrency)} y recibiste ${formatMoney(result.exchange.toAmount, result.exchange.toCurrency)}.`
      );
    },
  });

  function onSourceChange(id: string) {
    setSourceId(id);
    const next = destinationAccountsForExchange(accounts, id);
    setDestinationId((current) =>
      next.some((item) => item.id === current) ? current : (next[0]?.id ?? "")
    );
    setSuccess(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccess(null);
    save.mutate();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.field}>
        Cuenta origen
        <select
          aria-label="Cuenta origen"
          value={sourceId}
          onChange={(event) => onSourceChange(event.target.value)}
        >
          {active.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.currency}
            </option>
          ))}
        </select>
      </label>
      {source && balance.data ? (
        <p className={styles.balance}>
          Disponible: {formatMoney(balance.data.balance, source.currency)}
        </p>
      ) : null}
      <label className={styles.field}>
        Cuenta destino
        <select
          aria-label="Cuenta destino"
          value={destinationId}
          onChange={(event) => setDestinationId(event.target.value)}
        >
          {destinations.length === 0 ? (
            <option value="">No hay una cuenta activa de otra moneda</option>
          ) : (
            destinations.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency}
              </option>
            ))
          )}
        </select>
      </label>
      <label className={styles.field}>
        Importe origen
        <input
          aria-label="Importe origen"
          value={fromAmount}
          onChange={(event) => setFromAmount(event.target.value)}
          inputMode="decimal"
        />
      </label>
      <label className={styles.field}>
        Cotización ARS por USD
        <input
          aria-label="Cotización ARS por USD"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          inputMode="decimal"
        />
      </label>
      <p className={styles.hint}>ARS necesarios por cada USD 1.</p>
      {source && destination && preview ? (
        <div className={styles.preview}>
          <p className={styles.previewTitle}>Vista previa</p>
          <div className={styles.previewRow}>
            <p className={styles.previewLabel}>Entregás</p>
            <p>{formatMoney(toApiAmount(fromAmount), source.currency)}</p>
          </div>
          <div className={styles.previewRow}>
            <p className={styles.previewLabel}>Recibís</p>
            <p>{formatMoney(preview, destination.currency)}</p>
          </div>
          <p className={styles.hint}>
            Cotización ARS {rate || "—"} por USD 1. El backend confirma el importe final.
          </p>
        </div>
      ) : null}
      {save.isError ? <p className={styles.formError}>{moveFormError(save.error)}</p> : null}
      {success ? (
        <div className={styles.success}>
          <p>{success}</p>
        </div>
      ) : null}
      <button
        type="submit"
        className={styles.primaryCta}
        disabled={save.isPending || destinations.length === 0}
      >
        Registrar cambio
      </button>
    </form>
  );
}

async function invalidateAfterMove(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["account-balances"] }),
    queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["housing"] }),
  ]);
}
