"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSpeechToText } from "../lib/use-speech-to-text";
import {
  AI_QUERY_INVALIDATIONS,
  allProposalsSettled,
  canConfirmAiDraft,
  completionMessage,
  formatProposalAmount,
  incomeKindLabel,
  itemsFromParse,
  parseTransactionErrorMessage,
  paymentMethodLabel,
  resolveAiDraft,
  toCreateRequest,
  typeLabel,
  occurredAtToFormValue,
  type ProposalItem,
} from "../lib/ai-quick-input";
import { formatPaidAt } from "../lib/format-money";
import {
  ApiClientError,
  createTransaction,
  getAccounts,
  getCategories,
  parseTransaction,
} from "../lib/api";
import type { Account, Category, ParseTransactionResponse } from "../lib/types";
import { QuickAddForm } from "./QuickAddForm";
import styles from "./AiQuickInput.module.css";

type Step = "input" | "review";

export function AiQuickInput() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);
  const [emptyParse, setEmptyParse] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const parseMutation = useMutation({
    mutationFn: parseTransaction,
    onSuccess: (parsed: ParseTransactionResponse) => {
      setAmbiguities(parsed.ambiguities);
      if (parsed.transactions.length === 0) {
        setItems([]);
        setEmptyParse(true);
        setStep("input");
        return;
      }
      setEmptyParse(false);
      setItems(itemsFromParse(parsed.transactions));
      setStep("review");
    },
  });

  useEffect(() => {
    if (step !== "review" || !allProposalsSettled(items)) {
      return;
    }
    setSuccess(completionMessage(items));
    setStep("input");
    setItems([]);
    setAmbiguities([]);
    setEmptyParse(false);
  }, [items, step]);

  const speech = useSpeechToText((spoken) => {
    setSuccess(null);
    setEmptyParse(false);
    parseMutation.reset();
    setText(spoken);
  });
  const canInterpret = text.trim().length > 0 && !parseMutation.isPending && !speech.listening;
  const accounts = accountsQuery.data;
  const categories = categoriesQuery.data;
  const catalogsReady = Boolean(accounts && categories);
  const isSingle = items.length === 1;

  function onInterpret(event: FormEvent) {
    event.preventDefault();
    setSuccess(null);
    setEmptyParse(false);
    if (!canInterpret) {
      return;
    }
    parseMutation.mutate({ text: text.trim() });
  }

  function onCancelAll() {
    setStep("input");
    setItems([]);
    setAmbiguities([]);
    setEmptyParse(false);
    setSavingId(null);
    parseMutation.reset();
  }

  function patchItem(id: string, patch: Partial<ProposalItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function invalidateFinancialQueries() {
    await Promise.all(
      AI_QUERY_INVALIDATIONS.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey: [queryKey] })
      )
    );
  }

  async function onConfirm(item: ProposalItem) {
    if (!accounts || !categories || savingId) {
      return;
    }
    const draft = resolveAiDraft(item.proposal, accounts, categories);
    const account = accounts.find((entry) => entry.id === draft.accountId);
    const payload = account ? toCreateRequest(draft, account) : null;
    if (!payload) {
      patchItem(item.id, { status: "editing", error: null });
      return;
    }
    setSavingId(item.id);
    try {
      await createTransaction(payload);
      await invalidateFinancialQueries();
      patchItem(item.id, { status: "saved", error: null });
    } catch {
      patchItem(item.id, {
        status: "error",
        error: "No se pudo guardar el movimiento.",
      });
    } finally {
      setSavingId(null);
    }
  }

  const parseError =
    parseMutation.error instanceof ApiClientError || parseMutation.error
      ? parseTransactionErrorMessage(parseMutation.error)
      : null;

  return (
    <section className={styles.section} aria-labelledby="ai-quick-title">
      <h2 id="ai-quick-title" className={styles.title}>
        Registrar con texto
      </h2>
      <p className={styles.lead}>Escribí el movimiento en lenguaje natural. La IA propone; vos confirmás.</p>

      {step === "input" ? (
        <form className={styles.form} onSubmit={onInterpret}>
          <label className={styles.field} htmlFor="ai-quick-text">
            ¿Qué movimiento querés registrar?
            <span className={styles.inputRow}>
              <input
                id="ai-quick-text"
                className={styles.input}
                type="text"
                autoComplete="off"
                enterKeyHint="go"
                placeholder="Ej: gasté 75 mil en el supermercado"
                value={text}
                onChange={(event) => {
                  setSuccess(null);
                  setEmptyParse(false);
                  parseMutation.reset();
                  setText(event.target.value);
                }}
                aria-invalid={Boolean(parseError) || Boolean(speech.error)}
                aria-describedby={
                  parseError
                    ? "ai-quick-error"
                    : speech.listening
                      ? "ai-quick-listening"
                      : speech.error
                        ? "ai-quick-speech-error"
                        : undefined
                }
                disabled={parseMutation.isPending}
              />
              {speech.supported ? (
                <button
                  type="button"
                  className={speech.listening ? styles.micActive : styles.mic}
                  aria-pressed={speech.listening}
                  aria-label={speech.listening ? "Detener dictado" : "Dictar"}
                  onClick={() => speech.toggle(text)}
                  disabled={parseMutation.isPending}
                >
                  <MicIcon listening={speech.listening} />
                </button>
              ) : null}
            </span>
          </label>
          {speech.listening ? (
            <p id="ai-quick-listening" className={styles.hint} role="status">
              Escuchando…
            </p>
          ) : null}
          {speech.error ? (
            <p id="ai-quick-speech-error" className={styles.error} role="alert">
              {speech.error}
            </p>
          ) : null}
          {parseError ? (
            <p id="ai-quick-error" className={styles.error} role="alert">
              {parseError}
            </p>
          ) : null}
          {success ? (
            <p className={styles.success} role="status">
              {success}
            </p>
          ) : null}
          {emptyParse ? (
            <div className={styles.emptyState} role="status">
              <p className={styles.empty}>No pude identificar movimientos para registrar.</p>
              <Ambiguities items={ambiguities} />
            </div>
          ) : null}
          <button
            className={styles.primary}
            type="submit"
            disabled={!canInterpret}
            aria-busy={parseMutation.isPending}
          >
            {parseMutation.isPending ? "Interpretando…" : "Interpretar"}
          </button>
        </form>
      ) : null}

      {step === "review" && !catalogsReady ? (
        <p className={styles.hint} role="status">
          {accountsQuery.isError || categoriesQuery.isError
            ? "No se pudieron cargar las cuentas o categorías."
            : "Cargando cuentas y categorías…"}
        </p>
      ) : null}

      {step === "review" && catalogsReady ? (
        <div className={styles.review}>
          {isSingle ? (
            <p className={styles.kicker}>Movimiento interpretado</p>
          ) : (
            <p className={styles.kicker}>{items.length} movimientos interpretados</p>
          )}
          <Ambiguities items={ambiguities} />
          <div className={styles.cards}>
            {items.map((item) => (
              <ProposalCard
                key={item.id}
                item={item}
                accounts={accounts ?? []}
                categories={categories ?? []}
                isSingle={isSingle}
                saving={savingId === item.id}
                saveDisabled={savingId !== null && savingId !== item.id}
                onEdit={() => patchItem(item.id, { status: "editing", error: null })}
                onConfirm={() => onConfirm(item)}
                onDiscard={() => patchItem(item.id, { status: "discarded", error: null })}
                onCloseEdit={() => patchItem(item.id, { status: "pending", error: null })}
                onSaved={() => patchItem(item.id, { status: "saved", error: null })}
                onCancelAll={onCancelAll}
              />
            ))}
          </div>
          {!(isSingle && items.some((item) => item.status === "editing")) ? (
            <button type="button" className={styles.linkish} onClick={onCancelAll}>
              Cancelar
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProposalCard({
  item,
  accounts,
  categories,
  isSingle,
  saving,
  saveDisabled,
  onEdit,
  onConfirm,
  onDiscard,
  onCloseEdit,
  onSaved,
  onCancelAll,
}: {
  item: ProposalItem;
  accounts: Account[];
  categories: Category[];
  isSingle: boolean;
  saving: boolean;
  saveDisabled: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
  onCloseEdit: () => void;
  onSaved: () => void;
  onCancelAll: () => void;
}) {
  const draft = useMemo(
    () => resolveAiDraft(item.proposal, accounts, categories),
    [item.proposal, accounts, categories]
  );
  const blockedReason = missingConfirmReason(draft);
  const amount = formatProposalAmount(draft.amount, draft.currency);
  const kind = typeLabel(draft.kind);
  const payment = paymentMethodLabel(draft.paymentMethod);
  const income = draft.kind === "INCOME" ? incomeKindLabel(draft.incomeKind) : null;
  const label = isSingle ? "Movimiento interpretado" : `Movimiento ${item.index + 1}`;

  if (item.status === "discarded") {
    return (
      <article className={`${styles.preview} ${styles.settled}`} aria-label={label}>
        <p className={styles.kicker}>{label}</p>
        <p className={styles.hint}>Descartado</p>
      </article>
    );
  }

  if (item.status === "saved") {
    return (
      <article className={`${styles.preview} ${styles.settled}`} aria-label={label}>
        <p className={styles.kicker}>{label}</p>
        {kind ? <p className={styles.type}>{kind}</p> : null}
        {amount ? <p className={styles.amount}>{amount}</p> : null}
        <p className={styles.success} role="status">
          Guardado
        </p>
      </article>
    );
  }

  if (item.status === "editing") {
    return (
      <article className={styles.edit} aria-label={label}>
        <p className={styles.kicker}>{isSingle ? "Revisá y guardá" : label}</p>
        {draft.proposal.categoryHint && !draft.categoryId ? (
          <p className={styles.hint}>Categoría sugerida: {draft.proposal.categoryHint}</p>
        ) : null}
        {draft.proposal.accountHint && !draft.accountId ? (
          <p className={styles.hint}>Cuenta sugerida: {draft.proposal.accountHint}</p>
        ) : null}
        <QuickAddForm
          key={`${item.id}-${draft.kind}-${draft.amount}-${draft.currency}`}
          initialValues={{
            kind: draft.kind ?? "EXPENSE",
            amount: draft.amount ?? "",
            accountId: draft.accountId,
            categoryId: draft.categoryId,
            description: draft.description ?? "",
            occurredAt: occurredAtToFormValue(draft.occurredAt),
            paymentMethod: draft.paymentMethod,
            incomeKind: draft.incomeKind,
            lockCurrency: draft.currency,
          }}
          onSaved={onSaved}
        />
        {isSingle ? (
          <button type="button" className={styles.secondary} onClick={onCancelAll}>
            Cancelar
          </button>
        ) : (
          <button type="button" className={styles.secondary} onClick={onCloseEdit}>
            Volver
          </button>
        )}
      </article>
    );
  }

  return (
    <article className={styles.preview} aria-label={label}>
      {!isSingle ? <p className={styles.kicker}>{label}</p> : null}
      {kind ? <p className={styles.type}>{kind}</p> : null}
      {amount ? <p className={styles.amount}>{amount}</p> : null}
      {draft.description ? <p className={styles.description}>{draft.description}</p> : null}

      <dl className={styles.facts}>
        {draft.proposal.categoryHint || draft.categoryName ? (
          <div>
            <dt>Categoría sugerida</dt>
            <dd>{draft.categoryName ?? draft.proposal.categoryHint}</dd>
          </div>
        ) : null}
        <div>
          <dt>Cuenta</dt>
          <dd>{draft.accountName ?? "Sin seleccionar"}</dd>
        </div>
        {draft.occurredAt ? (
          <div>
            <dt>Fecha</dt>
            <dd>{formatPaidAt(draft.occurredAt)}</dd>
          </div>
        ) : null}
        {payment ? (
          <div>
            <dt>Medio de pago</dt>
            <dd>{payment}</dd>
          </div>
        ) : null}
        {income ? (
          <div>
            <dt>Tipo de ingreso</dt>
            <dd>{income}</dd>
          </div>
        ) : null}
      </dl>

      {blockedReason ? <p className={styles.hint}>{blockedReason}</p> : null}
      {item.status === "error" && item.error ? (
        <p className={styles.error} role="alert">
          {item.error}
        </p>
      ) : null}

      <div className={isSingle ? styles.actions : styles.multiActions}>
        <button type="button" className={styles.secondary} onClick={onEdit}>
          Editar
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={onConfirm}
          disabled={Boolean(blockedReason) || saving || saveDisabled || !canConfirmAiDraft(draft)}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        {!isSingle ? (
          <button type="button" className={styles.secondary} onClick={onDiscard}>
            Descartar
          </button>
        ) : null}
      </div>
    </article>
  );
}

function missingConfirmReason(
  draft: ReturnType<typeof resolveAiDraft>
): string | null {
  if (draft.kind === null) {
    return "Elegí si es gasto o ingreso antes de guardar.";
  }
  if (!draft.amount) {
    return "Completá el importe antes de guardar.";
  }
  if (!draft.accountId) {
    return "Elegí una cuenta antes de guardar.";
  }
  if (!draft.categoryId) {
    return "Elegí una categoría antes de guardar.";
  }
  if (draft.kind === "INCOME" && !draft.incomeKind) {
    return "Elegí el tipo de ingreso antes de guardar.";
  }
  return null;
}

function Ambiguities({ items }: { items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={styles.notes}>
      <p className={styles.notesTitle}>Observaciones</p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d={
          listening
            ? "M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
            : "M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm7-3h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"
        }
      />
    </svg>
  );
}
