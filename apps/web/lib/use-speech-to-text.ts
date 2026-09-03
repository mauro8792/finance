"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  combineSpeechTranscript,
  getSpeechRecognitionConstructor,
  isSpeechRecognitionAvailable,
  speechErrorMessage,
  transcriptFromResults,
  type SpeechRecognitionLike,
} from "./speech-recognition";

const DEFAULT_LANG = "es-AR";

export function useSpeechToText(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const prefixRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const supported = isSpeechRecognitionAvailable();

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback((currentText: string) => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      return;
    }

    recognitionRef.current?.abort();
    setError(null);
    prefixRef.current = currentText.trim();

    const recognition = new SpeechRecognition();
    recognition.lang = DEFAULT_LANG;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const spoken = transcriptFromResults(event.results);
      onTranscriptRef.current(combineSpeechTranscript(prefixRef.current, spoken));
    };
    recognition.onerror = (event) => {
      setListening(false);
      const message = speechErrorMessage(event.error);
      if (message) {
        setError(message);
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("No se pudo dictar. Podés seguir escribiendo.");
    }
  }, []);

  const toggle = useCallback(
    (currentText: string) => {
      if (listening) {
        stop();
        return;
      }
      start(currentText);
    },
    [listening, start, stop]
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { supported, listening, error, start, stop, toggle };
}
