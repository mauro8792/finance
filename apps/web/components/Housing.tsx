"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import {
  createHousing,
  getAccounts,
  getHousing,
  getHousingCoverage,
  getHousingPayments,
  registerHousingPayment,
  updateHousing,
} from "../lib/api";
import {
  formatCoveredInstallments,
  formatMoney,
  formatPaidAt,
} from "../lib/format-money";
import {
  accountsForHousingCurrency,
  housingFormError,
  housingPaymentError,
  parseOptionalInteger,
  parseRequiredInteger,
  paymentAccountsForHousing,
} from "../lib/housing";
import {
  isValidAmount,
  localDateTimeToIso,
  normalizeAmountInput,
  toApiAmount,
  toLocalDateTimeInput,
} from "../lib/quick-add";
import type {
  Account,
  Currency,
  HousingCoverage,
  HousingObligation,
  HousingPayment,
} from "../lib/types";
import styles from "./Housing.module.css";

type Panel =
  | { mode: "create" }
  | { mode: "edit"; obligation: HousingObligation };

export function HousingPage() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const query = useQuery({
    queryKey: ["housing"],
    queryFn: getHousing,
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });

  return (
    <section className={styles.page} aria-labelledby="housing-title">
      <header className={styles.intro}>
        <p className={styles.kicker}>Vivienda</p>
        <h1 id="housing-title" className={styles.title}>
          Obligación de vivienda
        </h1>
        <p className={styles.lead}>
          Cuota, reserva, cobertura e historial de pagos.
        </p>
        <button
          type="button"
          className={styles.primaryCta}
          onClick={() => setPanel({ mode: "create" })}
        >
          Configurar vivienda
        </button>
      </header>

      {panel ? (
        <HousingForm
          panel={panel}
          accounts={accountsQuery.data ?? []}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {query.isPending ? <HousingSkeleton /> : null}

      {query.isError ? (
        <div className={styles.error} role="alert">
          <p>No pudimos cargar tu vivienda. Probá de nuevo.</p>
          <button type="button" className={styles.retry} onClick={() => query.refetch()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {query.data && query.data.length === 0 && panel?.mode !== "create" ? (
        <div className={styles.empty}>
          <p>Aún no configuraste tu vivienda.</p>
          <button
            type="button"
            className={styles.primaryCta}
            onClick={() => setPanel({ mode: "create" })}
          >
            Configurar vivienda
          </button>
        </div>
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className={styles.grid}>
          {query.data.map((obligation) => (
            <li key={obligation.id}>
              <HousingCard
                obligation={obligation}
                accounts={accountsQuery.data ?? []}
                onEdit={() => setPanel({ mode: "edit", obligation })}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function HousingCard({
  obligation,
  accounts,
  onEdit,
}: {
  obligation: HousingObligation;
  accounts: Account[];
  onEdit: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const reserve = accounts.find((account) => account.id === obligation.reserveAccountId);

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{obligation.name}</h2>
          <p className={styles.currency}>{obligation.currency}</p>
        </div>
        <span className={obligation.isActive ? styles.badge : styles.badgeInactive}>
          {obligation.isActive ? "Activa" : "Inactiva"}
        </span>
      </header>

      <div className={styles.cardLayout}>
        <dl className={styles.meta}>
          <div>
            <dt>Cuota</dt>
            <dd>{formatMoney(obligation.installmentAmount, obligation.currency)}</dd>
          </div>
          <div>
            <dt>Pendientes</dt>
            <dd>{obligation.remainingInstallments}</dd>
          </div>
          <div>
            <dt>Vencimiento</dt>
            <dd>
              {obligation.dueDay === null
                ? "Sin día configurado"
                : `Día ${obligation.dueDay}`}
            </dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{obligation.isActive ? "Activa" : "Inactiva"}</dd>
          </div>
          <div>
            <dt>Cuenta reserva</dt>
            <dd>
              {obligation.reserveAccountId
                ? (reserve?.name ?? "Cuenta de reserva")
                : "Sin cuenta de reserva"}
            </dd>
          </div>
        </dl>

        <HousingCoverageCard obligationId={obligation.id} />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.edit} onClick={onEdit}>
          Editar
        </button>
        {obligation.isActive ? (
          <button
            type="button"
            className={styles.primaryCta}
            onClick={() => setPaying((open) => !open)}
          >
            Registrar cuota
          </button>
        ) : null}
      </div>

      {paying && obligation.isActive ? (
        <HousingPaymentForm
          obligation={obligation}
          accounts={accounts}
          onClose={() => setPaying(false)}
        />
      ) : null}

      <HousingPaymentHistory obligationId={obligation.id} />
    </article>
  );
}

function HousingCoverageCard({ obligationId }: { obligationId: string }) {
  const query = useQuery({
    queryKey: ["housing", obligationId, "coverage"],
    queryFn: () => getHousingCoverage(obligationId),
  });

  if (query.isPending) {
    return (
      <section className={styles.coverage} aria-busy="true">
        <h3 className={styles.sectionTitle}>Cobertura</h3>
        <p>Cargando cobertura</p>
      </section>
    );
  }

  if (query.isError || !query.data) {
    return (
      <section className={styles.coverage} role="alert">
        <h3 className={styles.sectionTitle}>Cobertura</h3>
        <p>No pudimos cargar la cobertura.</p>
      </section>
    );
  }

  return <CoverageBody coverage={query.data} />;
}

function CoverageBody({ coverage }: { coverage: HousingCoverage }) {
  const reserveMissing =
    coverage.reserveAccountId === null &&
    coverage.reserveBalance === null &&
    coverage.coveredInstallments === null;

  return (
    <section className={styles.coverage}>
      <h3 className={styles.sectionTitle}>Cobertura</h3>
      {reserveMissing ? (
        <p>Sin cuenta de reserva configurada</p>
      ) : (
        <dl className={styles.meta}>
          <div>
            <dt>Reserva actual</dt>
            <dd>
              {coverage.reserveBalance === null
                ? "—"
                : formatMoney(coverage.reserveBalance, coverage.currency)}
            </dd>
          </div>
          <div>
            <dt>Cobertura</dt>
            <dd>
              {coverage.coveredInstallments === null
                ? "—"
                : `${formatCoveredInstallments(coverage.coveredInstallments)} cuotas`}
            </dd>
          </div>
          <div>
            <dt>Pendientes</dt>
            <dd>{coverage.remainingInstallments}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function HousingPaymentHistory({ obligationId }: { obligationId: string }) {
  const query = useQuery({
    queryKey: ["housing", obligationId, "payments"],
    queryFn: () => getHousingPayments(obligationId),
  });

  if (query.isPending) {
    return (
      <section className={styles.history} aria-busy="true">
        <h3 className={styles.sectionTitle}>Historial de pagos</h3>
        <p>Cargando pagos</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className={styles.history} role="alert">
        <h3 className={styles.sectionTitle}>Historial de pagos</h3>
        <p>No pudimos cargar el historial.</p>
      </section>
    );
  }

  const payments = query.data ?? [];

  return (
    <section className={styles.history}>
      <h3 className={styles.sectionTitle}>Historial de pagos</h3>
      {payments.length === 0 ? (
        <p>Aún no registraste pagos.</p>
      ) : (
        <ul className={styles.paymentList}>
          {payments.map((payment) => (
            <li key={payment.id} className={styles.paymentItem}>
              <PaymentRow payment={payment} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentRow({ payment }: { payment: HousingPayment }) {
  return (
    <>
      <time dateTime={payment.paidAt}>{formatPaidAt(payment.paidAt)}</time>
      <span>{formatMoney(payment.amount, payment.currency)}</span>
      {payment.installmentNumber !== null ? (
        <span>Cuota {payment.installmentNumber}</span>
      ) : null}
    </>
  );
}

function HousingForm({
  panel,
  accounts,
  onClose,
}: {
  panel: Panel;
  accounts: Account[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = panel.mode === "edit" ? panel.obligation : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [currency, setCurrency] = useState<Currency | "">(editing?.currency ?? "");
  const [amount, setAmount] = useState(editing?.installmentAmount ?? "");
  const [remaining, setRemaining] = useState(
    editing ? String(editing.remainingInstallments) : ""
  );
  const [dueDay, setDueDay] = useState(editing?.dueDay === null || editing?.dueDay === undefined
    ? ""
    : String(editing.dueDay));
  const [reserveAccountId, setReserveAccountId] = useState(editing?.reserveAccountId ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);

  const reserveOptions = useMemo(
    () =>
      currency
        ? accountsForHousingCurrency(accounts, currency, editing?.reserveAccountId ?? null)
        : [],
    [accounts, currency, editing?.reserveAccountId]
  );

  const remainingParsed = parseRequiredInteger(remaining, 0);
  const dueDayParsed = parseOptionalInteger(dueDay, 1, 31);
  const remainingChanged =
    editing !== null &&
    remainingParsed !== "invalid" &&
    remainingParsed !== editing.remainingInstallments;
  const canSubmit =
    name.trim().length > 0 &&
    currency !== "" &&
    isValidAmount(amount) &&
    remainingParsed !== "invalid" &&
    dueDayParsed !== "invalid";

  const mutation = useMutation({
    mutationFn: async () => {
      if (currency === "" || remainingParsed === "invalid" || dueDayParsed === "invalid") {
        throw new Error("Revisá los datos del formulario.");
      }

      if (editing) {
        return updateHousing(editing.id, {
          name: name.trim(),
          installmentAmount: toApiAmount(amount),
          remainingInstallments: remainingParsed,
          dueDay: dueDayParsed,
          reserveAccountId: reserveAccountId || null,
          isActive,
        });
      }

      return createHousing({
        name: name.trim(),
        currency,
        installmentAmount: toApiAmount(amount),
        remainingInstallments: remainingParsed,
        dueDay: dueDayParsed,
        reserveAccountId: reserveAccountId || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["housing"] });
      if (editing) {
        await queryClient.invalidateQueries({
          queryKey: ["housing", editing.id, "coverage"],
        });
      }
      onClose();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h2 className={styles.formTitle}>
        {editing ? "Editar vivienda" : "Configurar vivienda"}
      </h2>

      <label className={styles.field}>
        Nombre
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
      </label>

      {editing ? (
        <p className={styles.formHint}>Moneda: {editing.currency}</p>
      ) : (
        <label className={styles.field}>
          Moneda
          <select
            value={currency}
            onChange={(event) => {
              const next = event.target.value as Currency | "";
              setCurrency(next);
              setReserveAccountId("");
            }}
          >
            <option value="">Elegí una moneda</option>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>
      )}

      <label className={styles.field}>
        Cuota mensual
        <input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(normalizeAmountInput(event.target.value))}
        />
      </label>

      <label className={styles.field}>
        Cuotas pendientes
        <input
          inputMode="numeric"
          value={remaining}
          onChange={(event) => setRemaining(event.target.value)}
        />
      </label>
      {remainingChanged ? (
        <p className={styles.formHint}>
          Cambiar las cuotas pendientes afecta la cobertura y las proyecciones.
        </p>
      ) : null}

      <label className={styles.field}>
        Día de vencimiento
        <input
          inputMode="numeric"
          value={dueDay}
          onChange={(event) => setDueDay(event.target.value)}
          placeholder="Opcional"
        />
      </label>

      <label className={styles.field}>
        Cuenta de reserva
        <select
          value={reserveAccountId}
          onChange={(event) => setReserveAccountId(event.target.value)}
          disabled={currency === ""}
        >
          <option value="">Sin cuenta de reserva</option>
          {reserveOptions.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      {editing ? (
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Activa
        </label>
      ) : null}

      {mutation.isError ? (
        <p className={styles.formError} role="alert">
          {housingFormError(mutation.error)}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryCta} disabled={!canSubmit || mutation.isPending}>
          Guardar
        </button>
      </div>
    </form>
  );
}

function HousingPaymentForm({
  obligation,
  accounts,
  onClose,
}: {
  obligation: HousingObligation;
  accounts: Account[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const options = paymentAccountsForHousing(accounts, obligation.currency);
  const [accountId, setAccountId] = useState(options[0]?.id ?? "");
  const [amount, setAmount] = useState(obligation.installmentAmount);
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeInput(new Date()));
  const [installmentNumber, setInstallmentNumber] = useState("");

  const installmentParsed = parseOptionalInteger(installmentNumber, 0);
  const canSubmit =
    accountId !== "" &&
    isValidAmount(amount) &&
    occurredAt.trim().length > 0 &&
    installmentParsed !== "invalid";

  const mutation = useMutation({
    mutationFn: () => {
      if (installmentParsed === "invalid") {
        throw new Error("Revisá el número de cuota.");
      }
      return registerHousingPayment(obligation.id, {
        accountId,
        amount: toApiAmount(amount),
        occurredAt: localDateTimeToIso(occurredAt),
        ...(installmentParsed === null ? {} : { installmentNumber: installmentParsed }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["housing"] }),
        queryClient.invalidateQueries({
          queryKey: ["housing", obligation.id, "coverage"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["housing", obligation.id, "payments"],
        }),
      ]);
      onClose();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    mutation.mutate();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h3 className={styles.formTitle}>Registrar cuota</h3>

      <label className={styles.field}>
        Cuenta de pago
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Elegí una cuenta</option>
          {options.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        Monto
        <input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(normalizeAmountInput(event.target.value))}
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

      <label className={styles.field}>
        Número de cuota
        <input
          inputMode="numeric"
          value={installmentNumber}
          onChange={(event) => setInstallmentNumber(event.target.value)}
          placeholder="Opcional"
        />
      </label>

      {mutation.isError ? (
        <p className={styles.formError} role="alert">
          {housingPaymentError(mutation.error)}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryCta} disabled={!canSubmit || mutation.isPending}>
          Registrar pago
        </button>
      </div>
    </form>
  );
}

function HousingSkeleton() {
  return (
    <div className={styles.skeletonBlock} aria-busy="true">
      <span className={styles.srOnly}>Cargando vivienda</span>
    </div>
  );
}
