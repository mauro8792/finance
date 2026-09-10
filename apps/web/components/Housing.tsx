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
import { formatCoveredInstallments, formatPaidAt } from "../lib/format-money";
import {
  accountsForHousingCurrency,
  coverageBarWidth,
  housingFormError,
  housingPaymentError,
  nextDueDateLabel,
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
import { PrivacyToggle } from "./PrivacyToggle";
import { EmptyState, ErrorState } from "./QueryStatus";
import { FinancialCard } from "./ui/FinancialCard";
import { Money } from "./ui/Money";
import { PageHeader } from "./ui/PageHeader";
import { Skeleton } from "./ui/Skeleton";
import { StatusBadge } from "./ui/StatusBadge";
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
    <section className={styles.page} aria-label="Vivienda">
      <PageHeader
        kicker="Vivienda"
        title="Obligación de vivienda"
        actions={
          <>
            <button
              type="button"
              className={styles.headerCta}
              onClick={() => setPanel({ mode: "create" })}
            >
              Configurar vivienda
            </button>
            <PrivacyToggle />
          </>
        }
      />

      {panel ? (
        <HousingForm
          panel={panel}
          accounts={accountsQuery.data ?? []}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {query.isPending ? (
        <Skeleton count={2} height="8rem" label="Cargando vivienda" />
      ) : null}

      {query.isError ? (
        <ErrorState
          message="No pudimos cargar tu vivienda. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.data && query.data.length === 0 && panel?.mode !== "create" ? (
        <EmptyState
          message="Aún no configuraste tu vivienda."
          action={{ label: "Configurar vivienda", onClick: () => setPanel({ mode: "create" }) }}
        />
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className={styles.grid}>
          {query.data.map((obligation) => (
            <li key={obligation.id} className={styles.gridItem}>
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
  const nextDue = nextDueDateLabel(obligation.dueDay);

  // Una sola historia de cobertura arriba (reserva + cuotas cubiertas + barra)
  // y después los datos operativos compactos, sin repetir la reserva.
  return (
    <FinancialCard className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.cardHeading}>
          <h2 className={styles.cardTitle}>
            {obligation.name}
            <span className={styles.currencyTag}>{obligation.currency}</span>
          </h2>
        </div>
        <StatusBadge
          label={obligation.isActive ? "Activa" : "Inactiva"}
          tone={obligation.isActive ? "active" : "inactive"}
        />
      </div>

      <HousingCoverageCard obligationId={obligation.id} />

      <dl className={styles.meta}>
        <div>
          <dt>Cuota mensual</dt>
          <dd>
            <Money
              amount={obligation.installmentAmount}
              currency={obligation.currency}
            />
          </dd>
        </div>
        <div>
          <dt>Cuotas pendientes</dt>
          <dd>{obligation.remainingInstallments}</dd>
        </div>
        <div>
          <dt>Próximo vencimiento</dt>
          <dd>
            {nextDue ?? "Sin día configurado"}
            {obligation.dueDay === null ? null : <small>Día {obligation.dueDay}</small>}
          </dd>
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

      <div className={styles.actions}>
        {obligation.isActive ? (
          <button
            type="button"
            className={styles.linkStrong}
            onClick={() => setPaying((open) => !open)}
          >
            Registrar cuota
          </button>
        ) : null}
        <button type="button" className={styles.linkAction} onClick={onEdit}>
          Editar
        </button>
      </div>

      {paying && obligation.isActive ? (
        <HousingPaymentForm
          obligation={obligation}
          accounts={accounts}
          onClose={() => setPaying(false)}
        />
      ) : null}

      <HousingPaymentHistory obligationId={obligation.id} />
    </FinancialCard>
  );
}

function HousingCoverageCard({ obligationId }: { obligationId: string }) {
  const query = useQuery({
    queryKey: ["housing", obligationId, "coverage"],
    queryFn: () => getHousingCoverage(obligationId),
  });

  if (query.isPending) {
    return (
      <section className={styles.coverage}>
        <h3 className={styles.sectionTitle}>Cobertura de la reserva</h3>
        <Skeleton height="2.4rem" label="Cargando cobertura" />
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className={styles.coverage}>
        <h3 className={styles.sectionTitle}>Cobertura de la reserva</h3>
        <ErrorState
          message="No pudimos cargar la cobertura. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
          compact
        />
      </section>
    );
  }

  if (!query.data) {
    return null;
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
      <h3 className={styles.sectionTitle}>Cobertura de la reserva</h3>
      {reserveMissing ? (
        <p className={styles.coverageHint}>Sin cuenta de reserva configurada</p>
      ) : (
        <>
          <p className={styles.coverageValue}>
            {coverage.reserveBalance === null ? (
              "—"
            ) : (
              <Money amount={coverage.reserveBalance} currency={coverage.currency} />
            )}
          </p>
          <p className={styles.coverageHint}>
            {coverage.coveredInstallments === null
              ? "Sin datos de cobertura"
              : `${formatCoveredInstallments(coverage.coveredInstallments)} de ${coverage.remainingInstallments} cuotas cubiertas`}
          </p>
          <div className={styles.barTrack} aria-hidden="true">
            <span
              className={styles.barFill}
              style={{
                width: coverageBarWidth(
                  coverage.coveredInstallments,
                  coverage.remainingInstallments
                ),
              }}
            />
          </div>
        </>
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
      <section className={styles.history}>
        <h3 className={styles.sectionTitle}>Historial de pagos</h3>
        <Skeleton count={2} height="1.6rem" label="Cargando pagos" />
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className={styles.history}>
        <h3 className={styles.sectionTitle}>Historial de pagos</h3>
        <ErrorState
          message="No pudimos cargar el historial. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
          compact
        />
      </section>
    );
  }

  const payments = query.data ?? [];

  return (
    <section className={styles.history}>
      <h3 className={styles.sectionTitle}>Historial de pagos</h3>
      {payments.length === 0 ? (
        <EmptyState message="Aún no registraste pagos." />
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
      <time className={styles.paymentDate} dateTime={payment.paidAt}>
        {formatPaidAt(payment.paidAt)}
      </time>
      <Money
        amount={payment.amount}
        currency={payment.currency}
        className={styles.paymentAmount}
      />
      {payment.installmentNumber !== null ? (
        <span className={styles.paymentInstallment}>Cuota {payment.installmentNumber}</span>
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