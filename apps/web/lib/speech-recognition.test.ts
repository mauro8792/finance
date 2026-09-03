import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applySpeechResult,
  createSpeechSession,
  displaySpeechTranscript,
  finalizeSpeechSession,
  isSpeechRecognitionAvailable,
  speechErrorMessage,
} from "./speech-recognition";

describe("speech-recognition helpers", () => {
  it("replaces interim results instead of concatenating them", () => {
    let session = createSpeechSession();
    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: "14" } }],
    });
    assert.equal(displaySpeechTranscript(session), "14");

    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: "14 mil" } }],
    });
    assert.equal(displaySpeechTranscript(session), "14 mil");

    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: "14 mil en" } }],
    });
    assert.equal(displaySpeechTranscript(session), "14 mil en");

    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "14 mil en el pádel" } }],
    });
    assert.equal(displaySpeechTranscript(session), "14 mil en el pádel");
    assert.equal(session.interimTranscript, "");
  });

  it("does not produce repeated interim fragments", () => {
    let session = createSpeechSession();
    const steps = ["14", "14 mil", "14 mil en", "14 mil en el pádel"];
    for (const transcript of steps.slice(0, -1)) {
      session = applySpeechResult(session, {
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript } }],
      });
    }
    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: steps.at(-1) } }],
    });
    assert.equal(displaySpeechTranscript(session), "14 mil en el pádel");
    assert.doesNotMatch(displaySpeechTranscript(session), /14 14/);
  });

  it("accumulates multiple final results once each", () => {
    let session = createSpeechSession();
    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "gasté " } }],
    });
    session = applySpeechResult(session, {
      resultIndex: 1,
      results: [
        { isFinal: true, 0: { transcript: "gasté " } },
        { isFinal: true, 0: { transcript: "24000 en supermercado" } },
      ],
    });
    assert.equal(displaySpeechTranscript(session), "gasté 24000 en supermercado");
  });

  it("preserves prior typed text and appends dictation once", () => {
    let session = createSpeechSession("ya escrito");
    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: "más tarde" } }],
    });
    assert.equal(displaySpeechTranscript(session), "ya escrito más tarde");
    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "más tarde" } }],
    });
    assert.equal(displaySpeechTranscript(session), "ya escrito más tarde");
  });

  it("clears interim on finalize and keeps finals", () => {
    let session = createSpeechSession("nota");
    session = applySpeechResult(session, {
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "pago " } },
        { isFinal: false, 0: { transcript: "parcial" } },
      ],
    });
    assert.equal(displaySpeechTranscript(session), "nota pago parcial");
    session = finalizeSpeechSession(session);
    assert.equal(session.interimTranscript, "");
    assert.equal(displaySpeechTranscript(session), "nota pago");
  });

  it("maps permission errors without treating abort as a hard failure", () => {
    assert.equal(speechErrorMessage("aborted"), null);
    assert.equal(speechErrorMessage("no-speech"), null);
    assert.match(speechErrorMessage("not-allowed") ?? "", /micrófono/);
    assert.match(speechErrorMessage("network") ?? "", /escribiendo/);
  });

  it("reports the API as unavailable in jsdom by default", () => {
    assert.equal(isSpeechRecognitionAvailable(), false);
  });
});
