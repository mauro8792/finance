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
import type { Account, Currency } from "../lib/types";
import { PrivacyToggle } from "./PrivacyToggle";
import { EmptyState, ErrorState } from "./QueryStatus";
import { Money } from "./ui/Money";
import { PageHeader } from "./ui/PageHeader";
import { Skeleton } from "./ui/Skeleton";
import styles from "./Transfers.module.css";

export function TransfersPage() {
  const [kind, setKind] = useState<MoveKind>("TRANSFER");
  const query = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });

  return (
    <section className={styles.page} aria-label="Mover dinero">
      <PageHeader
        kicker="Mover dinero"
        title="Mover dinero"
        description="Transferí entre tus cuentas o registrá un cambio de moneda."
        actions={<PrivacyToggle />}
      />

      <div className={styles.modes} role="group" aria-label="Tipo de operación">
        <button
          type="button"
          className={kind === "TRANSFER" ? styles.modeActive : styles.mode}
          aria-pressed={kind === "TRANSFER"}
          onClick={() => setKind("TRANSFER")}
        >
          Transferencia
        </button>
        <button
          type="button"
          className={kind === "CURRENCY_EXCHANGE" ? styles.modeActive : styles.mode}
          aria-pressed={kind === "CURRENCY_EXCHANGE"}
          onClick={() => setKind("CURRENCY_EXCHANGE")}
        >
          Cambio de moneda
        </button>
      </div>

      <p className={styles.modeHint}>
        {kind === "TRANSFER"
          ? "Misma moneda: el dinero cambia de cuenta y el total no se mueve."
          : "Distinta moneda: entregás en una moneda y recibís en la otra a la cotización que cargues."}
      </p>

      {query.isPending ? (
        <Skeleton count={1} height="14rem" label="Cargando cuentas" />
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

type TransferSuccess = {
  amount: string;
  currency: Currency;
  destination: string;
};

function TransferForm({ accounts }: { accounts: Account[] }) {
  const active = filterActiveAccounts(accounts);
  const [sourceId, setSourceId] = useState(active[0]?.id ?? "");
  const destinations = destinationAccountsForTransfer(accounts, sourceId);
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [success, setSuccess] = useState<TransferSuccess | null>(null);
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
        idempotencyKey: crypto.randomUUID(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
    },
    onSuccess: async (result) => {
      await invalidateAfterMove(queryClient);
      const destination = accounts.find((item) => item.id === destinationId);
      setSuccess({
        amount: result.out.amount,
        currency: result.out.currency,
        destination: destination?.name ?? "la cuenta destino",
      });
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
      <div className={styles.flow}>
        <div className={styles.flowStep}>
          <p className={styles.flowCaption}>Desde</p>
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
              Disponible:{" "}
              <Money
                amount={balance.data.balance}
                currency={source.currency}
                className={styles.balanceValue}
              />
            </p>
          ) : null}
        </div>

        <span className={styles.flowArrow} aria-hidden="true">
          ↓
        </span>

        <div className={styles.flowStep}>
          <p className={styles.flowCaption}>Hacia</p>
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
        </div>
      </div>

      <div className={styles.row}>
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
      </div>

      <label className={styles.field}>
        Descripción (opcional)
        <input
          aria-label="Descripción"
          maxLength={255}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {save.isError ? <p className={styles.formError}>{moveFormError(save.error)}</p> : null}
      {success ? (
        <div className={styles.success}>
          <p className={styles.successTitle}>Transferencia registrada</p>
          <p className={styles.successDetail}>
            Moviste{" "}
            <Money amount={success.amount} currency={success.currency} /> a{" "}
            {success.destination}.
          </p>
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

type ExchangeSuccess = {
  fromAmount: string;
  fromCurrency: Currency;
  toAmount: string;
  toCurrency: Currency;
};

function ExchangeForm({ accounts }: { accounts: Account[] }) {
  const active = filterActiveAccounts(accounts);
  const [sourceId, setSourceId] = useState(active[0]?.id ?? "");
  const destinations = destinationAccountsForExchange(accounts, sourceId);
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");
  const [fromAmount, setFromAmount] = useState("");
  const [rate, setRate] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [success, setSuccess] = useState<ExchangeSuccess | null>(null);
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
      setSuccess({
        fromAmount: result.exchange.fromAmount,
        fromCurrency: result.exchange.fromCurrency,
        toAmount: result.exchange.toAmount,
        toCurrency: result.exchange.toCurrency,
      });
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
      <div className={styles.flow}>
        <div className={styles.flowStep}>
          <p className={styles.flowCaption}>Desde</p>
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
              Disponible:{" "}
              <Money
                amount={balance.data.balance}
                currency={source.currency}
                className={styles.balanceValue}
              />
            </p>
          ) : null}
        </div>

        <span className={styles.flowArrow} aria-hidden="true">
          ↓
        </span>

        <div className={styles.flowStep}>
          <p className={styles.flowCaption}>Hacia</p>
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
        </div>
      </div>

      <div className={styles.row}>
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
      </div>
      <p className={styles.hint}>ARS necesarios por cada USD 1.</p>
      <label className={styles.field}>
        Fecha
        <input
          aria-label="Fecha"
          type="datetime-local"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </label>
      {source && destination && preview ? (
        <div className={styles.preview}>
          <p className={styles.previewTitle}>Vista previa</p>
          <div className={styles.previewRow}>
            <p className={styles.previewLabel}>Entregás</p>
            <Money amount={toApiAmount(fromAmount)} currency={source.currency} />
          </div>
          <div className={styles.previewRow}>
            <p className={styles.previewLabel}>Recibís</p>
            <Money amount={preview} currency={destination.currency} />
          </div>
          <p className={styles.hint}>
            Cotización ARS {rate || "—"} por USD 1. El backend confirma el importe final.
          </p>
        </div>
      ) : null}
      {save.isError ? <p className={styles.formError}>{moveFormError(save.error)}</p> : null}
      {success ? (
        <div className={styles.success}>
          <p className={styles.successTitle}>Cambio registrado</p>
          <p className={styles.successDetail}>
            Entregaste <Money amount={success.fromAmount} currency={success.fromCurrency} /> y
            recibiste <Money amount={success.toAmount} currency={success.toCurrency} />.
          </p>
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
