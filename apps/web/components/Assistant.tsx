"use client";

import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ASSISTANT_SUGGESTED_QUESTIONS,
  assistantErrorMessage,
  canAskAssistant,
  parseAssistantAnswer,
  replaceAssistantDraft,
} from "../lib/ai-assistant";
import { askAssistant } from "../lib/api";
import styles from "./Assistant.module.css";

export function AssistantPage() {
  const questionId = useId();
  const hintId = useId();
  const errorId = useId();
  const [message, setMessage] = useState("");
  const [draftKey, setDraftKey] = useState(0);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: askAssistant,
    retry: false,
  });

  const canSubmit = canAskAssistant(message, mutation.isPending);
  const errorMessage = mutation.isError ? assistantErrorMessage(mutation.error) : null;

  function submitQuestion(raw: string) {
    const trimmed = raw.trim();
    if (!canAskAssistant(trimmed, mutation.isPending)) {
      return;
    }
    setLastQuestion(trimmed);
    mutation.mutate({ message: trimmed });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submitQuestion(message);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitQuestion(message);
    }
  }

  function onSuggested(question: string) {
    setMessage(replaceAssistantDraft(message, question));
    setDraftKey((key) => key + 1);
  }

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.kicker}>Asistente</p>
        <h1 className={styles.title}>Asistente financiero</h1>
        <p className={styles.lead}>
          Preguntá sobre tus números. La app calcula; la IA te los explica.
        </p>
      </header>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <label className={styles.field} htmlFor={questionId}>
          Pregunta
          <textarea
            key={draftKey}
            id={questionId}
            className={styles.input}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="¿Cuánto runway tengo?"
            aria-describedby={errorMessage ? `${hintId} ${errorId}` : hintId}
            aria-invalid={errorMessage ? true : undefined}
            disabled={mutation.isPending}
          />
        </label>
        <p id={hintId} className={styles.hint}>
          Ctrl + Enter o Cmd + Enter para preguntar.
        </p>
        <button className={styles.submit} type="submit" disabled={!canSubmit}>
          Preguntar
        </button>
      </form>

      <section className={styles.suggestions} aria-labelledby="assistant-suggestions-title">
        <h2 id="assistant-suggestions-title" className={styles.suggestionsTitle}>
          Preguntas sugeridas
        </h2>
        <div className={styles.suggestionList}>
          {ASSISTANT_SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              className={styles.suggestion}
              onClick={() => onSuggested(question)}
            >
              {question}
            </button>
          ))}
        </div>
      </section>

      <div className={styles.status} aria-live="polite">
        {mutation.isPending ? <p className={styles.loading}>Analizando tus datos...</p> : null}
        {errorMessage ? (
          <p id={errorId} className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}
        {lastQuestion && !mutation.isPending ? (
          <p className={styles.question}>Pregunta: {lastQuestion}</p>
        ) : null}
        {mutation.isSuccess && mutation.data ? (
          <section className={styles.answer} aria-labelledby="assistant-answer-title">
            <h2 id="assistant-answer-title" className={styles.answerLabel}>
              Respuesta
            </h2>
            <AssistantAnswer text={mutation.data.answer} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function AssistantAnswer({ text }: { text: string }) {
  const paragraphs = parseAssistantAnswer(text);
  return (
    <div className={styles.answerBody}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.segments.map((segment, segmentIndex) =>
            segment.type === "bold" ? (
              <strong key={segmentIndex}>{segment.value}</strong>
            ) : (
              <span key={segmentIndex}>{segment.value}</span>
            )
          )}
        </p>
      ))}
    </div>
  );
}
