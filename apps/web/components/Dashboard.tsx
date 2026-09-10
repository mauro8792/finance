"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import {
  getAccountBalance,
  getAccounts,
  getCreditCardCommitments,
  getCreditCards,
  getFinancialSummary,
  getHousing,
  getHousingCoverage,
  getInvestments,
  getTransactions,
  isUnauthorizedError,
} from "../lib/api";
import { accountTypeLabel } from "../lib/accounts";
import {
  amountToCents,
  barSharePercent,
  currentYearMonth,
  formatCoveredInstallments,
  formatMonthLabel,
  formatRunway,
  isPositiveAmount,
  maxAmount,
} from "../lib/format-money";
import { firstActiveHousing } from "../lib/housing";
import { addAmounts, formatArtDate } from "../lib/investments";
import { formatTransactionDate } from "../lib/transactions";
import type {
  Account,
  CreditCard,
  CreditCardCommitments,
  Currency,
  FinancialSummary,
  HousingCoverage,
  HousingObligation,
  Investment,
  Transaction,
} from "../lib/types";
import { PrivacyToggle } from "./PrivacyToggle";
import { EmptyState, ErrorState } from "./QueryStatus";
import { ActionCard } from "./ui/ActionCard";
import { FinancialCard } from "./ui/FinancialCard";
import { Metric } from "./ui/Metric";
import { Money } from "./ui/Money";
import { PageHeader } from "./ui/PageHeader";
import { SectionHeader } from "./ui/SectionHeader";
import { Skeleton } from "./ui/Skeleton";
import { StatusBadge } from "./ui/StatusBadge";
import styles from "./Dashboard.module.css";

type DashboardProps = {
  year?: number;
  month?: number;
};

type CurrencyTotal = { currency: Currency; amount: string };

type HousingReserve = {
  currency: Currency;
  balance: string;
  covered: string | null;
};

type HousingData = {
  list: UseQueryResult<HousingObligation[]>;
  coverage: UseQueryResult<HousingCoverage>;
  selected: HousingObligation | null;
  isPending: boolean;
  isError: boolean;
  retry: () => void;
};

type CardsData = {
  cards: CreditCard[];
  commitments: Record<string, CreditCardCommitments>;
  debtByCurrency: CurrencyTotal[];
  query: UseQueryResult<CreditCard[]>;
};

const ACCOUNTS_PREVIEW_LIMIT = 3;
const EXPENSES_PREVIEW_LIMIT = 3;
const INVESTMENTS_PREVIEW_LIMIT = 2;
const CARDS_PREVIEW_LIMIT = 2;

const QUICK_ACTIONS = [
  {
    label: "Registrar gasto",
    href: "/registrar",
    icon: "M13 4v11.2l4.6-4.6L19 12l-7 7-7-7 1.4-1.4L11 15.2V4h2Z",
  },
  {
    label: "Registrar ingreso",
    href: "/registrar",
    icon: "M11 20V8.8l-4.6 4.6L5 12l7-7 7 7-1.4 1.4L13 8.8V20h-2Z",
  },
  {
    label: "Transferir",
    href: "/transfers",
    icon: "M7 7h9V4l5 4-5 4V9H7V7Zm10 10H8v3l-5-4 5-4v3h9v2Z",
  },
  {
    label: "Ver movimientos",
    href: "/transactions",
    icon: "M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z",
  },
] as const;

export function Dashboard({ year, month }: DashboardProps) {
  const current = currentYearMonth();
  const selectedYear = year ?? current.year;
  const selectedMonth = month ?? current.month;

  const summary = useQuery({
    queryKey: ["financial-summary", selectedYear, selectedMonth],
    queryFn: () => getFinancialSummary(selectedYear, selectedMonth),
  });
  const housing = useHousingData();
  const investments = useQuery({
    queryKey: ["investments"],
    queryFn: getInvestments,
  });
  const cards = useCreditCardsData();

  return (
    <section className={styles.page} aria-label="Resumen financiero">
      <PageHeader
        kicker="Inicio"
        title={formatMonthLabel(selectedYear, selectedMonth)}
        actions={<PrivacyToggle />}
      />

      <SummarySection
        query={summary}
        housing={housing}
        investments={investments}
        cards={cards}
      />

      <QuickActions />

      <AccountsPreview />

      <RecentExpenses />

      <InvestmentsPreview query={investments} />

      <HousingPreview housing={housing} />

      <CardsPreview cards={cards} />
    </section>
  );
}

function SummarySection({
  query,
  housing,
  investments,
  cards,
}: {
  query: UseQueryResult<FinancialSummary>;
  housing: HousingData;
  investments: UseQueryResult<Investment[]>;
  cards: CardsData;
}) {
  if (query.isPending) {
    return <Skeleton count={2} height="8rem" label="Cargando resumen financiero" />;
  }

  if (query.isError) {
    if (isUnauthorizedError(query.error)) {
      return null;
    }
    return (
      <ErrorState
        message="No pudimos cargar tu resumen. Probá de nuevo."
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  const investedByCurrency = activeInvestmentTotals(investments.data ?? []);
  const reserve = housingReserve(housing);
  // Si hay montos en USD el hero aclara la moneda en su propio label, en lugar
  // de repetir el mismo importe en una métrica aparte.
  const hasForeignAmount =
    reserve?.currency === "USD" ||
    investedByCurrency.some((total) => total.currency === "USD") ||
    cards.debtByCurrency.some((total) => total.currency === "USD");

  return (
    <div className={styles.summary}>
      <Hero summary={query.data} label={hasForeignAmount ? "Disponible ARS" : "Disponible"} />
      <SecondaryMetrics
        housing={housing}
        reserve={reserve}
        investedByCurrency={investedByCurrency}
        cards={cards}
      />
      <MonthAnalysis summary={query.data} />
    </div>
  );
}

function Hero({ summary, label }: { summary: FinancialSummary; label: string }) {
  return (
    <FinancialCard variant="hero" className={styles.hero}>
      <div className={styles.heroMain}>
        <p className={styles.heroLabel}>{label}</p>
        <Money
          amount={summary.totalAvailableARS}
          currency="ARS"
          className={styles.heroValue}
        />
      </div>
      <p className={styles.runway}>
        <span className={styles.runwayLabel}>Runway</span>
        <span className={styles.runwayValue}>{formatRunway(summary.runwayMonths)}</span>
      </p>
    </FinancialCard>
  );
}

// Una sola fila compacta: reserva, inversiones y deuda de tarjetas. Cada moneda
// se muestra por separado y nunca se suman entre sí.
function SecondaryMetrics({
  housing,
  reserve,
  investedByCurrency,
  cards,
}: {
  housing: HousingData;
  reserve: HousingReserve | null;
  investedByCurrency: CurrencyTotal[];
  cards: CardsData;
}) {
  const isEmpty =
    !housing.isPending &&
    !reserve &&
    investedByCurrency.length === 0 &&
    cards.debtByCurrency.length === 0;

  if (isEmpty) {
    return null;
  }

  return (
    <div className={styles.metrics}>
      {housing.isPending ? (
        <Skeleton count={1} height="3rem" label="Cargando vivienda" />
      ) : null}

      {reserve ? (
        <Metric
          compact
          label={reserve.currency === "ARS" ? "Reserva" : `Reserva ${reserve.currency}`}
          value={<Money amount={reserve.balance} currency={reserve.currency} />}
          hint={reserve.covered ? `${reserve.covered} cuotas cubiertas` : undefined}
        />
      ) : null}

      {investedByCurrency.map((total) => (
        <Metric
          key={`investment-${total.currency}`}
          compact
          label={total.currency === "ARS" ? "Inversiones" : "Inversiones USD"}
          value={<Money amount={total.amount} currency={total.currency} />}
        />
      ))}

      {cards.debtByCurrency.map((total) => (
        <Metric
          key={`card-debt-${total.currency}`}
          compact
          label={total.currency === "ARS" ? "Deuda tarjetas" : "Deuda tarjetas USD"}
          value={<Money amount={total.amount} currency={total.currency} />}
        />
      ))}
    </div>
  );
}

function MonthAnalysis({ summary }: { summary: FinancialSummary }) {
  const average = summary.averageMonthlyFundConsumption;
  const monthScale = maxAmount(
    summary.monthlyGrossExpenses,
    summary.monthlyNetExpenses,
    summary.monthlyOperatingIncome,
    summary.monthlyFundConsumption
  );
  const averageScale =
    average === null ? null : maxAmount(summary.monthlyFundConsumption, average);

  // Secundario y plegado: el detalle del mes no debe empujar las secciones
  // operativas fuera de la primera pantalla.
  return (
    <details className={styles.analysis}>
      <summary className={styles.analysisSummary}>
        <h2 className={styles.analysisTitle}>Análisis del mes</h2>
      </summary>

      <div className={styles.metrics}>
        <Metric
          compact
          label="Gasto neto"
          value={<Money amount={summary.monthlyNetExpenses} currency="ARS" />}
        />
        <Metric
          compact
          label="Consumo del fondo"
          value={<Money amount={summary.monthlyFundConsumption} currency="ARS" />}
        />
        <Metric
          compact
          label="Ingreso operativo"
          value={<Money amount={summary.monthlyOperatingIncome} currency="ARS" />}
        />
        {isPositiveAmount(summary.monthlySurplus) ? (
          <Metric
            compact
            label="Superávit del mes"
            value={<Money amount={summary.monthlySurplus} currency="ARS" />}
          />
        ) : null}
        <Metric
          compact
          label="Gasto bruto"
          value={<Money amount={summary.monthlyGrossExpenses} currency="ARS" />}
        />
        <Metric
          compact
          label="Promedio de consumo"
          value={
            average === null ? (
              "Sin datos suficientes"
            ) : (
              <Money amount={average} currency="ARS" />
            )
          }
        />
      </div>

      <div className={styles.charts}>
        <figure className={styles.chart}>
          <figcaption className={styles.chartTitle}>Comparación del mes</figcaption>
          <MetricBar
            label="Gasto bruto"
            amount={summary.monthlyGrossExpenses}
            max={monthScale}
          />
          <MetricBar
            label="Gasto neto"
            amount={summary.monthlyNetExpenses}
            max={monthScale}
          />
          <MetricBar
            label="Ingreso operativo"
            amount={summary.monthlyOperatingIncome}
            max={monthScale}
          />
          <MetricBar
            label="Consumo del fondo"
            amount={summary.monthlyFundConsumption}
            max={monthScale}
          />
        </figure>

        {average !== null && averageScale !== null ? (
          <figure className={styles.chart}>
            <figcaption className={styles.chartTitle}>Consumo vs promedio</figcaption>
            <MetricBar
              label="Este mes"
              amount={summary.monthlyFundConsumption}
              max={averageScale}
            />
            <MetricBar label="Promedio" amount={average} max={averageScale} />
          </figure>
        ) : null}
      </div>
    </details>
  );
}

function MetricBar({
  label,
  amount,
  max,
}: {
  label: string;
  amount: string;
  max: string;
}) {
  return (
    <div className={styles.barRow}>
      <div className={styles.barMeta}>
        <span>{label}</span>
        <Money amount={amount} currency="ARS" className={styles.barAmount} />
      </div>
      <div className={styles.barTrack} aria-hidden="true">
        <span className={styles.barFill} style={{ width: barSharePercent(amount, max) }} />
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <section className={styles.section} aria-label="Acciones rápidas">
      <div className={styles.actions}>
        {QUICK_ACTIONS.map((action) => (
          <ActionCard
            key={action.label}
            label={action.label}
            href={action.href}
            icon={<ActionIcon path={action.icon} />}
          />
        ))}
      </div>
    </section>
  );
}

function ActionIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={path} />
    </svg>
  );
}

function AccountsPreview() {
  const query = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });
  const accounts = activeAccounts(query.data ?? []);
  const balances = useQuery({
    queryKey: ["account-balances", "dashboard", accounts.map((account) => account.id)],
    enabled: query.isSuccess && accounts.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        accounts.map(async (account) => {
          const result = await getAccountBalance(account.id);
          return [account.id, result.balance] as const;
        })
      );
      return Object.fromEntries(entries) as Record<string, string>;
    },
  });

  return (
    <section className={styles.section} aria-label="Cuentas">
      <SectionHeader
        title="Cuentas"
        action={
          <Link
            href="/accounts"
            className={styles.sectionLink}
            aria-label="Ver todas las cuentas"
          >
            Ver todo
          </Link>
        }
      />

      {query.isPending ? <Skeleton count={2} height="2.4rem" label="Cargando cuentas" /> : null}

      {query.isError ? (
        <ErrorState
          compact
          message="No pudimos cargar tus cuentas. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.isSuccess && accounts.length === 0 ? (
        <EmptyState
          message="Todavía no tenés cuentas activas."
          action={{ label: "Crear cuenta", href: "/accounts" }}
        />
      ) : null}

      {accounts.length > 0 ? (
        <FinancialCard>
          <ul className={styles.rowList}>
            {accounts.map((account) => (
              <li key={account.id} className={styles.row}>
                <div className={styles.rowText}>
                  <p className={styles.rowTitle}>{account.name}</p>
                  <p className={styles.rowMeta}>
                    {accountTypeLabel(account.type)} · {account.currency}
                  </p>
                </div>
                <AccountBalance
                  currency={account.currency}
                  balance={balances.data?.[account.id] ?? null}
                  isPending={balances.isPending}
                />
              </li>
            ))}
          </ul>
        </FinancialCard>
      ) : null}
    </section>
  );
}

function AccountBalance({
  currency,
  balance,
  isPending,
}: {
  currency: Currency;
  balance: string | null;
  isPending: boolean;
}) {
  if (balance !== null) {
    return <Money amount={balance} currency={currency} className={styles.rowAmount} />;
  }

  if (isPending) {
    return (
      <Skeleton
        count={1}
        height="1.1rem"
        label="Cargando saldo"
        className={styles.rowSkeleton}
      />
    );
  }

  return <span className={styles.rowMeta}>Saldo no disponible</span>;
}

function RecentExpenses() {
  const query = useQuery({
    queryKey: ["transactions", {}],
    queryFn: () => getTransactions(),
  });
  const expenses = recentExpenses(query.data ?? []);

  return (
    <section className={styles.section} aria-label="Gastos recientes">
      <SectionHeader
        title="Gastos recientes"
        action={
          <Link
            href="/transactions"
            className={styles.sectionLink}
            aria-label="Ver todos los gastos"
          >
            Ver todo
          </Link>
        }
      />

      {query.isPending ? (
        <Skeleton count={3} height="2rem" label="Cargando gastos recientes" />
      ) : null}

      {query.isError ? (
        <ErrorState
          compact
          message="No pudimos cargar tus gastos. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.isSuccess && expenses.length === 0 ? (
        <EmptyState
          message="Todavía no registraste gastos."
          action={{ label: "Cargar un gasto", href: "/registrar" }}
        />
      ) : null}

      {expenses.length > 0 ? (
        <FinancialCard>
          <ul className={styles.rowList}>
            {expenses.map((expense) => (
              <li key={expense.id} className={styles.row}>
                <div className={styles.rowText}>
                  <p className={styles.rowTitle}>{expense.description ?? "Gasto"}</p>
                  <p className={styles.rowMeta}>
                    {formatTransactionDate(expense.occurredAt)}
                  </p>
                </div>
                <Money
                  amount={expense.amount}
                  currency={expense.currency}
                  className={styles.rowAmount}
                />
              </li>
            ))}
          </ul>
        </FinancialCard>
      ) : null}
    </section>
  );
}

function InvestmentsPreview({ query }: { query: UseQueryResult<Investment[]> }) {
  const active = (query.data ?? [])
    .filter((investment) => investment.status === "ACTIVE")
    .slice(0, INVESTMENTS_PREVIEW_LIMIT);

  return (
    <section className={styles.section} aria-label="Inversiones">
      <SectionHeader
        title="Inversiones"
        action={
          <Link
            href="/investments"
            className={styles.sectionLink}
            aria-label="Ver todas las inversiones"
          >
            Ver todo
          </Link>
        }
      />

      {query.isPending ? (
        <Skeleton count={1} height="2.4rem" label="Cargando inversiones" />
      ) : null}

      {query.isError ? (
        <ErrorState
          compact
          message="No pudimos cargar tus inversiones. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.isSuccess && active.length === 0 ? (
        <EmptyState
          message="No tenés inversiones activas."
          action={{ label: "Ver inversiones", href: "/investments" }}
        />
      ) : null}

      {active.length > 0 ? (
        <FinancialCard>
          <ul className={styles.rowList}>
            {active.map((investment) => (
              <li key={investment.id} className={styles.row}>
                <div className={styles.rowText}>
                  <StatusBadge label="Activa" tone="active" />
                  <p className={styles.rowMeta}>
                    {investment.maturityDate
                      ? `Vence el ${formatArtDate(investment.maturityDate)}`
                      : "Sin vencimiento"}
                  </p>
                </div>
                <Money
                  amount={investment.principal}
                  currency={investment.currency}
                  className={styles.rowAmount}
                />
              </li>
            ))}
          </ul>
        </FinancialCard>
      ) : null}
    </section>
  );
}

function HousingPreview({ housing }: { housing: HousingData }) {
  const reserve = housingReserve(housing);

  return (
    <section className={styles.section} aria-label="Vivienda">
      <SectionHeader
        title="Vivienda"
        action={
          <Link href="/housing" className={styles.sectionLink}>
            Ver todo
          </Link>
        }
      />

      {housing.isPending ? (
        <Skeleton count={1} height="2.4rem" label="Cargando cobertura de vivienda" />
      ) : null}

      {housing.isError ? (
        <ErrorState
          compact
          message="No pudimos cargar tu vivienda. Probá de nuevo."
          onRetry={housing.retry}
        />
      ) : null}

      {!housing.isPending && !housing.isError && !housing.selected ? (
        <EmptyState
          message="Todavía no configuraste tu vivienda."
          action={{ label: "Configurar vivienda", href: "/housing" }}
        />
      ) : null}

      {housing.selected && housing.coverage.data && !reserve ? (
        <EmptyState
          message="Tu vivienda no tiene una cuenta de reserva configurada."
          action={{ label: "Configurar reserva", href: "/housing" }}
        />
      ) : null}

      {housing.selected && housing.coverage.data && reserve ? (
        <div className={styles.metrics}>
          <Metric
            compact
            label="Cuotas cubiertas"
            value={reserve.covered ?? "Sin datos suficientes"}
            hint={`${housing.coverage.data.remainingInstallments} cuotas pendientes`}
          />
          <Metric
            compact
            label="Cuota mensual"
            value={
              <Money
                amount={housing.coverage.data.installmentAmount}
                currency={housing.coverage.data.currency}
              />
            }
            hint={housing.selected.name}
          />
        </div>
      ) : null}
    </section>
  );
}

function CardsPreview({ cards }: { cards: CardsData }) {
  const query = cards.query;
  const preview = cards.cards.slice(0, CARDS_PREVIEW_LIMIT);

  return (
    <section className={styles.section} aria-label="Tarjetas">
      <SectionHeader
        title="Tarjetas"
        action={
          <Link
            href="/cards"
            className={styles.sectionLink}
            aria-label="Ver todas las tarjetas"
          >
            Ver todo
          </Link>
        }
      />

      {query.isPending ? (
        <Skeleton count={1} height="2.4rem" label="Cargando tarjetas" />
      ) : null}

      {query.isError ? (
        <ErrorState
          compact
          message="No pudimos cargar tus tarjetas. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.isSuccess && preview.length === 0 ? (
        <EmptyState
          message="No tenés tarjetas cargadas."
          action={{ label: "Agregar tarjeta", href: "/cards" }}
        />
      ) : null}

      {preview.length > 0 ? (
        <FinancialCard>
          <ul className={styles.rowList}>
            {preview.map((card) => {
              const commitments = cards.commitments[card.id] ?? null;
              return (
                <li key={card.id} className={styles.row}>
                  <div className={styles.rowText}>
                    <p className={styles.rowTitle}>{card.name}</p>
                    <p className={styles.rowMeta}>
                      {card.issuer} · {card.currency}
                    </p>
                  </div>
                  {commitments ? (
                    <Money
                      amount={commitments.currentCardDebt}
                      currency={card.currency}
                      className={styles.rowAmount}
                    />
                  ) : (
                    <span className={styles.rowMeta}>Sin datos de deuda</span>
                  )}
                </li>
              );
            })}
          </ul>
        </FinancialCard>
      ) : null}
    </section>
  );
}

function useHousingData(): HousingData {
  const list = useQuery({
    queryKey: ["housing"],
    queryFn: getHousing,
  });
  const selected = list.data ? firstActiveHousing(list.data) : null;
  const coverage = useQuery({
    queryKey: ["housing", selected?.id, "coverage"],
    queryFn: () => getHousingCoverage(selected!.id),
    enabled: Boolean(selected),
  });

  return {
    list,
    coverage,
    selected,
    isPending: list.isPending || (Boolean(selected) && coverage.isPending),
    isError: list.isError || (Boolean(selected) && coverage.isError),
    retry: () => {
      if (list.isError) {
        void list.refetch();
        return;
      }
      void coverage.refetch();
    },
  };
}

function useCreditCardsData(): CardsData {
  const query = useQuery({
    queryKey: ["credit-cards"],
    queryFn: getCreditCards,
  });
  const cards = (query.data ?? []).filter((card) => card.isActive);
  const commitments = useQuery({
    queryKey: ["credit-card-commitments", cards.map((card) => card.id)],
    enabled: query.isSuccess && cards.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        cards.map(async (card) => {
          const result = await getCreditCardCommitments(card.id);
          return [card.id, result] as const;
        })
      );
      return Object.fromEntries(entries) as Record<string, CreditCardCommitments>;
    },
  });

  const byId = commitments.data ?? {};
  return {
    cards,
    commitments: byId,
    debtByCurrency: sumByCurrency(
      cards.map((card) => ({
        currency: card.currency,
        amount: byId[card.id]?.currentCardDebt ?? "0.00",
      }))
    ),
    query,
  };
}

function housingReserve(housing: HousingData): HousingReserve | null {
  const coverage = housing.coverage.data;
  if (!housing.selected || !coverage || coverage.reserveBalance === null) {
    return null;
  }
  return {
    currency: coverage.currency,
    balance: coverage.reserveBalance,
    covered:
      coverage.coveredInstallments === null
        ? null
        : formatCoveredInstallments(coverage.coveredInstallments),
  };
}

function activeAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.isActive).slice(0, ACCOUNTS_PREVIEW_LIMIT);
}

function recentExpenses(transactions: Transaction[]): Transaction[] {
  return transactions
    .filter(
      (transaction) => transaction.status === "ACTIVE" && transaction.type === "EXPENSE"
    )
    .slice(0, EXPENSES_PREVIEW_LIMIT);
}

function activeInvestmentTotals(investments: Investment[]): CurrencyTotal[] {
  return sumByCurrency(
    investments
      .filter((investment) => investment.status === "ACTIVE")
      .map((investment) => ({
        currency: investment.currency,
        amount: investment.principal,
      }))
  );
}

function sumByCurrency(items: CurrencyTotal[]): CurrencyTotal[] {
  const totals = new Map<Currency, string>();
  for (const item of items) {
    totals.set(item.currency, addAmounts(totals.get(item.currency) ?? "0.00", item.amount));
  }
  return [...totals.entries()]
    .filter(([, amount]) => amountToCents(amount) > BigInt(0))
    .map(([currency, amount]) => ({ currency, amount }));
}
