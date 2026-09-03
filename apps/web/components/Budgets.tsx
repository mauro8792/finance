"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { createBudget, getBudgets, getCategories, updateBudget } from "../lib/api";
import { budgetFormError, categoriesForNewBudget } from "../lib/budgets";
import {
  currentYearMonth,
  formatMoney,
  formatMonthLabel,
  formatUsedPercent,
  isPositiveAmount,
  isUsedPercentOver,
  usedPercentBarWidth,
} from "../lib/format-money";
import { isValidAmount, normalizeAmountInput, toApiAmount } from "../lib/quick-add";
import type { BudgetView, Currency } from "../lib/types";
import { EmptyState, ErrorState } from "./QueryStatus";
import styles from "./Budgets.module.css";

type BudgetsProps = {
  year?: number;
  month?: number;
};

type Panel =
  | { mode: "create" }
  | { mode: "edit"; budget: BudgetView };

export function Budgets({ year, month }: BudgetsProps) {
  const current = currentYearMonth();
  const selectedYear = year ?? current.year;
  const selectedMonth = month ?? current.month;
  const [panel, setPanel] = useState<Panel | null>(null);

  const query = useQuery({
    queryKey: ["budgets", selectedYear, selectedMonth],
    queryFn: () => getBudgets(selectedYear, selectedMonth),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  return (
    <section className={styles.page} aria-labelledby="budgets-title">
      <header className={styles.intro}>
        <p className={styles.kicker}>Presupuestos</p>
        <h1 id="budgets-title" className={styles.title}>
          {formatMonthLabel(selectedYear, selectedMonth)}
        </h1>
        <p className={styles.lead}>Tope, gastado neto y ritmo de cada categoría.</p>
        <button
          type="button"
          className={styles.primaryCta}
          onClick={() => setPanel({ mode: "create" })}
        >
          Crear presupuesto
        </button>
      </header>

      {panel ? (
        <BudgetForm
          panel={panel}
          year={selectedYear}
          month={selectedMonth}
          budgets={query.data ?? []}
          categories={categoriesQuery.data ?? []}
          categoriesLoading={categoriesQuery.isPending}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {query.isPending ? <BudgetsSkeleton /> : null}

      {query.isError ? (
        <ErrorState
          message="No pudimos cargar tus presupuestos. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.data && query.data.length === 0 && panel?.mode !== "create" ? (
        <EmptyState
          message="Aún no tenés presupuestos para este mes."
          action={{ label: "Crear presupuesto", onClick: () => setPanel({ mode: "create" }) }}
        />
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className={styles.grid}>
          {query.data.map((budget) => (
            <li key={budget.id}>
              <BudgetCard budget={budget} onEdit={() => setPanel({ mode: "edit", budget })} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BudgetCard({
  budget,
  onEdit,
}: {
  budget: BudgetView;
  onEdit: () => void;
}) {
  const over = isUsedPercentOver(budget.usedPercent);
  const negativeAvailable = !isPositiveAmount(budget.available) && budget.available !== "0.00";
  const paceLabel = budget.spendingPace.aboveExpectedPace
    ? "Más rápido de lo esperado"
    : "En línea";

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <h2 className={styles.category}>{budget.category.name}</h2>
        <p className={styles.currency}>{budget.currency}</p>
      </header>
      <p className={styles.spent}>
        {formatMoney(budget.consumption, budget.currency)} de{" "}
        {formatMoney(budget.amount, budget.currency)}
      </p>
      <div className={styles.barRow}>
        <div className={styles.barTrack} aria-hidden="true">
          <span
            className={over ? styles.barFillOver : styles.barFill}
            style={{ width: usedPercentBarWidth(budget.usedPercent) }}
          />
        </div>
        <strong className={over ? styles.percentOver : styles.percent}>
          {formatUsedPercent(budget.usedPercent)}
        </strong>
      </div>
      <dl className={styles.meta}>
        <div>
          <dt>Disponible</dt>
          <dd className={negativeAvailable ? styles.negative : undefined}>
            {formatMoney(budget.available, budget.currency)}
          </dd>
        </div>
        <div>
          <dt>Ritmo</dt>
          <dd>
            <span className={styles.paceText}>{paceLabel}</span>
            <small>
              Día {budget.spendingPace.elapsedDays} de {budget.spendingPace.totalDays}
            </small>
          </dd>
        </div>
      </dl>
      <button type="button" className={styles.edit} onClick={onEdit}>
        Editar
      </button>
    </article>
  );
}

function BudgetForm({
  panel,
  year,
  month,
  budgets,
  categories,
  categoriesLoading,
  onClose,
}: {
  panel: Panel;
  year: number;
  month: number;
  budgets: BudgetView[];
  categories: CategoryLike[];
  categoriesLoading: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = panel.mode === "edit";
  const [categoryId, setCategoryId] = useState(
    panel.mode === "edit" ? panel.budget.category.id : ""
  );
  const [currency, setCurrency] = useState<Currency>(
    panel.mode === "edit" ? panel.budget.currency : "ARS"
  );
  const [amount, setAmount] = useState(panel.mode === "edit" ? panel.budget.amount : "");

  const options = useMemo(
    () => categoriesForNewBudget(categories, budgets, currency),
    [categories, budgets, currency]
  );

  const create = useMutation({
    mutationFn: createBudget,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets", year, month] });
      onClose();
    },
  });

  const update = useMutation({
    mutationFn: (value: string) => updateBudget(panel.mode === "edit" ? panel.budget.id : "", value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets", year, month] });
      onClose();
    },
  });

  const pending = create.isPending || update.isPending;
  const canSubmit = !pending && isValidAmount(amount) && (isEdit || Boolean(categoryId));
  const error = create.error ?? update.error;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidAmount(amount)) {
      return;
    }

    const apiAmount = toApiAmount(amount);
    if (isEdit) {
      update.mutate(apiAmount);
      return;
    }

    if (!categoryId) {
      return;
    }

    create.mutate({
      categoryId,
      amount: apiAmount,
      currency,
      year,
      month,
    });
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-label={isEdit ? "Editar presupuesto" : "Crear presupuesto"}>
      <h2 className={styles.formTitle}>{isEdit ? "Editar monto" : "Nuevo presupuesto"}</h2>
      <p className={styles.formPeriod}>{formatMonthLabel(year, month)}</p>

      {isEdit ? (
        <p className={styles.locked}>
          {panel.budget.category.name} · {panel.budget.currency}
        </p>
      ) : (
        <>
          <label className={styles.field} htmlFor="budget-category">
            Categoría
            <select
              id="budget-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              required
              disabled={categoriesLoading}
            >
              <option value="">Elegí una categoría</option>
              {options.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field} htmlFor="budget-currency">
            Moneda
            <select
              id="budget-currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
          {!categoriesLoading && options.length === 0 ? (
            <p className={styles.formHint}>
              Todas las categorías de gasto ya tienen presupuesto en {currency} este mes.
            </p>
          ) : null}
        </>
      )}

      <label className={styles.field} htmlFor="budget-amount">
        Monto
        <input
          id="budget-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={amount}
          onChange={(event) => setAmount(normalizeAmountInput(event.target.value))}
          aria-invalid={amount.length > 0 && !isValidAmount(amount)}
        />
      </label>

      {error ? (
        <p className={styles.formError} role="alert">
          {budgetFormError(error)}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryCta} disabled={!canSubmit}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

type CategoryLike = Parameters<typeof categoriesForNewBudget>[0][number];

function BudgetsSkeleton() {
  return (
    <div className={styles.grid} aria-busy="true" aria-live="polite">
      <p className={styles.srOnly}>Cargando presupuestos</p>
      <div className={`${styles.card} ${styles.skeletonBlock}`} />
      <div className={`${styles.card} ${styles.skeletonBlock}`} />
    </div>
  );
}
