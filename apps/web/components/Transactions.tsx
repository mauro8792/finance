"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  exportTransactionsCsv,
  getAccounts,
  getCategories,
  getTransactions,
  updateTransaction,
  voidTransaction,
  voidTransfer,
} from "../lib/api";
import { formatMonthLabel } from "../lib/format-money";
import {
  isValidAmount,
  localDateTimeToIso,
  PAYMENT_METHOD_LABELS,
  toApiAmount,
  toLocalDateTimeInput,
} from "../lib/quick-add";
import {
  canCorrectTransaction,
  canEditTransaction,
  canVoidTransaction,
  canVoidTransfer,
  directionLabel,
  filterYearOptions,
  formatTransactionDate,
  groupTransactionsForDisplay,
  incomeKindLabel,
  paymentMethodLabel,
  reimbursementLabel,
  TRANSACTION_TYPES,
  transactionAmountSign,
  transactionFormError,
  toCorrectionInitialValues,
  toTransactionListFilters,
  transactionStatusLabel,
  transactionTypeLabel,
  VOID_HISTORY_NOTICE,
  type MovementListItem,
} from "../lib/transactions";
import type {
  Category,
  PaymentMethod,
  Transaction,
  TransactionListFilters,
  TransactionType,
} from "../lib/types";
import { PrivacyToggle } from "./PrivacyToggle";
import { QuickAddForm } from "./QuickAddForm";
import { EmptyState, ErrorState } from "./QueryStatus";
import { BottomSheet } from "./ui/BottomSheet";
import { Money } from "./ui/Money";
import { PageHeader } from "./ui/PageHeader";
import { Skeleton } from "./ui/Skeleton";
import { StatusBadge } from "./ui/StatusBadge";
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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const activeFilterCount = [year, month, type, accountId, categoryId, status].filter(
    (value) => value !== ""
  ).length;

  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => getTransactions(filters),
  });
  const exportCsv = useMutation({
    mutationFn: () => exportTransactionsCsv(filters),
    retry: false,
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
  const movementItems = useMemo(
    () => (query.data ? groupTransactionsForDisplay(query.data) : []),
    [query.data]
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

  function clearFilters() {
    setYear("");
    setMonth("");
    setType("");
    setAccountId("");
    setCategoryId("");
    setStatus("");
  }

  // Los campos se montan una sola vez: inline en desktop, dentro del sheet en
  // mobile. Así no se duplican los controles ni sus etiquetas.
  const filterFields = (
    <div className={styles.filterFields}>
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
          <option value="REVERSED">Reversado</option>
        </select>
      </label>
    </div>
  );

  return (
    <section className={styles.page} aria-label="Movimientos">
      <PageHeader
        title="Movimientos"
        actions={
          <>
            <button
              type="button"
              className={styles.filtersTrigger}
              onClick={() => setFiltersOpen(true)}
              aria-expanded={filtersOpen}
            >
              Filtros
              {activeFilterCount > 0 ? (
                <span
                  className={styles.filtersCount}
                  aria-label={`${activeFilterCount} filtros activos`}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
            <PrivacyToggle />
          </>
        }
      />

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.exportButton}
          disabled={exportCsv.isPending}
          onClick={() => exportCsv.mutate()}
        >
          {exportCsv.isPending ? "Exportando…" : "Exportar CSV"}
        </button>
      </div>

      {filtersOpen ? (
        <BottomSheet title="Filtros" onClose={() => setFiltersOpen(false)}>
          {filterFields}
          <div className={styles.sheetActions}>
            <button type="button" className={styles.secondary} onClick={clearFilters}>
              Limpiar filtros
            </button>
            <button
              type="button"
              className={styles.primaryCta}
              onClick={() => setFiltersOpen(false)}
            >
              Ver resultados
            </button>
          </div>
        </BottomSheet>
      ) : (
        <div className={styles.filters}>{filterFields}</div>
      )}

      {exportCsv.isError && !exportCsv.isPending ? (
        <div className={styles.error} role="alert">
          <p>No pudimos exportar los movimientos. Probá de nuevo.</p>
        </div>
      ) : null}

      {query.isPending ? (
        <Skeleton count={3} height="7rem" label="Cargando movimientos" />
      ) : null}

      {query.isError ? (
        <ErrorState
          message="No pudimos cargar tus movimientos. Probá de nuevo."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.data && query.data.length === 0 ? (
        <EmptyState
          message={
            activeFilterCount > 0
              ? "No hay movimientos con estos filtros."
              : "No hay movimientos todavía."
          }
          action={{ href: "/registrar", label: "Registrar movimiento" }}
        />
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className={styles.list}>
          {movementItems.map((item) => (
            <li key={movementItemKey(item)}>
              {item.kind === "transfer" ? (
                <TransferCard
                  item={item}
                  accountNames={accountNames}
                  onChanged={refreshAfterChange}
                />
              ) : (
                <TransactionCard
                  transaction={item.transaction}
                  accountName={accountNames[item.transaction.accountId] ?? "Cuenta"}
                  categoryName={
                    item.transaction.categoryId
                      ? categoryNames[item.transaction.categoryId] ?? "Categoría"
                      : null
                  }
                  categories={categories.data ?? []}
                  onChanged={refreshAfterChange}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function movementItemKey(item: MovementListItem): string {
  return item.kind === "transfer" ? item.transferId : item.transaction.id;
}

const TYPE_ICON_PATHS: Partial<Record<TransactionType, string>> = {
  EXPENSE: "M12 20 5 13h4V4h6v9h4l-7 7Z",
  INCOME: "m12 4 7 7h-4v9H9v-9H5l7-7Z",
  TRANSFER: "M7 7h10l-3-3 1.4-1.4L20.8 8l-5.4 5.4L14 12l3-3H7V7Zm10 10H7l3 3-1.4 1.4L3.2 16l5.4-5.4L10 12l-3 3h10v2Z",
};

function MovementIcon({ type }: { type: TransactionType }) {
  const path = TYPE_ICON_PATHS[type];
  if (!path) {
    return null;
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={path} />
    </svg>
  );
}

// Dos líneas por movimiento: descripción + monto arriba, contexto + fecha
// abajo. El estado sólo aparece cuando no es ACTIVE.
function MovementRow({
  type,
  typeLabel,
  title,
  context,
  date,
  amount,
  status,
  muted,
  children,
}: {
  type: TransactionType;
  typeLabel: string;
  title: string;
  context?: ReactNode;
  date: string;
  amount: ReactNode;
  status?: ReactNode;
  muted?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className={muted ? `${styles.card} ${styles.cardMuted}` : styles.card}>
      <div className={styles.cardTop}>
        <span className={styles.typeIcon} aria-hidden="true">
          <MovementIcon type={type} />
        </span>
        <div className={styles.cardMain}>
          <p className={styles.title}>{title}</p>
          <p className={styles.metaRow}>
            <span className={styles.type}>{typeLabel}</span>
            {context ? (
              <>
                <span aria-hidden="true">·</span>
                <span className={styles.context}>{context}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span className={styles.date}>{formatTransactionDate(date)}</span>
            {status}
          </p>
        </div>
        <div className={styles.cardAmount}>{amount}</div>
      </div>
      {children}
    </article>
  );
}

function TransferCard({
  item,
  accountNames,
  onChanged,
}: {
  item: Extract<MovementListItem, { kind: "transfer" }>;
  accountNames: Record<string, string>;
  onChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const sourceName = accountNames[item.out.accountId] ?? "Cuenta origen";
  const destinationName = accountNames[item.in.accountId] ?? "Cuenta destino";
  const description = item.out.description ?? item.in.description;
  const allowVoid = canVoidTransfer(item.out, item.in);
  const isActive = item.out.status === "ACTIVE";
  const money = <Money amount={item.out.amount} currency={item.out.currency} />;

  // P0.15: las patas son inmutables por separado; se anulan las dos juntas.
  const voidMut = useMutation({
    mutationFn: () =>
      voidTransfer(item.transferId, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      await onChanged();
      setConfirmVoid(false);
    },
  });

  return (
    <MovementRow
      type="TRANSFER"
      typeLabel="Transferencia"
      title={`${sourceName} → ${destinationName}`}
      context={description}
      date={item.out.occurredAt}
      muted={!isActive}
      status={
        isActive ? null : (
          <StatusBadge label={transactionStatusLabel(item.out.status)} tone="muted" />
        )
      }
      amount={<span className={styles.amount}>{money}</span>}
    >
      {expanded ? (
        <div className={styles.details}>
          <p className={styles.metaLine}>Desde: {sourceName}</p>
          <p className={styles.metaLine}>Hacia: {destinationName}</p>
          <p className={styles.metaLine}>Monto: {money}</p>
          <p className={styles.metaLine}>
            Fecha: {formatTransactionDate(item.out.occurredAt)}
          </p>
          {description ? (
            <p className={styles.metaLine}>Descripción: {description}</p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.linkAction}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Ocultar detalle" : "Ver detalle"}
        </button>
        {allowVoid ? (
          <button
            type="button"
            className={styles.linkDanger}
            onClick={() => setConfirmVoid(true)}
          >
            Anular transferencia
          </button>
        ) : null}
      </div>

      {confirmVoid ? (
        <div className={styles.form}>
          <p className={styles.confirm}>
            ¿Querés anular esta transferencia? {VOID_HISTORY_NOTICE}
          </p>
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
    </MovementRow>
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
  const [confirmCorrect, setConfirmCorrect] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const sign = transactionAmountSign(transaction);
  const kind = incomeKindLabel(transaction.metadata?.incomeKind);
  const reimbursement = reimbursementLabel(transaction.reimbursementStatus);
  const method = paymentMethodLabel(transaction.paymentMethod);
  const direction = directionLabel(transaction.metadata);
  const allowEdit = canEditTransaction(transaction);
  const allowVoid = canVoidTransaction(transaction);
  const allowCorrect = canCorrectTransaction(transaction);
  const isActive = transaction.status === "ACTIVE";
  const title = transaction.description ?? categoryName ?? "Sin categoría";
  const context = [
    transaction.description ? categoryName : null,
    accountName,
    method,
    transaction.isFixed ? "Gasto fijo" : null,
    reimbursement,
  ]
    .filter(Boolean)
    .join(" · ");

  const voidMut = useMutation({
    mutationFn: () =>
      voidTransaction(transaction.id, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      await onChanged();
      setConfirmVoid(false);
    },
  });

  // P0.15: corregir = anular el movimiento y volver a cargarlo prellenado.
  const correctMut = useMutation({
    mutationFn: () =>
      voidTransaction(transaction.id, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      await onChanged();
      setConfirmCorrect(false);
      setCorrecting(true);
    },
  });

  return (
    <MovementRow
      type={transaction.type}
      typeLabel={`${transactionTypeLabel(transaction.type)}${kind ? ` · ${kind}` : ""}`}
      title={title}
      context={context || null}
      date={transaction.occurredAt}
      muted={!isActive}
      status={
        isActive ? null : (
          <StatusBadge label={transactionStatusLabel(transaction.status)} tone="muted" />
        )
      }
      amount={
        <p
          className={`${styles.amount} ${
            !isActive
              ? styles.amountMuted
              : sign === "-"
                ? styles.amountNegative
                : sign === "+"
                  ? styles.amountPositive
                  : ""
          }`}
        >
          {sign ? `${sign} ` : ""}
          <Money amount={transaction.amount} currency={transaction.currency} />
        </p>
      }
    >
      {expanded ? (
        <div className={styles.details}>
          {direction ? <p className={styles.metaLine}>{direction}</p> : null}
          <p className={styles.metaLine}>{transaction.currency}</p>
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.linkAction}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Ocultar detalle" : "Ver detalle"}
        </button>
        {allowEdit ? (
          <button type="button" className={styles.linkAction} onClick={() => setEditing(true)}>
            Editar
          </button>
        ) : null}
        {allowCorrect ? (
          <button
            type="button"
            className={styles.linkAction}
            onClick={() => setConfirmCorrect(true)}
          >
            Corregir
          </button>
        ) : null}
        {allowVoid ? (
          <button
            type="button"
            className={styles.linkDanger}
            onClick={() => setConfirmVoid(true)}
          >
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

      {confirmCorrect ? (
        <div className={styles.form}>
          <p className={styles.confirm}>
            Vamos a anular este movimiento y abrir el alta prellenada.{" "}
            {VOID_HISTORY_NOTICE}
          </p>
          {correctMut.isError ? (
            <p className={styles.formError}>{transactionFormError(correctMut.error)}</p>
          ) : null}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.edit}
              disabled={correctMut.isPending}
              onClick={() => correctMut.mutate()}
            >
              Anular y corregir
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setConfirmCorrect(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {correcting ? (
        <div className={styles.form}>
          <QuickAddForm
            initialValues={toCorrectionInitialValues(transaction)}
            onSaved={() => {
              setCorrecting(false);
              void onChanged();
            }}
          />
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setCorrecting(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      {confirmVoid ? (
        <div className={styles.form}>
          <p className={styles.confirm}>
            ¿Querés anular este movimiento? {VOID_HISTORY_NOTICE}
          </p>
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
    </MovementRow>
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
