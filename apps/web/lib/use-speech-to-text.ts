"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applySpeechResult,
  createSpeechSession,
  displaySpeechTranscript,
  finalizeSpeechSession,
  getSpeechRecognitionConstructor,
  isSpeechRecognitionAvailable,
  speechErrorMessage,
  type SpeechRecognitionLike,
  type SpeechSessionState,
} from "./speech-recognition";

const DEFAULT_LANG = "es-AR";

export function useSpeechToText(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionRef = useRef<SpeechSessionState>(createSpeechSession());
  const startingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const supported = isSpeechRecognitionAvailable();

  const clearRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognitionRef.current = null;
  }, []);

  const stop = useCallback(() => {
    startingRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(
    (currentText: string) => {
      const SpeechRecognition = getSpeechRecognitionConstructor();
      if (!SpeechRecognition || startingRef.current || recognitionRef.current) {
        return;
      }

      startingRef.current = true;
      setError(null);
      sessionRef.current = createSpeechSession(currentText);

      const recognition = new SpeechRecognition();
      recognition.lang = DEFAULT_LANG;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        sessionRef.current = applySpeechResult(sessionRef.current, event);
        onTranscriptRef.current(displaySpeechTranscript(sessionRef.current));
      };

      recognition.onerror = (event) => {
        startingRef.current = false;
        setListening(false);
        const message = speechErrorMessage(event.error);
        if (message) {
          setError(message);
        }
      };

      recognition.onend = () => {
        startingRef.current = false;
        sessionRef.current = finalizeSpeechSession(sessionRef.current);
        onTranscriptRef.current(displaySpeechTranscript(sessionRef.current));
        setListening(false);
        clearRecognition();
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
        startingRef.current = false;
      } catch {
        startingRef.current = false;
        clearRecognition();
        setListening(false);
        setError("No se pudo dictar. Podés seguir escribiendo.");
      }
    },
    [clearRecognition]
  );

  const toggle = useCallback(
    (currentText: string) => {
      if (listening || recognitionRef.current) {
        stop();
        return;
      }
      start(currentText);
    },
    [listening, start, stop]
  );

  useEffect(() => {
    return () => {
      startingRef.current = false;
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return { supported, listening, error, start, stop, toggle };
}
