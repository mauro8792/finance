"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  getAccounts,
  getCategories,
  getTransactions,
  updateTransaction,
  voidTransaction,
} from "../lib/api";
import { formatMoney, formatMonthLabel } from "../lib/format-money";
import {
  isValidAmount,
  localDateTimeToIso,
  PAYMENT_METHOD_LABELS,
  toApiAmount,
  toLocalDateTimeInput,
} from "../lib/quick-add";
import {
  canEditTransaction,
  canVoidTransaction,
  directionLabel,
  filterYearOptions,
  formatTransactionDate,
  incomeKindLabel,
  paymentMethodLabel,
  reimbursementLabel,
  TRANSACTION_TYPES,
  transactionAmountSign,
  transactionFormError,
  toTransactionListFilters,
  transactionStatusLabel,
  transactionTypeLabel,
} from "../lib/transactions";
import type {
  Category,
  PaymentMethod,
  Transaction,
  TransactionListFilters,
  TransactionStatus,
  TransactionType,
} from "../lib/types";
import styles from "./Transactions.module.css";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function TransactionsPage() {
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [type, setType] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");

  const filters = useMemo<TransactionListFilters>(
    () =>
      toTransactionListFilters({
        year,
        month,
        type,
        accountId,
        categoryId,
        status,
      }),
    [year, month, type, accountId, categoryId, status]
  );

  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => getTransactions(filters),
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const accountNames = Object.fromEntries(
    (accounts.data ?? []).map((account) => [account.id, account.name])
  );
  const categoryNames = Object.fromEntries(
    (categories.data ?? []).map((category) => [category.id, category.name])
  );

  async function refreshAfterChange() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["account-balances"] }),
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
    ]);
  }

  return (
    <section className={styles.page} aria-labelledby="transactions-title">
      <header className={styles.intro}>
        <p className={styles.kicker}>Movimientos</p>
        <h1 id="transactions-title" className={styles.title}>
          Movimientos
        </h1>
        <p className={styles.lead}>
          Consultá el historial. Para cargar uno nuevo usá Registrar.
        </p>
      </header>

      <div className={styles.filters}>
        <label className={styles.field}>
          Año
          <select
            aria-label="Año"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          >
            <option value="">Todos</option>
            {filterYearOptions().map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Mes
          <select
            aria-label="Mes"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          >
            <option value="">Todos</option>
            {MONTHS.map((option) => (
              <option key={option} value={option}>
                {formatMonthLabel(2026, option).replace(" 2026", "")}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Tipo
          <select
            aria-label="Tipo"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Todos</option>
            {TRANSACTION_TYPES.map((option) => (
              <option key={option} value={option}>
                {transactionTypeLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Cuenta
          <select
            aria-label="Cuenta"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">Todas</option>
            {(accounts.data ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Categoría
          <select
            aria-label="Categoría"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Todas</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Estado
          <select
            aria-label="Estado"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Activo</option>
            <option value="VOIDED">Anulado</option>
          </select>
        </label>
      </div>

      {query.isPending ? <TransactionsSkeleton /> : null}

      {query.isError ? (
        <div className={styles.error} role="alert">
          <p>No pudimos cargar tus movimientos. Probá de nuevo.</p>
          <button type="button" className={styles.retry} onClick={() => query.refetch()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {query.data && query.data.length === 0 ? (
        <div className={styles.empty}>
          <p>Aún no registraste movimientos.</p>
          <Link href="/registrar" className={styles.primaryCta}>
            Registrar movimiento
          </Link>
        </div>
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className={styles.list}>
          {query.data.map((transaction) => (
            <li key={transaction.id}>
              <TransactionCard
                transaction={transaction}
                accountName={accountNames[transaction.accountId] ?? "Cuenta"}
                categoryName={
                  transaction.categoryId
                    ? categoryNames[transaction.categoryId] ?? "Categoría"
                    : null
                }
                categories={categories.data ?? []}
                onChanged={refreshAfterChange}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TransactionsSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Cargando movimientos">
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
    </div>
  );
}

function TransactionCard({
  transaction,
  accountName,
  categoryName,
  categories,
  onChanged,
}: {
  transaction: Transaction;
  accountName: string;
  categoryName: string | null;
  categories: Category[];
  onChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const sign = transactionAmountSign(transaction);
  const money = formatMoney(transaction.amount, transaction.currency);
  const signedAmount = sign ? `${sign} ${money}` : money;
  const kind = incomeKindLabel(transaction.metadata?.incomeKind);
  const reimbursement = reimbursementLabel(transaction.reimbursementStatus);
  const method = paymentMethodLabel(transaction.paymentMethod);
  const direction = directionLabel(transaction.metadata);
  const allowEdit = canEditTransaction(transaction);
  const allowVoid = canVoidTransaction(transaction);

  const voidMut = useMutation({
    mutationFn: () => voidTransaction(transaction.id),
    onSuccess: async () => {
      await onChanged();
      setConfirmVoid(false);
    },
  });

  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <div>
          <p className={styles.date}>{formatTransactionDate(transaction.occurredAt)}</p>
          <p className={styles.type}>
            {transactionTypeLabel(transaction.type)}
            {kind ? ` · ${kind}` : ""}
          </p>
        </div>
        <p
          className={`${styles.amount} ${
            sign === "-"
              ? styles.amountNegative
              : sign === "+"
                ? styles.amountPositive
                : ""
          }`}
        >
          {signedAmount}
        </p>
      </div>
      <p className={styles.metaLine}>{accountName}</p>
      <p className={styles.metaLine}>
        {categoryName ?? transaction.description ?? "Sin categoría"}
      </p>
      {transaction.description && categoryName ? (
        <p className={styles.metaLine}>{transaction.description}</p>
      ) : null}
      {kind && transaction.type === "INCOME" ? (
        <p className={styles.metaLine}>{kind}</p>
      ) : null}
      <span className={transaction.status === "VOIDED" ? styles.badgeVoided : styles.badge}>
        {transactionStatusLabel(transaction.status)}
      </span>
      {method ? <p className={styles.metaLine}>{method}</p> : null}
      {transaction.isFixed ? <p className={styles.metaLine}>Gasto fijo</p> : null}
      {reimbursement ? <p className={styles.metaLine}>{reimbursement}</p> : null}

      {expanded ? (
        <div className={styles.details}>
          {direction ? <p className={styles.metaLine}>{direction}</p> : null}
          <p className={styles.metaLine}>{transaction.currency}</p>
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Ocultar detalle" : "Ver detalle"}
        </button>
        {allowEdit ? (
          <button type="button" className={styles.edit} onClick={() => setEditing(true)}>
            Editar
          </button>
        ) : null}
        {allowVoid ? (
          <button type="button" className={styles.danger} onClick={() => setConfirmVoid(true)}>
            Anular
          </button>
        ) : null}
      </div>

      {editing ? (
        <EditTransactionForm
          transaction={transaction}
          categories={categories}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            await onChanged();
            setEditing(false);
          }}
        />
      ) : null}

      {confirmVoid ? (
        <div className={styles.form}>
          <p className={styles.confirm}>¿Querés anular este movimiento?</p>
          {voidMut.isError ? (
            <p className={styles.formError}>{transactionFormError(voidMut.error)}</p>
          ) : null}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.danger}
              disabled={voidMut.isPending}
              onClick={() => voidMut.mutate()}
            >
              Confirmar anulación
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setConfirmVoid(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function EditTransactionForm({
  transaction,
  categories,
  onClose,
  onSaved,
}: {
  transaction: Transaction;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(transaction.amount);
  const [description, setDescription] = useState(transaction.description ?? "");
  const [occurredAt, setOccurredAt] = useState(
    toLocalDateTimeInput(new Date(transaction.occurredAt))
  );
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [paymentMethod, setPaymentMethod] = useState(transaction.paymentMethod ?? "");
  const [isFixed, setIsFixed] = useState(transaction.isFixed);
  const [formError, setFormError] = useState<string | null>(null);

  const categoryOptions = categories.filter((category) => {
    if (!category.isActive) {
      return category.id === transaction.categoryId;
    }
    if (transaction.type === "EXPENSE") {
      return category.type === "EXPENSE" || category.type === "BOTH";
    }
    if (transaction.type === "INCOME") {
      return category.type === "INCOME" || category.type === "BOTH";
    }
    return true;
  });

  const save = useMutation({
    mutationFn: () => {
      if (!isValidAmount(amount)) {
        throw new Error("El importe no es válido.");
      }
      return updateTransaction(transaction.id, {
        amount: toApiAmount(amount),
        description: description.trim() || null,
        occurredAt: localDateTimeToIso(occurredAt),
        ...(transaction.categoryId !== null || categoryId
          ? { categoryId: categoryId || undefined }
          : {}),
        ...(transaction.type === "EXPENSE"
          ? {
              paymentMethod: (paymentMethod || null) as PaymentMethod | null,
              isFixed,
            }
          : {}),
      });
    },
    onSuccess: async () => {
      await onSaved();
    },
    onError: (error) => {
      setFormError(transactionFormError(error));
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    save.mutate();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h2 className={styles.formTitle}>Editar movimiento</h2>
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
      {transaction.categoryId !== null || categoryOptions.length > 0 ? (
        <label className={styles.field}>
          Categoría
          <select
            aria-label="Categoría del movimiento"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Sin categoría</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={styles.field}>
        Descripción
        <input
          aria-label="Descripción"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {transaction.type === "EXPENSE" ? (
        <>
          <label className={styles.field}>
            Medio de pago
            <select
              aria-label="Medio de pago"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              <option value="">Ninguno</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={isFixed}
              onChange={(event) => setIsFixed(event.target.checked)}
            />
            Gasto fijo
          </label>
        </>
      ) : null}
      {formError ? <p className={styles.formError}>{formError}</p> : null}
      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryCta} disabled={save.isPending}>
          Guardar
        </button>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
