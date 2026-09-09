"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import {
  createInvestment,
  getAccounts,
  getInvestments,
  matureInvestment,
  renewInvestment,
  updateActiveInvestment,
} from "../lib/api";
import { amountToCents, formatMoney } from "../lib/format-money";
import {
  accountsForInvestmentCurrency,
  addAmounts,
  artDateToIso,
  calendarDaysBetweenDateOnly,
  estimateExpectedReturn,
  formatAnnualRatePercent,
  formatArtDate,
  groupInvestments,
  INVESTMENT_STATUS_LABELS,
  INVESTMENT_TYPE_LABELS,
  investmentFormError,
  isNonNegativeAmount,
  isoToArtDateInput,
  percentToAnnualRate,
} from "../lib/investments";
import {
  isValidAmount,
  normalizeAmountInput,
  toApiAmount,
} from "../lib/quick-add";
import type { Account, Currency, Investment } from "../lib/types";
import { EmptyState, ErrorState } from "./QueryStatus";
import styles from "./Investments.module.css";

type Panel =
  | { mode: "create" }
  | { mode: "edit"; investment: Investment }
  | { mode: "mature"; investment: Investment }
  | { mode: "renew"; investment: Investment };

export function InvestmentsPage() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const query = useQuery({
    queryKey: ["investments"],
    queryFn: getInvestments,
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });
  const grouped = groupInvestments(query.data ?? []);

  return (
    <section className={styles.page} aria-labelledby="investments-title">
      <header className={styles.intro}>
        <p className={styles.kicker}>Inversiones</p>
        <h1 id="investments-title" className={styles.title}>
          Cauciones
        </h1>
        <p className={styles.lead}>Activas, vencimientos y finalizadas.</p>
        <button
          type="button"
          className={styles.primaryCta}
          onClick={() => setPanel({ mode: "create" })}
        >
          Nueva caución
        </button>
      </header>

      {panel?.mode === "create" ? (
        <CreateInvestmentForm
          accounts={accountsQuery.data ?? []}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {panel?.mode === "edit" ? (
        <EditInvestmentForm
          investment={panel.investment}
          accounts={accountsQuery.data ?? []}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {query.isPending ? <InvestmentsSkeleton /> : null}

      {query.isError ? (
        <ErrorState
          message="No pudimos cargar tus inversiones. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.data && query.data.length === 0 && panel?.mode !== "create" ? (
        <EmptyState
          message="Aún no registraste inversiones."
          action={{ label: "Crear inversión", onClick: () => setPanel({ mode: "create" }) }}
        />
      ) : null}

      {query.data && query.data.length > 0 ? (
        <>
          {grouped.upcoming.length > 0 ? (
            <section className={styles.section} aria-labelledby="upcoming-title">
              <h2 id="upcoming-title" className={styles.sectionTitle}>
                Próximos vencimientos
              </h2>
              <ul className={styles.upcoming}>
                {grouped.upcoming.map((item) => (
                  <li key={item.id}>
                    <span>{INVESTMENT_TYPE_LABELS[item.type]}</span>
                    <strong>{formatMoney(item.principal, item.currency)}</strong>
                    <time dateTime={item.maturityDate ?? undefined}>
                      {item.maturityDate ? formatArtDate(item.maturityDate) : "—"}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {grouped.active.length > 0 ? (
            <section className={styles.section} aria-labelledby="active-title">
              <h2 id="active-title" className={styles.sectionTitle}>
                Activas
              </h2>
              <ul className={styles.grid}>
                {grouped.active.map((item) => (
                  <li key={item.id}>
                    <InvestmentCard
                      investment={item}
                      accounts={accountsQuery.data ?? []}
                      panel={panel}
                      onMature={() => setPanel({ mode: "mature", investment: item })}
                      onRenew={() => setPanel({ mode: "renew", investment: item })}
                      onEdit={() => setPanel({ mode: "edit", investment: item })}
                      onClosePanel={() => setPanel(null)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {grouped.finished.length > 0 ? (
            <section className={styles.section} aria-labelledby="finished-title">
              <h2 id="finished-title" className={styles.sectionTitle}>
                Finalizadas
              </h2>
              <ul className={styles.grid}>
                {grouped.finished.map((item) => (
                  <li key={item.id}>
                    <InvestmentCard
                      investment={item}
                      accounts={accountsQuery.data ?? []}
                      panel={panel}
                      onMature={() => setPanel({ mode: "mature", investment: item })}
                      onRenew={() => setPanel({ mode: "renew", investment: item })}
                      onClosePanel={() => setPanel(null)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {grouped.drafts.length > 0 ? (
            <section className={styles.section} aria-labelledby="drafts-title">
              <h2 id="drafts-title" className={styles.sectionTitle}>
                Borradores
              </h2>
              <ul className={styles.grid}>
                {grouped.drafts.map((item) => (
                  <li key={item.id}>
                    <InvestmentCard
                      investment={item}
                      accounts={accountsQuery.data ?? []}
                      panel={panel}
                      onMature={() => undefined}
                      onRenew={() => undefined}
                      onClosePanel={() => setPanel(null)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function InvestmentCard({
  investment,
  accounts,
  panel,
  onMature,
  onRenew,
  onEdit,
  onClosePanel,
}: {
  investment: Investment;
  accounts: Account[];
  panel: Panel | null;
  onMature: () => void;
  onRenew: () => void;
  onEdit?: () => void;
  onClosePanel: () => void;
}) {
  const account = accounts.find((item) => item.id === investment.accountId);
  const isActive = investment.status === "ACTIVE";
  const showMature = panel?.mode === "mature" && panel.investment.id === investment.id;
  const showRenew = panel?.mode === "renew" && panel.investment.id === investment.id;

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{INVESTMENT_TYPE_LABELS[investment.type]}</h3>
          <p className={styles.currency}>{investment.currency}</p>
        </div>
        <span className={statusClass(investment.status)}>
          {INVESTMENT_STATUS_LABELS[investment.status]}
        </span>
      </header>

      <div className={styles.cardLayout}>
        <dl className={styles.meta}>
          <div>
            <dt>Capital</dt>
            <dd>{formatMoney(investment.principal, investment.currency)}</dd>
          </div>
          <div>
            <dt>TNA</dt>
            <dd>{investment.annualRate ? formatAnnualRatePercent(investment.annualRate) : "—"}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>
              <time dateTime={investment.startDate}>{formatArtDate(investment.startDate)}</time>
            </dd>
          </div>
          <div>
            <dt>Vencimiento</dt>
            <dd>
              {investment.maturityDate ? (
                <time dateTime={investment.maturityDate}>
                  {formatArtDate(investment.maturityDate)}
                </time>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Rendimiento esperado</dt>
            <dd>
              {investment.expectedReturn
                ? formatMoney(investment.expectedReturn, investment.currency)
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Interés real</dt>
            <dd>
              {investment.actualReturn
                ? formatMoney(investment.actualReturn, investment.currency)
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Cuenta origen</dt>
            <dd>{account?.name ?? "Cuenta no disponible"}</dd>
          </div>
        </dl>

        <div className={styles.side}>
          {investment.notes ? <p className={styles.notes}>{investment.notes}</p> : null}
          {investment.renewedFromInvestmentId ? (
            <p className={styles.relation}>Renovada desde una inversión anterior</p>
          ) : null}

          {isActive ? (
            <div className={styles.actions}>
              <button type="button" className={styles.primaryCta} onClick={onMature}>
                Registrar vencimiento
              </button>
              <button type="button" className={styles.secondary} onClick={onRenew}>
                Renovar
              </button>
              {onEdit ? (
                <button type="button" className={styles.secondary} onClick={onEdit}>
                  Editar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {showMature ? (
        <MatureInvestmentForm
          investment={investment}
          accounts={accounts}
          onClose={onClosePanel}
        />
      ) : null}
      {showRenew ? (
        <RenewInvestmentForm
          investment={investment}
          accounts={accounts}
          onClose={onClosePanel}
        />
      ) : null}
    </article>
  );
}

function CreateInvestmentForm({
  accounts,
  onClose,
}: {
  accounts: Account[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [accountId, setAccountId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [annualRatePercent, setAnnualRatePercent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const compatible = accountsForInvestmentCurrency(accounts, currency);

  const preview = useMemo(() => {
    const rate = percentToAnnualRate(annualRatePercent);
    if (!rate || !isValidAmount(principal) || !startDate || !maturityDate) {
      return null;
    }
    const days = calendarDaysBetweenDateOnly(startDate, maturityDate);
    if (days === null || days < 0) {
      return null;
    }
    const estimated = estimateExpectedReturn(toApiAmount(principal), rate, days);
    if (!estimated) {
      return null;
    }
    return { days, estimated, finalAmount: addAmounts(toApiAmount(principal), estimated) };
  }, [annualRatePercent, principal, startDate, maturityDate]);

  const mutation = useMutation({
    mutationFn: createInvestment,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
      ]);
      onClose();
    },
  });

  function onCurrencyChange(next: Currency) {
    setCurrency(next);
    const nextAccounts = accountsForInvestmentCurrency(accounts, next);
    if (!nextAccounts.some((item) => item.id === accountId)) {
      setAccountId("");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const rate = percentToAnnualRate(annualRatePercent);
    const startIso = artDateToIso(startDate);
    const maturityIso = artDateToIso(maturityDate);
    if (!accountId) {
      setLocalError("Elegí una cuenta origen.");
      return;
    }
    if (!isValidAmount(principal)) {
      setLocalError("El capital debe ser mayor que 0.");
      return;
    }
    if (!rate) {
      setLocalError("La tasa anual debe ser 0 o más.");
      return;
    }
    if (!startIso || !maturityIso) {
      setLocalError("Completá las fechas de inicio y vencimiento.");
      return;
    }
    const days = calendarDaysBetweenDateOnly(startDate, maturityDate);
    if (days === null || days < 0) {
      setLocalError("El vencimiento no puede ser anterior al inicio.");
      return;
    }
    mutation.mutate({
      accountId,
      currency,
      principal: toApiAmount(principal),
      annualRate: rate,
      startDate: startIso,
      maturityDate: maturityIso,
      notes: notes.trim() ? notes.trim() : undefined,
    });
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h2 className={styles.formTitle}>Nueva caución</h2>
      <label className={styles.field}>
        Moneda
        <select
          value={currency}
          onChange={(event) => onCurrencyChange(event.target.value as Currency)}
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className={styles.field}>
        Cuenta origen
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Elegí una cuenta</option>
          {compatible.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Capital
        <input
          inputMode="decimal"
          value={principal}
          onChange={(event) => setPrincipal(normalizeAmountInput(event.target.value))}
        />
      </label>
      <label className={styles.field}>
        Tasa anual (%)
        <input
          inputMode="decimal"
          value={annualRatePercent}
          onChange={(event) => setAnnualRatePercent(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Fecha inicio
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      </label>
      <label className={styles.field}>
        Fecha vencimiento
        <input
          type="date"
          value={maturityDate}
          onChange={(event) => setMaturityDate(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Notas
        <input value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {preview ? (
        <div className={styles.preview}>
          <p>Días: {preview.days}</p>
          <p>Interés estimado: {formatMoney(preview.estimated, currency)}</p>
          <p>Monto estimado final: {formatMoney(preview.finalAmount, currency)}</p>
          <p className={styles.formHint}>Estimado visual. El valor guardado lo calcula el servidor.</p>
        </div>
      ) : null}
      {localError || mutation.isError ? (
        <p className={styles.formError} role="alert">
          {localError ?? investmentFormError(mutation.error)}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryCta} disabled={mutation.isPending}>
          Guardar
        </button>
      </div>
    </form>
  );
}

function EditInvestmentForm({
  investment,
  accounts,
  onClose,
}: {
  investment: Investment;
  accounts: Account[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const account = accounts.find((item) => item.id === investment.accountId);
  const [principal, setPrincipal] = useState(investment.principal);
  const [annualRatePercent, setAnnualRatePercent] = useState(
    investment.annualRate
      ? formatAnnualRatePercent(investment.annualRate).replace(/%$/, "")
      : ""
  );
  const [startDate, setStartDate] = useState(isoToArtDateInput(investment.startDate));
  const [maturityDate, setMaturityDate] = useState(
    investment.maturityDate ? isoToArtDateInput(investment.maturityDate) : ""
  );
  const [notes, setNotes] = useState(investment.notes ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const preview = useMemo(() => {
    const rate = percentToAnnualRate(annualRatePercent);
    if (!rate || !isValidAmount(principal) || !startDate || !maturityDate) {
      return null;
    }
    const days = calendarDaysBetweenDateOnly(startDate, maturityDate);
    if (days === null || days < 0) {
      return null;
    }
    const estimated = estimateExpectedReturn(toApiAmount(principal), rate, days);
    if (!estimated) {
      return null;
    }
    return {
      days,
      estimated,
      finalAmount: addAmounts(toApiAmount(principal), estimated),
    };
  }, [annualRatePercent, principal, startDate, maturityDate]);

  const mutation = useMutation({
    mutationFn: (payload: {
      principal: string;
      annualRate: string;
      startDate: string;
      maturityDate: string;
      notes?: string | null;
    }) => updateActiveInvestment(investment.id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
      ]);
      onClose();
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const rate = percentToAnnualRate(annualRatePercent);
    const startIso = artDateToIso(startDate);
    const maturityIso = artDateToIso(maturityDate);
    if (!isValidAmount(principal)) {
      setLocalError("El capital debe ser mayor que 0.");
      return;
    }
    if (!rate) {
      setLocalError("La tasa anual debe ser 0 o más.");
      return;
    }
    if (!startIso || !maturityIso) {
      setLocalError("Completá las fechas de inicio y vencimiento.");
      return;
    }
    const days = calendarDaysBetweenDateOnly(startDate, maturityDate);
    if (days === null || days < 0) {
      setLocalError("El vencimiento no puede ser anterior al inicio.");
      return;
    }
    mutation.mutate({
      principal: toApiAmount(principal),
      annualRate: rate,
      startDate: startIso,
      maturityDate: maturityIso,
      notes: notes.trim() ? notes.trim() : null,
    });
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h2 className={styles.formTitle}>Editar caución</h2>
      <p className={styles.formHint}>
        Corrección administrativa. No crea movimientos nuevos. La cuenta origen no se
        puede cambiar.
      </p>
      <label className={styles.field}>
        Cuenta origen
        <input value={account?.name ?? "Cuenta no disponible"} disabled readOnly />
      </label>
      <label className={styles.field}>
        Capital
        <input
          inputMode="decimal"
          value={principal}
          onChange={(event) => setPrincipal(normalizeAmountInput(event.target.value))}
        />
      </label>
      <label className={styles.field}>
        Tasa anual (%)
        <input
          inputMode="decimal"
          value={annualRatePercent}
          onChange={(event) => setAnnualRatePercent(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Fecha inicio
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      </label>
      <label className={styles.field}>
        Fecha vencimiento
        <input
          type="date"
          value={maturityDate}
          onChange={(event) => setMaturityDate(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Notas
        <input value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {preview ? (
        <div className={styles.preview}>
          <p>Días: {preview.days}</p>
          <p>Interés estimado: {formatMoney(preview.estimated, investment.currency)}</p>
          <p>Monto estimado final: {formatMoney(preview.finalAmount, investment.currency)}</p>
          <p className={styles.formHint}>Estimado visual. El valor guardado lo calcula el servidor.</p>
        </div>
      ) : null}
      {localError || mutation.isError ? (
        <p className={styles.formError} role="alert">
          {localError ?? investmentFormError(mutation.error)}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryCta} disabled={mutation.isPending}>
          Guardar cambios
        </button>
      </div>
    </form>
  );
}

function MatureInvestmentForm({
  investment,
  accounts,
  onClose,
}: {
  investment: Investment;
  accounts: Account[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const compatible = accountsForInvestmentCurrency(accounts, investment.currency);
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [actualReturn, setActualReturn] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: {
      destinationAccountId: string;
      capitalReturned: string;
      actualReturn: string;
      occurredAt: string;
    }) => matureInvestment(investment.id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
      ]);
      onClose();
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const occurredIso = artDateToIso(occurredAt);
    if (!destinationAccountId) {
      setLocalError("Elegí la cuenta destino.");
      return;
    }
    if (!isNonNegativeAmount(actualReturn)) {
      setLocalError("El interés real debe ser 0 o más.");
      return;
    }
    if (!occurredIso) {
      setLocalError("Completá la fecha de la operación.");
      return;
    }
    mutation.mutate({
      destinationAccountId,
      capitalReturned: investment.principal,
      actualReturn: toApiAmount(normalizeAmountInput(actualReturn)),
      occurredAt: occurredIso,
    });
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h3 className={styles.formTitle}>Registrar vencimiento</h3>
      <p className={styles.formHint}>
        El vencimiento no puede ser anterior a{" "}
        {investment.maturityDate ? formatArtDate(investment.maturityDate) : "la fecha de vencimiento"}.
      </p>
      <p className={styles.readonly}>
        Capital retornado: {formatMoney(investment.principal, investment.currency)}
      </p>
      {investment.expectedReturn ? (
        <p className={styles.formHint}>
          Esperado: {formatMoney(investment.expectedReturn, investment.currency)}
        </p>
      ) : null}
      <label className={styles.field}>
        Cuenta destino
        <select
          value={destinationAccountId}
          onChange={(event) => setDestinationAccountId(event.target.value)}
        >
          <option value="">Elegí una cuenta</option>
          {compatible.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Interés real
        <input
          inputMode="decimal"
          value={actualReturn}
          onChange={(event) => setActualReturn(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Fecha de la operación
        <input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
      </label>
      {localError || mutation.isError ? (
        <p className={styles.formError} role="alert">
          {localError ?? investmentFormError(mutation.error)}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryCta} disabled={mutation.isPending}>
          Confirmar
        </button>
      </div>
    </form>
  );
}

function RenewInvestmentForm({
  investment,
  accounts,
  onClose,
}: {
  investment: Investment;
  accounts: Account[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const compatible = accountsForInvestmentCurrency(accounts, investment.currency);
  const [accountId, setAccountId] = useState("");
  const [renewalMode, setRenewalMode] = useState<"all" | "partial">("all");
  const [renewalPrincipal, setRenewalPrincipal] = useState(investment.principal);
  const [actualReturn, setActualReturn] = useState("");
  const [annualRatePercent, setAnnualRatePercent] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: {
      accountId: string;
      renewalPrincipal: string;
      actualReturn: string;
      annualRate: string;
      occurredAt: string;
      maturityDate: string;
      notes?: string;
    }) => renewInvestment(investment.id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
      ]);
      onClose();
    },
  });

  function chooseAll() {
    setRenewalMode("all");
    setRenewalPrincipal(investment.principal);
  }

  function choosePartial() {
    setRenewalMode("partial");
    setRenewalPrincipal("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const rate = percentToAnnualRate(annualRatePercent);
    const occurredIso = artDateToIso(occurredAt);
    const maturityIso = artDateToIso(maturityDate);
    const principal = renewalMode === "all" ? investment.principal : toApiAmount(renewalPrincipal);
    if (!accountId) {
      setLocalError("Elegí la cuenta para la renovación.");
      return;
    }
    if (!isValidAmount(principal)) {
      setLocalError("El monto a renovar debe ser mayor que 0.");
      return;
    }
    if (amountToCents(principal) > amountToCents(investment.principal)) {
      setLocalError("El monto a renovar no puede superar el principal.");
      return;
    }
    if (!isNonNegativeAmount(actualReturn)) {
      setLocalError("El interés real debe ser 0 o más.");
      return;
    }
    if (!rate) {
      setLocalError("La nueva tasa anual debe ser 0 o más.");
      return;
    }
    if (!occurredIso || !maturityIso) {
      setLocalError("Completá las fechas de la renovación.");
      return;
    }
    mutation.mutate({
      accountId,
      renewalPrincipal: toApiAmount(principal),
      actualReturn: toApiAmount(normalizeAmountInput(actualReturn)),
      annualRate: rate,
      occurredAt: occurredIso,
      maturityDate: maturityIso,
      notes: notes.trim() ? notes.trim() : undefined,
    });
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h3 className={styles.formTitle}>Renovar caución</h3>
      <p className={styles.readonly}>
        Principal actual: {formatMoney(investment.principal, investment.currency)}
      </p>
      {investment.expectedReturn ? (
        <p className={styles.formHint}>
          Esperado: {formatMoney(investment.expectedReturn, investment.currency)}
        </p>
      ) : null}
      {investment.annualRate ? (
        <p className={styles.formHint}>Tasa anterior: {formatAnnualRatePercent(investment.annualRate)}</p>
      ) : null}
      <p className={styles.formHint}>El interés no se reinvierte automáticamente.</p>
      <div className={styles.shortcuts}>
        <button
          type="button"
          className={renewalMode === "all" ? styles.shortcutActive : styles.shortcut}
          onClick={chooseAll}
        >
          Todo
        </button>
        <button
          type="button"
          className={renewalMode === "partial" ? styles.shortcutActive : styles.shortcut}
          onClick={choosePartial}
        >
          Parcial
        </button>
      </div>
      <label className={styles.field}>
        Monto a renovar
        <input
          inputMode="decimal"
          value={renewalMode === "all" ? investment.principal : renewalPrincipal}
          onChange={(event) => {
            setRenewalMode("partial");
            setRenewalPrincipal(event.target.value);
          }}
          readOnly={renewalMode === "all"}
        />
      </label>
      <label className={styles.field}>
        Cuenta para la renovación
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Elegí una cuenta</option>
          {compatible.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Interés real obtenido
        <input
          inputMode="decimal"
          value={actualReturn}
          onChange={(event) => setActualReturn(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Nueva tasa anual (%)
        <input
          inputMode="decimal"
          value={annualRatePercent}
          onChange={(event) => setAnnualRatePercent(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Fecha efectiva
        <input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
      </label>
      <label className={styles.field}>
        Nuevo vencimiento
        <input
          type="date"
          value={maturityDate}
          onChange={(event) => setMaturityDate(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Notas
        <input value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {localError || mutation.isError ? (
        <p className={styles.formError} role="alert">
          {localError ?? investmentFormError(mutation.error)}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryCta} disabled={mutation.isPending}>
          Confirmar renovación
        </button>
      </div>
    </form>
  );
}

function InvestmentsSkeleton() {
  return (
    <div className={styles.skeletonBlock} aria-busy="true">
      <span className={styles.srOnly}>Cargando inversiones</span>
    </div>
  );
}

function statusClass(status: Investment["status"]): string {
  if (status === "ACTIVE") {
    return styles.badgeActive;
  }
  if (status === "RENEWED") {
    return styles.badgeRenewed;
  }
  if (status === "MATURED") {
    return styles.badgeMatured;
  }
  if (status === "CANCELLED") {
    return styles.badgeCancelled;
  }
  return styles.badgeDraft;
}
