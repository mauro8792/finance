"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClientError, createTransaction, getAccounts, getCategories } from "../lib/api";
import {
  LAST_ACCOUNT_KEY,
  LAST_PAYMENT_KEY,
  PAYMENT_METHOD_LABELS,
  filterActiveAccounts,
  filterCategoriesForType,
  isValidAmount,
  localDateTimeToIso,
  normalizeAmountInput,
  toApiAmount,
  toLocalDateTimeInput,
} from "../lib/quick-add";
import type { IncomeKind, MovementKind, PaymentMethod } from "../lib/types";
import styles from "./QuickAddForm.module.css";

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function QuickAddForm() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const [kind, setKind] = useState<MovementKind>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [isFixed, setIsFixed] = useState(false);
  const [incomeKind, setIncomeKind] = useState<IncomeKind>("OPERATING");
  const [success, setSuccess] = useState<string | null>(null);

  const accounts = useMemo(
    () => filterActiveAccounts(accountsQuery.data ?? []),
    [accountsQuery.data]
  );
  const categories = useMemo(
    () => filterCategoriesForType(categoriesQuery.data ?? [], kind),
    [categoriesQuery.data, kind]
  );
  const selectedAccount = accounts.find((account) => account.id === accountId);

  useEffect(() => {
    if (accounts.length === 0) {
      return;
    }

    const stored =
      typeof window !== "undefined" ? localStorage.getItem(LAST_ACCOUNT_KEY) : null;
    const preferred = accounts.find((account) => account.id === stored) ?? accounts[0];
    setAccountId((current) =>
      accounts.some((account) => account.id === current) ? current : preferred.id
    );
  }, [accounts]);

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
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setAmount("");
      setDescription("");
      setOccurredAt(toLocalDateTimeInput(new Date()));
      setIsFixed(false);
      setSuccess(
        created.type === "INCOME"
          ? "Ingreso registrado."
          : "Gasto registrado."
      );
    },
  });

  const loading = accountsQuery.isLoading || categoriesQuery.isLoading;
  const loadError = accountsQuery.error ?? categoriesQuery.error;
  const canSubmit =
    !mutation.isPending &&
    Boolean(accountId && categoryId && selectedAccount && isValidAmount(amount));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccess(null);

    if (!selectedAccount || !categoryId || !isValidAmount(amount)) {
      return;
    }

    const payloadBase = {
      amount: toApiAmount(amount),
      currency: selectedAccount.currency,
      accountId: selectedAccount.id,
      categoryId,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(occurredAt ? { occurredAt: localDateTimeToIso(occurredAt) } : {}),
    };

    if (kind === "INCOME") {
      mutation.mutate({
        ...payloadBase,
        type: "INCOME",
        incomeKind,
      });
      return;
    }

    mutation.mutate({
      ...payloadBase,
      paymentMethod,
      isFixed,
    });
  }

  if (loading) {
    return <p className={styles.status}>Cargando cuentas y categorías…</p>;
  }

  if (loadError) {
    const message =
      loadError instanceof ApiClientError
        ? loadError.message
        : "No se pudieron cargar las cuentas o categorías.";
    return <p className={styles.error}>{message}</p>;
  }

  if (accounts.length === 0) {
    return (
      <p className={styles.error}>
        No hay cuentas activas. Creá una cuenta antes de registrar un movimiento.
      </p>
    );
  }

  const mutationError =
    mutation.error instanceof ApiClientError
      ? mutation.error.message
      : mutation.error
        ? "No se pudo guardar el movimiento."
        : null;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-label="Registrar movimiento">
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
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} — {account.currency}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field} htmlFor="quick-add-category">
        Categoría
        <select
          id="quick-add-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          required
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
        <p className={styles.error}>
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

      {mutationError ? (
        <p className={styles.error} role="alert">
          {mutationError}
        </p>
      ) : null}
      {success ? (
        <p className={styles.success} role="status">
          {success}
        </p>
      ) : null}

      <button className={styles.submit} type="submit" disabled={!canSubmit}>
        {mutation.isPending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
