"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getFinancialSummary, getHousing, getHousingCoverage, isUnauthorizedError } from "../lib/api";
import {
  barSharePercent,
  currentYearMonth,
  formatArsAmount,
  formatCoveredInstallments,
  formatMoney,
  formatMonthLabel,
  formatRunway,
  isPositiveAmount,
  maxAmount,
} from "../lib/format-money";
import { firstActiveHousing } from "../lib/housing";
import type { FinancialSummary, HousingCoverage, HousingObligation } from "../lib/types";
import { ErrorState } from "./QueryStatus";
import styles from "./Dashboard.module.css";

type DashboardProps = {
  year?: number;
  month?: number;
};

export function Dashboard({ year, month }: DashboardProps) {
  const current = currentYearMonth();
  const selectedYear = year ?? current.year;
  const selectedMonth = month ?? current.month;
  const query = useQuery({
    queryKey: ["financial-summary", selectedYear, selectedMonth],
    queryFn: () => getFinancialSummary(selectedYear, selectedMonth),
  });

  return (
    <section className={styles.page} aria-labelledby="dashboard-title">
      <header className={styles.intro}>
        <p className={styles.kicker}>Dashboard</p>
        <h1 id="dashboard-title" className={styles.title}>
          {formatMonthLabel(selectedYear, selectedMonth)}
        </h1>
        <p className={styles.lead}>Cómo estás este mes, en números claros.</p>
      </header>

      {query.isPending ? <DashboardSkeleton /> : null}

      {query.isError && !isUnauthorizedError(query.error) ? (
        <ErrorState
          message="No pudimos cargar tu resumen. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.data ? <DashboardBody summary={query.data} /> : null}

      <Link href="/registrar" className={styles.cta}>
        Registrar movimiento
      </Link>
    </section>
  );
}

function DashboardBody({ summary }: { summary: FinancialSummary }) {
  const runway = formatRunway(summary.runwayMonths);
  const showSurplus = isPositiveAmount(summary.monthlySurplus);
  const monthScale = maxAmount(
    summary.monthlyGrossExpenses,
    summary.monthlyNetExpenses,
    summary.monthlyOperatingIncome,
    summary.monthlyFundConsumption
  );
  const average = summary.averageMonthlyFundConsumption;
  const averageScale =
    average === null
      ? null
      : maxAmount(summary.monthlyFundConsumption, average);

  return (
    <div className={styles.stack}>
      <article className={styles.hero}>
        <h2 className={styles.heroLabel}>Disponible para vivir</h2>
        <p className={styles.heroValue}>{formatArsAmount(summary.totalAvailableARS)}</p>
        <p className={styles.heroHint}>Fondo ARS líquido para el día a día.</p>
        <p className={styles.runway}>
          <span className={styles.runwayLabel}>Runway</span>
          <span className={styles.runwayValue}>{runway}</span>
        </p>
      </article>

      <div className={styles.metrics}>
        <article className={styles.card}>
          <h2 className={styles.cardLabel}>Gasto neto</h2>
          <p className={styles.cardValue}>
            {formatArsAmount(summary.monthlyNetExpenses)}
          </p>
        </article>
        <article className={styles.card}>
          <h2 className={styles.cardLabel}>Consumo del fondo</h2>
          <p className={styles.cardValue}>
            {formatArsAmount(summary.monthlyFundConsumption)}
          </p>
        </article>
      </div>

      <div className={styles.secondary}>
        <p>
          <span>Ingreso operativo</span>
          <strong>{formatArsAmount(summary.monthlyOperatingIncome)}</strong>
        </p>
        {showSurplus ? (
          <p>
            <span>Superávit del mes</span>
            <strong>{formatArsAmount(summary.monthlySurplus)}</strong>
          </p>
        ) : null}
        <HousingSummary />
      </div>

      <section className={styles.analysis} aria-labelledby="analysis-title">
        <h2 id="analysis-title" className={styles.analysisTitle}>
          Análisis del mes
        </h2>
        <div className={styles.analysisMetrics}>
          <article className={styles.card}>
            <h3 className={styles.cardLabel}>Gasto bruto</h3>
            <p className={styles.cardValue}>
              {formatArsAmount(summary.monthlyGrossExpenses)}
            </p>
          </article>
          <article className={styles.card}>
            <h3 className={styles.cardLabel}>Promedio de consumo</h3>
            <p className={styles.cardValue}>
              {average === null
                ? "Sin datos suficientes"
                : formatArsAmount(average)}
            </p>
          </article>
        </div>

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
            <figcaption className={styles.chartTitle}>
              Consumo vs promedio
            </figcaption>
            <MetricBar
              label="Este mes"
              amount={summary.monthlyFundConsumption}
              max={averageScale}
            />
            <MetricBar label="Promedio" amount={average} max={averageScale} />
          </figure>
        ) : null}
      </section>
    </div>
  );
}

function HousingSummary() {
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

  if (list.isPending || (selected && coverage.isPending)) {
    return (
      <div className={styles.housing} aria-busy="true">
        <span>Vivienda</span>
        <strong className={styles.housingSkeleton} aria-label="Cargando vivienda">
          {"\u00a0"}
        </strong>
      </div>
    );
  }

  if (list.isError || (selected && coverage.isError)) {
    return (
      <ErrorState
        compact
        message="No pudimos cargar tu vivienda. Probá de nuevo."
        onRetry={() => {
          if (list.isError) {
            void list.refetch();
            return;
          }
          void coverage.refetch();
        }}
      />
    );
  }

  if (!selected) {
    return (
      <div className={styles.housing}>
        <span>Vivienda USD</span>
        <strong>Sin configurar</strong>
      </div>
    );
  }

  if (!coverage.data) {
    return (
      <ErrorState
        compact
        message="No pudimos cargar tu vivienda. Probá de nuevo."
        onRetry={() => {
          void coverage.refetch();
        }}
      />
    );
  }

  return <HousingCoverageLines obligation={selected} coverage={coverage.data} />;
}

function HousingCoverageLines({
  obligation,
  coverage,
}: {
  obligation: HousingObligation;
  coverage: HousingCoverage;
}) {
  const noReserve =
    coverage.reserveAccountId === null && coverage.coveredInstallments === null;

  if (noReserve) {
    return (
      <div className={styles.housing}>
        <span>Vivienda {obligation.currency}</span>
        <strong>Sin reserva configurada</strong>
      </div>
    );
  }

  const covered =
    coverage.coveredInstallments === null
      ? null
      : `${formatCoveredInstallments(coverage.coveredInstallments)} cuotas cubiertas`;
  const reserved =
    coverage.reserveBalance === null
      ? null
      : `${formatMoney(coverage.reserveBalance, coverage.currency)} reservados`;

  return (
    <div className={styles.housing}>
      <span>Vivienda {obligation.currency}</span>
      <div className={styles.housingValues}>
        {covered ? <strong>{covered}</strong> : null}
        {reserved ? <p className={styles.housingReserve}>{reserved}</p> : null}
      </div>
    </div>
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
        <strong>{formatArsAmount(amount)}</strong>
      </div>
      <div className={styles.barTrack} aria-hidden="true">
        <span
          className={styles.barFill}
          style={{ width: barSharePercent(amount, max) }}
        />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className={styles.stack} aria-busy="true" aria-live="polite">
      <p className={styles.srOnly}>Cargando resumen financiero</p>
      <div className={`${styles.hero} ${styles.skeletonBlock}`} />
      <div className={styles.metrics}>
        <div className={`${styles.card} ${styles.skeletonBlock}`} />
        <div className={`${styles.card} ${styles.skeletonBlock}`} />
      </div>
    </div>
  );
}
