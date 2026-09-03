"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AI_QUERY_INVALIDATIONS } from "../lib/ai-quick-input";
import { createTransaction, getAccounts, getCategories } from "../lib/api";
import {
  LAST_ACCOUNT_KEY,
  LAST_PAYMENT_KEY,
  PAYMENT_METHOD_LABELS,
  filterActiveAccounts,
  filterCategoriesForType,
  isCategoryRequired,
  isValidAmount,
  localDateTimeToIso,
  normalizeAmountInput,
  toApiAmount,
  toLocalDateTimeInput,
} from "../lib/quick-add";
import type { Currency, IncomeKind, MovementKind, PaymentMethod } from "../lib/types";
import { EmptyState, ErrorState, LoadingState } from "./QueryStatus";
import styles from "./QuickAddForm.module.css";

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export type QuickAddInitialValues = {
  kind?: MovementKind;
  amount?: string;
  accountId?: string;
  categoryId?: string;
  description?: string;
  occurredAt?: string;
  paymentMethod?: PaymentMethod | null;
  incomeKind?: IncomeKind | null;
  lockCurrency?: Currency;
};

type QuickAddFormProps = {
  initialValues?: QuickAddInitialValues;
  onSaved?: () => void;
};

export function QuickAddForm({ initialValues, onSaved }: QuickAddFormProps = {}) {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });
  const aiMode = Boolean(initialValues);

  const [kind, setKind] = useState<MovementKind>(initialValues?.kind ?? "EXPENSE");
  const [amount, setAmount] = useState(initialValues?.amount ?? "");
  const [accountId, setAccountId] = useState(initialValues?.accountId ?? "");
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [occurredAt, setOccurredAt] = useState(
    () => initialValues?.occurredAt ?? toLocalDateTimeInput(new Date())
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialValues?.paymentMethod ?? "CASH"
  );
  const [isFixed, setIsFixed] = useState(false);
  const [incomeKind, setIncomeKind] = useState<IncomeKind>(
    initialValues?.incomeKind ?? "OPERATING"
  );
  const [success, setSuccess] = useState<string | null>(null);

  const accounts = useMemo(() => {
    const active = filterActiveAccounts(accountsQuery.data ?? []);
    if (!initialValues?.lockCurrency) {
      return active;
    }
    return active.filter((account) => account.currency === initialValues.lockCurrency);
  }, [accountsQuery.data, initialValues?.lockCurrency]);
  const categories = useMemo(
    () => filterCategoriesForType(categoriesQuery.data ?? [], kind),
    [categoriesQuery.data, kind]
  );
  const selectedAccount = accounts.find((account) => account.id === accountId);

  useEffect(() => {
    if (accounts.length === 0) {
      return;
    }

    setAccountId((current) => {
      if (accounts.some((account) => account.id === current)) {
        return current;
      }
      if (aiMode) {
        return "";
      }
      const stored =
        typeof window !== "undefined" ? localStorage.getItem(LAST_ACCOUNT_KEY) : null;
      const preferred = accounts.find((account) => account.id === stored) ?? accounts[0];
      return preferred.id;
    });
  }, [accounts, aiMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem(LAST_PAYMENT_KEY);
    if (stored && stored in PAYMENT_METHOD_LABELS) {
      setPaymentMethod(stored as PaymentMethod);
    }
  }, []);

  useEffect(() => {
    setCategoryId((current) =>
      categories.some((category) => category.id === current) ? current : ""
    );
  }, [categories]);

  const mutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: async (created) => {
      if (accountId) {
        localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
      }
      if (kind === "EXPENSE") {
        localStorage.setItem(LAST_PAYMENT_KEY, paymentMethod);
      }
      await Promise.all(
        AI_QUERY_INVALIDATIONS.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      );
      setAmount("");
      setDescription("");
      setOccurredAt(toLocalDateTimeInput(new Date()));
      setIsFixed(false);
      setSuccess(
        created.type === "INCOME"
          ? "Ingreso registrado."
          : "Gasto registrado."
      );
      onSaved?.();
    },
  });

  const loading = accountsQuery.isPending || categoriesQuery.isPending;
  const loadError = accountsQuery.isError || categoriesQuery.isError;
  const categoryRequired = isCategoryRequired(kind, incomeKind);
  const canSubmit =
    !mutation.isPending &&
    Boolean(accountId && selectedAccount && isValidAmount(amount)) &&
    (!categoryRequired || Boolean(categoryId));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccess(null);

    if (!selectedAccount || !isValidAmount(amount)) {
      return;
    }
    if (categoryRequired && !categoryId) {
      return;
    }

    const shared = {
      amount: toApiAmount(amount),
      currency: selectedAccount.currency,
      accountId: selectedAccount.id,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(occurredAt ? { occurredAt: localDateTimeToIso(occurredAt) } : {}),
    };

    if (kind === "INCOME") {
      mutation.mutate({
        ...shared,
        ...(categoryId ? { categoryId } : {}),
        type: "INCOME",
        incomeKind,
      });
      return;
    }

    mutation.mutate({
      ...shared,
      categoryId,
      paymentMethod,
      isFixed,
    });
  }

  if (loading) {
    return <LoadingState label="Cargando cuentas y categorías…" />;
  }

  if (loadError) {
    return (
      <ErrorState
        message="No pudimos cargar las cuentas o categorías. Probá de nuevo."
        onRetry={() => {
          void accountsQuery.refetch();
          void categoriesQuery.refetch();
        }}
      />
    );
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        message="No hay cuentas activas. Creá una cuenta antes de registrar un movimiento."
        action={{ href: "/accounts", label: "Ir a Cuentas" }}
      />
    );
  }

  const persistError = mutation.isError
    ? "No pudimos guardar el movimiento. Intentá nuevamente."
    : null;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-label={aiMode ? "Revisar movimiento interpretado" : "Registrar movimiento"}>
      <fieldset className={styles.kind}>
        <legend className={styles.srOnly}>Tipo de movimiento</legend>
        <button
          type="button"
          className={kind === "EXPENSE" ? styles.kindActive : styles.kindButton}
          onClick={() => setKind("EXPENSE")}
        >
          Gasto
        </button>
        <button
          type="button"
          className={kind === "INCOME" ? styles.kindActive : styles.kindButton}
          onClick={() => setKind("INCOME")}
        >
          Ingreso
        </button>
      </fieldset>

      <label className={styles.amountLabel} htmlFor="quick-add-amount">
        Importe
        <span className={styles.amountRow}>
          <span className={styles.currency}>{selectedAccount?.currency ?? "—"}</span>
          <input
            id="quick-add-amount"
            className={styles.amount}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            autoFocus
            placeholder="0,00"
            value={amount}
            onChange={(event) => {
              setSuccess(null);
              setAmount(normalizeAmountInput(event.target.value));
            }}
            aria-invalid={amount.length > 0 && !isValidAmount(amount)}
          />
        </span>
      </label>

      <label className={styles.field} htmlFor="quick-add-account">
        Cuenta
        <select
          id="quick-add-account"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          required
        >
          {aiMode ? <option value="">Elegí una cuenta</option> : null}
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} — {account.currency}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field} htmlFor="quick-add-category">
        Categoría
        {!categoryRequired ? <span className={styles.optional}> (opcional)</span> : null}
        <select
          id="quick-add-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          required={categoryRequired}
        >
          <option value="">Elegí una categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      {categories.length === 0 ? (
        <p className={styles.status}>
          No hay categorías activas para este tipo de movimiento.
        </p>
      ) : null}

      {kind === "INCOME" ? (
        <fieldset className={styles.incomeKind}>
          <legend>Tipo de ingreso</legend>
          <label className={styles.radio}>
            <input
              type="radio"
              name="incomeKind"
              value="OPERATING"
              checked={incomeKind === "OPERATING"}
              onChange={() => setIncomeKind("OPERATING")}
            />
            <span>
              <strong>Ingreso normal</strong>
              <small>Sueldo, prestación, freelance u otro ingreso habitual.</small>
            </span>
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="incomeKind"
              value="CAPITAL"
              checked={incomeKind === "CAPITAL"}
              onChange={() => setIncomeKind("CAPITAL")}
            />
            <span>
              <strong>Capital</strong>
              <small>Dinero inicial, indemnización o patrimonio que incorporás.</small>
            </span>
          </label>
        </fieldset>
      ) : null}

      <label className={styles.field} htmlFor="quick-add-description">
        Descripción <span className={styles.optional}>(opcional)</span>
        <input
          id="quick-add-description"
          maxLength={255}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className={kind === "EXPENSE" ? styles.pair : undefined}>
        <label className={styles.field} htmlFor="quick-add-occurred-at">
          Fecha
          <input
            id="quick-add-occurred-at"
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>

        {kind === "EXPENSE" ? (
          <label className={styles.field} htmlFor="quick-add-payment">
            Medio de pago
            <select
              id="quick-add-payment"
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value as PaymentMethod)
              }
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {kind === "EXPENSE" ? (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={isFixed}
            onChange={(event) => setIsFixed(event.target.checked)}
          />
          Gasto fijo
        </label>
      ) : null}

      {persistError ? (
        <p className={styles.error} role="alert">
          {persistError}
        </p>
      ) : null}
      {success ? (
        <p className={styles.success} role="status">
          {success}
        </p>
      ) : null}

      <button className={styles.submit} type="submit" disabled={!canSubmit || mutation.isPending}>
        {mutation.isPending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
