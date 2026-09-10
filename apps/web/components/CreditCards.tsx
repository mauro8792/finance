"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  confirmRecurringCharge,
  createCreditCard,
  createRecurringCharge,
  getCategories,
  getCreditCardCommitments,
  getCreditCards,
  getRecurringChargeOutlook,
} from "../lib/api";
import {
  FEE_STATUSES,
  RECURRING_CHARGE_KINDS,
  creditCardFormError,
  feeStatusLabel,
  feeStatusTone,
  formatCalendarDate,
  nextClosingDate,
  nextDueDate,
  occurrenceKeyFor,
  recurringChargeKindLabel,
} from "../lib/credit-cards";
import { currentYearMonth } from "../lib/format-money";
import { isValidAmount, toApiAmount } from "../lib/quick-add";
import type {
  CreditCard,
  CreditCardCommitments,
  CreditCardFeeStatus,
  CreditCardRecurringChargeKind,
  Currency,
  RecurringChargeOutlookItem,
} from "../lib/types";
import { PrivacyToggle } from "./PrivacyToggle";
import { EmptyState, ErrorState } from "./QueryStatus";
import { FinancialCard } from "./ui/FinancialCard";
import { Metric } from "./ui/Metric";
import { Money } from "./ui/Money";
import { PageHeader } from "./ui/PageHeader";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusBadge } from "./ui/StatusBadge";
import styles from "./CreditCards.module.css";

type ConfirmTarget = {
  item: RecurringChargeOutlookItem;
  card: CreditCard;
};

type Panel = "create-card" | "create-recurring" | null;

export function CreditCardsPage() {
  const queryClient = useQueryClient();
  const { year, month } = currentYearMonth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

  const cardsQuery = useQuery({
    queryKey: ["credit-cards"],
    queryFn: getCreditCards,
  });

  const cards = cardsQuery.data ?? [];

  useEffect(() => {
    if (cards.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !cards.some((card) => card.id === selectedId)) {
      const primary = cards.find((card) => card.isPrimary);
      setSelectedId(primary?.id ?? cards[0]?.id ?? null);
    }
  }, [cards, selectedId]);

  const commitmentsQuery = useQuery({
    queryKey: ["credit-card-commitments", cards.map((card) => card.id)],
    enabled: cardsQuery.isSuccess && cards.length > 0,
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

  const selectedCard = cards.find((card) => card.id === selectedId) ?? null;

  const outlookQuery = useQuery({
    queryKey: ["recurring-charge-outlook", selectedId, year, month],
    enabled: Boolean(selectedId),
    queryFn: () => getRecurringChargeOutlook(selectedId!, year, month),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const expenseCategories = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (category) => category.type === "EXPENSE" || category.type === "BOTH"
      ),
    [categoriesQuery.data]
  );

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["credit-cards"] }),
      queryClient.invalidateQueries({ queryKey: ["credit-card-commitments"] }),
      queryClient.invalidateQueries({ queryKey: ["recurring-charge-outlook"] }),
      queryClient.invalidateQueries({ queryKey: ["recurring-charges"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
    ]);
  }

  return (
    <section className={styles.page} aria-label="Tarjetas">
      <PageHeader kicker="Tarjetas" title="Tarjetas" actions={<PrivacyToggle />} />

      {panel === "create-card" ? (
        <CreateCardForm
          onClose={() => setPanel(null)}
          onSaved={async () => {
            await refreshAll();
            setPanel(null);
          }}
        />
      ) : null}

      {cardsQuery.isPending ? (
        <>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </>
      ) : null}

      {cardsQuery.isError ? (
        <ErrorState
          message="No pudimos cargar tus tarjetas. Probá de nuevo."
          onRetry={() => {
            void cardsQuery.refetch();
          }}
        />
      ) : null}

      {cardsQuery.isSuccess && cards.length === 0 && panel !== "create-card" ? (
        <EmptyState
          message="No tenés tarjetas cargadas"
          action={{
            label: "Agregar tarjeta",
            onClick: () => setPanel("create-card"),
          }}
        />
      ) : null}

      {cards.length > 0 ? (
        <div className={styles.layout}>
          <ul className={styles.heroes} aria-label="Tarjetas">
            {cards.map((card) => (
              <li key={card.id}>
                <CardHero
                  card={card}
                  commitments={commitmentsQuery.data?.[card.id] ?? null}
                  selected={card.id === selectedId}
                  onSelect={() => setSelectedId(card.id)}
                />
              </li>
            ))}
          </ul>

          {selectedCard ? (
            <div className={styles.detail}>
              <CardDetail
                card={selectedCard}
                commitments={commitmentsQuery.data?.[selectedCard.id] ?? null}
                outlook={outlookQuery.data ?? null}
                outlookLoading={outlookQuery.isPending}
                outlookError={outlookQuery.isError}
                categoryNames={Object.fromEntries(
                  expenseCategories.map((category) => [category.id, category.name])
                )}
                onRetryOutlook={() => outlookQuery.refetch()}
                onConfirm={(item) => setConfirmTarget({ item, card: selectedCard })}
                onAddRecurring={() => setPanel("create-recurring")}
              />

              {panel === "create-recurring" ? (
                <CreateRecurringForm
                  card={selectedCard}
                  categories={expenseCategories}
                  onClose={() => setPanel(null)}
                  onSaved={async () => {
                    await refreshAll();
                    setPanel(null);
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {confirmTarget ? (
        <ConfirmChargeSheet
          target={confirmTarget}
          occurrenceKey={occurrenceKeyFor(new Date())}
          onClose={() => setConfirmTarget(null)}
          onConfirmed={async () => {
            await refreshAll();
            setConfirmTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

function CardHero({
  card,
  commitments,
  selected,
  onSelect,
}: {
  card: CreditCard;
  commitments: CreditCardCommitments | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const closingLabel = card.closingDay
    ? formatCalendarDate(nextClosingDate(card.closingDay))
    : "Sin configurar";
  const dueLabel =
    card.closingDay && card.dueDay
      ? formatCalendarDate(nextDueDate(card.dueDay, nextClosingDate(card.closingDay)))
      : "Sin configurar";

  return (
    <FinancialCard
      variant="hero"
      selected={selected}
      onClick={onSelect}
      ariaLabel={`Tarjeta ${card.name}`}
    >
      <div className={styles.heroTop}>
        <div>
          <h2 className={styles.heroName}>{card.name}</h2>
          <p className={styles.heroMeta}>
            {card.issuer} · {card.brand} · {card.currency}
          </p>
        </div>
        <div className={styles.heroBadges}>
          {card.isPrimary ? <StatusBadge label="Principal" tone="primary" /> : null}
          <StatusBadge
            label={feeStatusLabel(card.feeStatus)}
            tone={feeStatusTone(card.feeStatus)}
          />
        </div>
      </div>

      <div className={styles.heroStats}>
        <div>
          <p className={styles.heroStatLabel}>Deuda actual</p>
          <p className={styles.heroStatValue}>
            {commitments ? (
              <Money amount={commitments.currentCardDebt} currency={card.currency} />
            ) : (
              "—"
            )}
          </p>
        </div>
        <div>
          <p className={styles.heroStatLabel}>Próximo cierre</p>
          <p className={styles.heroStatValue}>{closingLabel}</p>
        </div>
        <div>
          <p className={styles.heroStatLabel}>Próximo vencimiento</p>
          <p className={styles.heroStatValue}>{dueLabel}</p>
        </div>
      </div>
    </FinancialCard>
  );
}

function CardDetail({
  card,
  commitments,
  outlook,
  outlookLoading,
  outlookError,
  categoryNames,
  onRetryOutlook,
  onConfirm,
  onAddRecurring,
}: {
  card: CreditCard;
  commitments: CreditCardCommitments | null;
  outlook: import("../lib/types").RecurringChargeOutlook | null;
  outlookLoading: boolean;
  outlookError: boolean;
  categoryNames: Record<string, string>;
  onRetryOutlook: () => void;
  onConfirm: (item: RecurringChargeOutlookItem) => void;
  onAddRecurring: () => void;
}) {
  const closingLabel = card.closingDay
    ? formatCalendarDate(nextClosingDate(card.closingDay))
    : "Sin configurar";
  const dueLabel =
    card.closingDay && card.dueDay
      ? formatCalendarDate(nextDueDate(card.dueDay, nextClosingDate(card.closingDay)))
      : "Sin configurar";

  const pendingHint =
    outlook && outlook.variableCountPending > 0
      ? `+ ${outlook.variableCountPending} variable${outlook.variableCountPending === 1 ? "" : "s"}`
      : undefined;

  return (
    <>
      <SectionHeader
        title={card.name}
        description={`${card.issuer} · ${card.brand}`}
      />

      <div className={styles.metrics}>
        <Metric
          label="Deuda actual"
          value={
            commitments ? (
              <Money amount={commitments.currentCardDebt} currency={card.currency} />
            ) : (
              "—"
            )
          }
        />
        <Metric
          label="Recurrentes estimados pendientes"
          value={
            outlook ? (
              <Money amount={outlook.expectedSumFixed} currency={card.currency} />
            ) : outlookLoading ? (
              "…"
            ) : (
              "—"
            )
          }
          hint={pendingHint}
        />
        <Metric label="Próximo cierre" value={closingLabel} compact />
        <Metric label="Próximo vencimiento" value={dueLabel} compact />
      </div>

      <SectionHeader
        title="Cargos recurrentes"
        action={
          <button type="button" className={styles.textBtn} onClick={onAddRecurring}>
            Agregar recurrente
          </button>
        }
      />

      {outlookLoading ? <div className={styles.skeleton} /> : null}

      {outlookError ? (
        <ErrorState
          message="No pudimos cargar los recurrentes del mes."
          onRetry={onRetryOutlook}
        />
      ) : null}

      {outlook && outlook.items.length === 0 ? (
        <EmptyState
          message="No hay cargos recurrentes configurados"
          action={{ label: "Agregar recurrente", onClick: onAddRecurring }}
        />
      ) : null}

      {outlook && outlook.items.length > 0 ? (
        <ul className={styles.recurringList}>
          {outlook.items.map((item) => (
            <RecurringItem
              key={item.template.id}
              item={item}
              categoryName={categoryNames[item.template.categoryId] ?? "Sin categoría"}
              onConfirm={() => onConfirm(item)}
            />
          ))}
        </ul>
      ) : null}
    </>
  );
}

function RecurringItem({
  item,
  categoryName,
  onConfirm,
}: {
  item: RecurringChargeOutlookItem;
  categoryName: string;
  onConfirm: () => void;
}) {
  const { template } = item;

  return (
    <li className={styles.recurringItem}>
      <div className={styles.recurringHead}>
        <div>
          <p className={styles.recurringTitle}>{template.description}</p>
          <p className={styles.recurringMeta}>
            {categoryName} ·{" "}
            {template.expectedAmount ? (
              <Money amount={template.expectedAmount} currency={template.currency} />
            ) : (
              "Variable"
            )}{" "}
            · Mensual
          </p>
        </div>
        <StatusBadge
          label={template.isActive ? "Activo" : "Inactivo"}
          tone={template.isActive ? "active" : "inactive"}
        />
      </div>
      <p className={styles.recurringStatus}>
        {item.hasOccurrence ? (
          <>
            Registrado este mes{" "}
            <Money amount={item.occurrence!.amount} currency={template.currency} />
          </>
        ) : template.expectedAmount ? (
          "Estimado mensual · Todavía no registrado"
        ) : (
          "Variable · Todavía no registrado"
        )}
      </p>
      {template.isActive && !item.hasOccurrence ? (
        <button type="button" className={styles.secondaryCta} onClick={onConfirm}>
          Registrar este mes
        </button>
      ) : null}
    </li>
  );
}

function ConfirmChargeSheet({
  target,
  occurrenceKey,
  onClose,
  onConfirmed,
}: {
  target: ConfirmTarget;
  occurrenceKey: string;
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}) {
  const { item, card } = target;
  const { template } = item;
  const [amount, setAmount] = useState(template.expectedAmount ?? "");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!isValidAmount(amount)) {
        throw new Error("Ingresá un monto válido.");
      }
      return confirmRecurringCharge(template.id, {
        occurrenceKey,
        amount: toApiAmount(amount),
        idempotencyKey: crypto.randomUUID(),
        occurredAt: new Date(`${occurredAt}T12:00:00`).toISOString(),
      });
    },
    onSuccess: async () => {
      await onConfirmed();
    },
    onError: (err) => {
      setError(creditCardFormError(err));
    },
  });

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-charge-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.sheet}>
        <div className={styles.sheetHeader}>
          <h2 id="confirm-charge-title" className={styles.sheetTitle}>
            Registrar cargo
          </h2>
          <button type="button" className={styles.sheetClose} onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className={styles.sheetHint}>
          Recién al confirmar se registra el gasto real en la tarjeta.
        </p>
        <div className={styles.sheetBody}>
          <Metric label="Tarjeta" value={card.name} compact />
          <Metric label="Descripción" value={template.description} compact />
          <Metric
            label="Estimado"
            value={
              template.expectedAmount ? (
                <Money amount={template.expectedAmount} currency={template.currency} />
              ) : (
                "Variable"
              )
            }
            compact
          />
          <Metric label="Período" value={occurrenceKey} compact />
          <div className={styles.field}>
            <label htmlFor="confirm-amount">Monto confirmado</label>
            <input
              id="confirm-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirm-date">Fecha</label>
            <input
              id="confirm-date"
              type="date"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </div>
          {error ? <p className={styles.formError}>{error}</p> : null}
          <button
            type="button"
            className={styles.primaryCta}
            disabled={mutation.isPending || amount.trim().length === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Registrando…" : "Registrar cargo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateCardForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [brand, setBrand] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [feeStatus, setFeeStatus] = useState<CreditCardFeeStatus>("UNKNOWN");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createCreditCard({
        name: name.trim(),
        issuer: issuer.trim(),
        brand: brand.trim(),
        currency,
        closingDay: closingDay ? Number(closingDay) : null,
        dueDay: dueDay ? Number(dueDay) : null,
        feeStatus,
      }),
    onSuccess: async () => {
      await onSaved();
    },
    onError: (err) => {
      setError(creditCardFormError(err));
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className={styles.formPanel} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}>Agregar tarjeta</h2>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="card-name">Nombre</label>
          <input id="card-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="card-issuer">Emisor</label>
          <input
            id="card-issuer"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="card-brand">Marca</label>
          <input id="card-brand" value={brand} onChange={(e) => setBrand(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="card-currency">Moneda</label>
          <select
            id="card-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="card-closing">Día de cierre</label>
          <input
            id="card-closing"
            type="number"
            min={1}
            max={31}
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="card-due">Día de vencimiento</label>
          <input
            id="card-due"
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="card-fee">Comisión</label>
          <select
            id="card-fee"
            value={feeStatus}
            onChange={(e) => setFeeStatus(e.target.value as CreditCardFeeStatus)}
          >
            {FEE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {feeStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <p className={styles.formError}>{error}</p> : null}
      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryCta} disabled={mutation.isPending}>
          {mutation.isPending ? "Guardando…" : "Guardar tarjeta"}
        </button>
        <button type="button" className={styles.secondaryCta} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CreateRecurringForm({
  card,
  categories,
  onClose,
  onSaved,
}: {
  card: CreditCard;
  categories: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<CreditCardRecurringChargeKind>("RECURRING_SERVICE");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createRecurringCharge({
        creditCardId: card.id,
        kind,
        categoryId,
        description: description.trim(),
        expectedAmount: expectedAmount.trim() ? expectedAmount.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      }),
    onSuccess: async () => {
      await onSaved();
    },
    onError: (err) => {
      setError(creditCardFormError(err));
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className={styles.formPanel} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}>Agregar recurrente</h2>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="rec-kind">Tipo</label>
          <select
            id="rec-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as CreditCardRecurringChargeKind)}
          >
            {RECURRING_CHARGE_KINDS.map((value) => (
              <option key={value} value={value}>
                {recurringChargeKindLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="rec-category">Categoría</label>
          <select
            id="rec-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="rec-description">Descripción</label>
          <input
            id="rec-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="rec-amount">Monto estimado (opcional)</label>
          <input
            id="rec-amount"
            inputMode="decimal"
            value={expectedAmount}
            onChange={(e) => setExpectedAmount(e.target.value)}
            placeholder="Variable si vacío"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="rec-notes">Notas</label>
          <textarea id="rec-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error ? <p className={styles.formError}>{error}</p> : null}
      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primaryCta}
          disabled={mutation.isPending || !categoryId}
        >
          {mutation.isPending ? "Guardando…" : "Guardar recurrente"}
        </button>
        <button type="button" className={styles.secondaryCta} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
