"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getHousing, runSimulation } from "../lib/api";
import {
  barSharePercent,
  currentYearMonth,
  formatCoveredInstallments,
  formatMoney,
  formatRunway,
} from "../lib/format-money";
import { toApiAmount } from "../lib/quick-add";
import {
  depletedCopy,
  formatExpenseChangePercent,
  fundStopsConsuming,
  hasInsufficientBaseline,
  isNonNegativeMoneyInput,
  parseNonNegativeIntInput,
  parsePositiveIntInput,
  percentToExpenseFraction,
  SIMULATION_LABELS,
  SIMULATION_TIMEZONE,
  simulationFormError,
  toExchangeRate,
} from "../lib/simulations";
import type {
  HousingObligation,
  HousingReserveSimulationResult,
  MonthsWithoutIncomeResult,
  NewJobScenarioResult,
  SimulationResponse,
  SimulationType,
} from "../lib/types";
import styles from "./Simulations.module.css";

const SCENARIOS: SimulationType[] = [
  "MONTHS_WITHOUT_INCOME",
  "NEW_JOB",
  "HOUSING_RESERVE",
];

type ResultsByType = {
  MONTHS_WITHOUT_INCOME?: MonthsWithoutIncomeResult;
  NEW_JOB?: NewJobScenarioResult;
  HOUSING_RESERVE?: HousingReserveSimulationResult;
};

export function SimulationsPage() {
  const period = currentYearMonth();
  const [scenario, setScenario] = useState<SimulationType>("MONTHS_WITHOUT_INCOME");
  const [results, setResults] = useState<ResultsByType>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [months, setMonths] = useState("");
  const [monthsUntilJob, setMonthsUntilJob] = useState("");
  const [totalMonths, setTotalMonths] = useState("");
  const [newIncome, setNewIncome] = useState("");
  const [expenseChange, setExpenseChange] = useState("0");
  const [housingId, setHousingId] = useState("");
  const [targetInstallments, setTargetInstallments] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");

  const housingQuery = useQuery({
    queryKey: ["housing"],
    queryFn: getHousing,
    enabled: scenario === "HOUSING_RESERVE",
  });

  const mutation = useMutation({
    mutationFn: runSimulation,
    onSuccess: (response: SimulationResponse) => {
      setResults((current) => ({
        ...current,
        [response.type]: response.result,
      }));
    },
  });

  useEffect(() => {
    const obligations = housingQuery.data;
    if (obligations?.length === 1 && !housingId) {
      setHousingId(obligations[0].id);
    }
  }, [housingQuery.data, housingId]);

  const selectedHousing = useMemo(
    () => housingQuery.data?.find((item) => item.id === housingId) ?? null,
    [housingQuery.data, housingId]
  );

  function selectScenario(next: SimulationType) {
    setScenario(next);
    setLocalError(null);
    mutation.reset();
  }

  function submitMonthsWithoutIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parsePositiveIntInput(months);
    if (value === null) {
      setLocalError("Ingresá cuántos meses querés simular, como entero mayor que 0.");
      return;
    }
    setLocalError(null);
    mutation.mutate({
      type: "MONTHS_WITHOUT_INCOME",
      year: period.year,
      month: period.month,
      months: value,
      timeZone: SIMULATION_TIMEZONE,
    });
  }

  function submitNewJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const untilJob = parseNonNegativeIntInput(monthsUntilJob);
    const horizon = parsePositiveIntInput(totalMonths);
    const fraction = percentToExpenseFraction(expenseChange);
    if (untilJob === null) {
      setLocalError("Ingresá los meses hasta el nuevo empleo, como entero mayor o igual a 0.");
      return;
    }
    if (horizon === null) {
      setLocalError("Ingresá el horizonte a simular, como entero mayor que 0.");
      return;
    }
    if (!isNonNegativeMoneyInput(newIncome)) {
      setLocalError("Ingresá el ingreso mensual nuevo en ARS.");
      return;
    }
    if (fraction === null) {
      setLocalError("Ingresá el cambio de gastos como porcentaje, por ejemplo -10.");
      return;
    }
    setLocalError(null);
    mutation.mutate({
      type: "NEW_JOB",
      year: period.year,
      month: period.month,
      monthsUntilJob: untilJob,
      totalMonths: horizon,
      newMonthlyIncomeARS: toApiAmount(newIncome),
      expenseChangeFraction: fraction,
      timeZone: SIMULATION_TIMEZONE,
    });
  }

  function submitHousing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = parsePositiveIntInput(targetInstallments);
    const fx = toExchangeRate(exchangeRate);
    if (!housingId) {
      setLocalError("Elegí una obligación de vivienda.");
      return;
    }
    if (target === null) {
      setLocalError("Ingresá las cuotas que querés reservar, como entero mayor que 0.");
      return;
    }
    if (fx === null) {
      setLocalError("Ingresá la cotización ARS por USD.");
      return;
    }
    setLocalError(null);
    mutation.mutate({
      type: "HOUSING_RESERVE",
      housingObligationId: housingId,
      targetInstallments: target,
      exchangeRateARSPerUSD: fx,
      year: period.year,
      month: period.month,
      timeZone: SIMULATION_TIMEZONE,
    });
  }

  const pending = mutation.isPending;
  const errorMessage = localError ?? (mutation.isError ? simulationFormError(mutation.error) : null);
  const currentResult =
    scenario === "MONTHS_WITHOUT_INCOME"
      ? results.MONTHS_WITHOUT_INCOME
      : scenario === "NEW_JOB"
        ? results.NEW_JOB
        : results.HOUSING_RESERVE;

  return (
    <section className={styles.page} aria-labelledby="simulations-title">
      <header className={styles.intro}>
        <p className={styles.kicker}>Escenarios</p>
        <h1 id="simulations-title" className={styles.title}>
          Simulaciones
        </h1>
        <p className={styles.lead}>Probá escenarios sin modificar tus datos reales.</p>
        <p className={styles.disclaimer} role="note">
          Las simulaciones no modifican tus movimientos ni saldos.
        </p>
      </header>

      <div
        className={styles.selector}
        role="radiogroup"
        aria-label="Escenario a simular"
      >
        {SCENARIOS.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={scenario === item}
            className={scenario === item ? styles.selectorActive : styles.selectorItem}
            onClick={() => selectScenario(item)}
          >
            {SIMULATION_LABELS[item]}
          </button>
        ))}
      </div>

      <div className={styles.workspace}>
        <div className={styles.formColumn}>
          {scenario === "MONTHS_WITHOUT_INCOME" ? (
            <form className={styles.form} onSubmit={submitMonthsWithoutIncome} aria-busy={pending}>
              <h2 className={styles.formTitle}>Sin ingresos</h2>
              <label className={styles.field}>
                ¿Cuántos meses querés simular sin ingresos?
                <input
                  type="text"
                  inputMode="numeric"
                  min={1}
                  value={months}
                  onChange={(event) => setMonths(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className={styles.shortcuts} role="group" aria-label="Atajos de meses">
                {[3, 6, 12].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.shortcut}
                    onClick={() => setMonths(String(value))}
                  >
                    {value} meses
                  </button>
                ))}
              </div>
              {errorMessage ? (
                <p className={styles.formError} role="alert">
                  {errorMessage}
                </p>
              ) : null}
              <button type="submit" className={styles.primaryCta} disabled={pending}>
                {pending ? "Simulando..." : "Simular"}
              </button>
            </form>
          ) : null}

          {scenario === "NEW_JOB" ? (
            <form className={styles.form} onSubmit={submitNewJob} aria-busy={pending}>
              <h2 className={styles.formTitle}>Nuevo empleo</h2>
              <label className={styles.field}>
                Meses hasta nuevo empleo
                <input
                  type="text"
                  inputMode="numeric"
                  value={monthsUntilJob}
                  onChange={(event) => setMonthsUntilJob(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className={styles.field}>
                Horizonte a simular
                <input
                  type="text"
                  inputMode="numeric"
                  value={totalMonths}
                  onChange={(event) => setTotalMonths(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className={styles.field}>
                Nuevo ingreso mensual
                <input
                  type="text"
                  inputMode="decimal"
                  value={newIncome}
                  onChange={(event) => setNewIncome(event.target.value)}
                  autoComplete="off"
                  placeholder="ARS"
                />
              </label>
              <label className={styles.field}>
                Cambio estimado de gastos (%)
                <input
                  type="text"
                  inputMode="decimal"
                  value={expenseChange}
                  onChange={(event) => setExpenseChange(event.target.value)}
                  autoComplete="off"
                />
              </label>
              {errorMessage ? (
                <p className={styles.formError} role="alert">
                  {errorMessage}
                </p>
              ) : null}
              <button type="submit" className={styles.primaryCta} disabled={pending}>
                {pending ? "Simulando..." : "Simular"}
              </button>
            </form>
          ) : null}

          {scenario === "HOUSING_RESERVE" ? (
            <HousingForm
              obligations={housingQuery.data ?? []}
              loading={housingQuery.isPending}
              loadError={housingQuery.isError}
              onRetry={() => housingQuery.refetch()}
              housingId={housingId}
              selected={selectedHousing}
              targetInstallments={targetInstallments}
              exchangeRate={exchangeRate}
              errorMessage={errorMessage}
              pending={pending}
              onHousingId={setHousingId}
              onTarget={setTargetInstallments}
              onFx={setExchangeRate}
              onSubmit={submitHousing}
            />
          ) : null}
        </div>

        <div className={styles.resultColumn} aria-live="polite">
          {!currentResult && !pending ? (
            <div className={styles.empty}>
              <p>Completá los datos para ver el escenario.</p>
            </div>
          ) : null}
          {pending && !currentResult ? (
            <p className={styles.loading}>Simulando...</p>
          ) : null}
          {scenario === "MONTHS_WITHOUT_INCOME" && results.MONTHS_WITHOUT_INCOME ? (
            <MonthsResult result={results.MONTHS_WITHOUT_INCOME} />
          ) : null}
          {scenario === "NEW_JOB" && results.NEW_JOB ? (
            <NewJobResult result={results.NEW_JOB} />
          ) : null}
          {scenario === "HOUSING_RESERVE" && results.HOUSING_RESERVE ? (
            <HousingResult result={results.HOUSING_RESERVE} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HousingForm({
  obligations,
  loading,
  loadError,
  onRetry,
  housingId,
  selected,
  targetInstallments,
  exchangeRate,
  errorMessage,
  pending,
  onHousingId,
  onTarget,
  onFx,
  onSubmit,
}: {
  obligations: HousingObligation[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  housingId: string;
  selected: HousingObligation | null;
  targetInstallments: string;
  exchangeRate: string;
  errorMessage: string | null;
  pending: boolean;
  onHousingId: (value: string) => void;
  onTarget: (value: string) => void;
  onFx: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className={styles.form} onSubmit={onSubmit} aria-busy={pending}>
      <h2 className={styles.formTitle}>Reserva vivienda</h2>
      {loading ? <p className={styles.loading}>Cargando obligaciones de vivienda</p> : null}
      {loadError ? (
        <div className={styles.error} role="alert">
          <p>No pudimos cargar tu vivienda. Probá de nuevo.</p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : null}
      {!loading && !loadError && obligations.length === 0 ? (
        <p className={styles.formHint}>
          Configurá una obligación de vivienda para simular la reserva.
        </p>
      ) : null}
      {obligations.length > 0 ? (
        <label className={styles.field}>
          Obligación de vivienda
          <select value={housingId} onChange={(event) => onHousingId(event.target.value)}>
            {obligations.length > 1 ? <option value="">Elegí una obligación</option> : null}
            {obligations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.currency})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={styles.field}>
        Cuotas que querés reservar
        <input
          type="text"
          inputMode="numeric"
          value={targetInstallments}
          onChange={(event) => onTarget(event.target.value)}
          autoComplete="off"
        />
      </label>
      {selected ? (
        <p className={styles.formHint}>Pendientes: {selected.remainingInstallments}</p>
      ) : null}
      <div className={styles.shortcuts} role="group" aria-label="Atajos de cuotas">
        {[8, 10].map((value) => (
          <button
            key={value}
            type="button"
            className={styles.shortcut}
            onClick={() => onTarget(String(value))}
          >
            {value}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        Cotización ARS por USD
        <input
          type="text"
          inputMode="decimal"
          value={exchangeRate}
          onChange={(event) => onFx(event.target.value)}
          placeholder="1500"
          autoComplete="off"
        />
      </label>
      <p className={styles.formHint}>Usamos esta cotización sólo para la simulación.</p>
      {errorMessage ? (
        <p className={styles.formError} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="submit"
        className={styles.primaryCta}
        disabled={pending || obligations.length === 0}
      >
        {pending ? "Simulando..." : "Simular"}
      </button>
    </form>
  );
}

function MonthsResult({ result }: { result: MonthsWithoutIncomeResult }) {
  const baselineMissing = hasInsufficientBaseline(
    result.baseline.averageMonthlyFundConsumptionARS
  );
  const depleted = depletedCopy(result.projection.depletedAfterMonth, "months");
  const remaining = result.projection.remainingCapitalARS;

  return (
    <article className={styles.result}>
      <h2 className={styles.resultTitle}>Resultado</h2>
      {baselineMissing ? (
        <p className={styles.notice}>
          Todavía no hay suficiente historial para calcular este escenario.
        </p>
      ) : null}
      <dl className={styles.facts}>
        <div>
          <dt>Capital disponible hoy</dt>
          <dd>{formatMoney(result.baseline.availableCapitalARS, "ARS")}</dd>
        </div>
        <div>
          <dt>Consumo mensual promedio</dt>
          <dd>
            {result.baseline.averageMonthlyFundConsumptionARS
              ? formatMoney(result.baseline.averageMonthlyFundConsumptionARS, "ARS")
              : "No hay suficiente historial para estimar el consumo mensual."}
          </dd>
        </div>
        <div>
          <dt>Runway actual</dt>
          <dd>
            {result.baseline.averageMonthlyFundConsumptionARS
              ? formatRunway(result.baseline.currentRunwayMonths)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Meses simulados</dt>
          <dd>{result.months}</dd>
        </div>
        <div>
          <dt>Total consumido</dt>
          <dd>
            {result.projection.totalFundConsumedARS
              ? formatMoney(result.projection.totalFundConsumedARS, "ARS")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Capital restante</dt>
          <dd>{remaining ? formatMoney(remaining, "ARS") : "—"}</dd>
        </div>
        <div>
          <dt>Runway restante</dt>
          <dd>
            {result.projection.monthlyFundConsumptionARS
              ? formatRunway(result.projection.runwayAfterScenarioMonths)
              : "—"}
          </dd>
        </div>
      </dl>
      {remaining ? (
        <div className={styles.projection}>
          <p>
            Antes: {formatMoney(result.baseline.availableCapitalARS, "ARS")}
          </p>
          <p>
            Después de {result.months} meses: {formatMoney(remaining, "ARS")}
          </p>
          <div className={styles.bar} aria-hidden="true">
            <span
              className={styles.barFill}
              style={{ width: barSharePercent(remaining, result.baseline.availableCapitalARS) }}
            />
          </div>
        </div>
      ) : null}
      {depleted ? <p className={styles.notice}>{depleted}</p> : null}
    </article>
  );
}

function NewJobResult({ result }: { result: NewJobScenarioResult }) {
  const baselineMissing = hasInsufficientBaseline(
    result.baseline.averageMonthlyFundConsumptionARS
  );
  const depleted = depletedCopy(result.projection.depletedAfterMonth, "job");
  const stops = fundStopsConsuming(
    result.projection.finalMonthlyFundConsumptionARS,
    result.projection.runwayAfterScenarioMonths
  );

  return (
    <article className={styles.result}>
      <h2 className={styles.resultTitle}>Resultado</h2>
      {baselineMissing ? (
        <p className={styles.notice}>
          Todavía no hay suficiente historial para calcular este escenario.
        </p>
      ) : null}
      <h3 className={styles.sectionTitle}>Baseline</h3>
      <dl className={styles.facts}>
        <div>
          <dt>Capital disponible</dt>
          <dd>{formatMoney(result.baseline.availableCapitalARS, "ARS")}</dd>
        </div>
        <div>
          <dt>Consumo promedio</dt>
          <dd>
            {result.baseline.averageMonthlyFundConsumptionARS
              ? formatMoney(result.baseline.averageMonthlyFundConsumptionARS, "ARS")
              : "No hay suficiente historial para estimar el consumo mensual."}
          </dd>
        </div>
        <div>
          <dt>Runway actual</dt>
          <dd>
            {result.baseline.averageMonthlyFundConsumptionARS
              ? formatRunway(result.baseline.currentRunwayMonths)
              : "—"}
          </dd>
        </div>
      </dl>
      <h3 className={styles.sectionTitle}>Supuestos</h3>
      <dl className={styles.facts}>
        <div>
          <dt>Meses sin empleo</dt>
          <dd>{result.monthsUntilJob}</dd>
        </div>
        <div>
          <dt>Nuevo ingreso</dt>
          <dd>{formatMoney(result.assumptions.newMonthlyIncomeARS, "ARS")}</dd>
        </div>
        <div>
          <dt>Cambio de gastos</dt>
          <dd>{formatExpenseChangePercent(result.assumptions.expenseChangeFraction)}</dd>
        </div>
        <div>
          <dt>Horizonte</dt>
          <dd>{result.totalMonths} meses</dd>
        </div>
      </dl>
      <h3 className={styles.sectionTitle}>Resultado</h3>
      <dl className={styles.facts}>
        <div>
          <dt>Consumo mensual ajustado</dt>
          <dd>
            {result.projection.adjustedMonthlyConsumptionARS
              ? formatMoney(result.projection.adjustedMonthlyConsumptionARS, "ARS")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Consumido durante etapa sin ingreso</dt>
          <dd>
            {result.projection.phaseWithoutIncome.totalFundConsumedARS
              ? formatMoney(result.projection.phaseWithoutIncome.totalFundConsumedARS, "ARS")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Capital al conseguir empleo</dt>
          <dd>
            {result.projection.phaseWithoutIncome.remainingCapitalARS
              ? formatMoney(result.projection.phaseWithoutIncome.remainingCapitalARS, "ARS")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Draw mensual después del empleo</dt>
          <dd>
            {result.projection.phaseWithNewJob.effectiveMonthlyDrawARS
              ? formatMoney(result.projection.phaseWithNewJob.effectiveMonthlyDrawARS, "ARS")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Capital final</dt>
          <dd>
            {result.projection.remainingCapitalARS
              ? formatMoney(result.projection.remainingCapitalARS, "ARS")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Total consumido</dt>
          <dd>
            {result.projection.totalFundConsumedARS
              ? formatMoney(result.projection.totalFundConsumedARS, "ARS")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Runway final</dt>
          <dd>
            {stops
              ? "El fondo dejaría de consumirse con este escenario."
              : result.projection.finalMonthlyFundConsumptionARS
                ? formatRunway(result.projection.runwayAfterScenarioMonths)
                : "—"}
          </dd>
        </div>
      </dl>
      {depleted ? <p className={styles.notice}>{depleted}</p> : null}
    </article>
  );
}

function HousingResult({ result }: { result: HousingReserveSimulationResult }) {
  return (
    <article className={styles.result}>
      <h2 className={styles.resultTitle}>Resultado</h2>
      {result.housing.currentReserveUSD === null ? (
        <p className={styles.notice}>Sin cuenta de reserva configurada</p>
      ) : null}
      <dl className={styles.facts}>
        <div>
          <dt>Cuota mensual</dt>
          <dd>{formatMoney(result.housing.installmentAmountUSD, "USD")}</dd>
        </div>
        <div>
          <dt>Cuotas objetivo</dt>
          <dd>{result.targetInstallments}</dd>
        </div>
        <div>
          <dt>Reserva objetivo</dt>
          <dd>{formatMoney(result.housing.targetReserveUSD, "USD")}</dd>
        </div>
        <div>
          <dt>Reserva actual</dt>
          <dd>
            {result.housing.currentReserveUSD
              ? formatMoney(result.housing.currentReserveUSD, "USD")
              : "Sin cuenta de reserva configurada"}
          </dd>
        </div>
        <div>
          <dt>Reserva utilizable</dt>
          <dd>{formatMoney(result.housing.effectiveCurrentReserveUSD, "USD")}</dd>
        </div>
        <div>
          <dt>Cuotas cubiertas actuales</dt>
          <dd>
            {result.housing.currentCoveredInstallments
              ? formatCoveredInstallments(result.housing.currentCoveredInstallments)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>USD faltantes</dt>
          <dd>{formatMoney(result.housing.missingReserveUSD, "USD")}</dd>
        </div>
        <div>
          <dt>USD excedentes</dt>
          <dd>{formatMoney(result.housing.excessReserveUSD, "USD")}</dd>
        </div>
        <div>
          <dt>ARS necesarios</dt>
          <dd>{formatMoney(result.fx.arsRequiredForMissingReserve, "ARS")}</dd>
        </div>
        <div>
          <dt>Capital ARS disponible</dt>
          <dd>{formatMoney(result.ars.totalAvailableARS, "ARS")}</dd>
        </div>
        <div>
          <dt>Capital ARS hipotético restante</dt>
          <dd>{formatMoney(result.ars.remainingAvailableARSAfterReserve, "ARS")}</dd>
        </div>
        <div>
          <dt>Faltante ARS</dt>
          <dd>{formatMoney(result.ars.arsShortfall, "ARS")}</dd>
        </div>
        <div>
          <dt>¿Se puede cubrir?</dt>
          <dd>
            {result.ars.canFullyFundFromAvailableARS
              ? "Con el capital ARS disponible podrías cubrir este objetivo."
              : `Faltarían ${formatMoney(result.ars.arsShortfall, "ARS")} para cubrir este objetivo.`}
          </dd>
        </div>
        <div>
          <dt>Runway actual</dt>
          <dd>{formatRunway(result.ars.currentRunwayMonths)}</dd>
        </div>
      </dl>
    </article>
  );
}
