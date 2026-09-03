import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applySpeechResult,
  createSpeechSession,
  displaySpeechTranscript,
  finalizeSpeechSession,
  isSpeechRecognitionAvailable,
  mergeUtterance,
  rebuildSessionTranscript,
  speechErrorMessage,
} from "./speech-recognition";

describe("speech-recognition helpers", () => {
  it("Chrome Android: repeated final revisions do not concatenate", () => {
    let session = createSpeechSession();

    session = applySpeechResult(session, {
      results: [{ isFinal: true, 0: { transcript: "$15,000" } }],
    });
    assert.equal(displaySpeechTranscript(session), "$15,000");

    session = applySpeechResult(session, {
      results: [
        { isFinal: true, 0: { transcript: "$15,000" } },
        { isFinal: true, 0: { transcript: "$15,000" } },
      ],
    });
    assert.equal(displaySpeechTranscript(session), "$15,000");

    session = applySpeechResult(session, {
      results: [
        { isFinal: true, 0: { transcript: "$15,000" } },
        { isFinal: true, 0: { transcript: "$15,000" } },
        { isFinal: true, 0: { transcript: "$15,000 panadería" } },
      ],
    });
    assert.equal(displaySpeechTranscript(session), "$15,000 panadería");
    assert.doesNotMatch(displaySpeechTranscript(session), /\$15,000\$15,000/);
  });

  it("rebuilds session transcript from the latest event.results only", () => {
    assert.equal(
      rebuildSessionTranscript([
        { isFinal: true, 0: { transcript: "$15,000" } },
        { isFinal: true, 0: { transcript: "$15,000" } },
        { isFinal: true, 0: { transcript: "$15,000 panadería" } },
      ]),
      "$15,000 panadería"
    );
  });

  it("replaces growing interim phrases within one session", () => {
    let session = createSpeechSession();
    session = applySpeechResult(session, {
      results: [{ isFinal: false, 0: { transcript: "15" } }],
    });
    session = applySpeechResult(session, {
      results: [{ isFinal: false, 0: { transcript: "15 mil" } }],
    });
    session = applySpeechResult(session, {
      results: [{ isFinal: true, 0: { transcript: "15 mil panadería" } }],
    });
    assert.equal(displaySpeechTranscript(session), "15 mil panadería");
  });

  it("keeps additive desktop finals when they are not revisions", () => {
    assert.equal(mergeUtterance("gasté ", "24000 "), "gasté 24000 ");
    assert.equal(
      rebuildSessionTranscript([
        { isFinal: true, 0: { transcript: "gasté " } },
        { isFinal: true, 0: { transcript: "24000 en panadería" } },
      ]),
      "gasté 24000 en panadería"
    );
  });

  it("preserves baseText and appends session dictation once", () => {
    let session = createSpeechSession("ayer");
    session = applySpeechResult(session, {
      results: [{ isFinal: true, 0: { transcript: "gasté 15 mil en panadería" } }],
    });
    assert.equal(displaySpeechTranscript(session), "ayer gasté 15 mil en panadería");
  });

  it("finalizes without inventing duplicated text", () => {
    let session = createSpeechSession("nota");
    session = applySpeechResult(session, {
      results: [
        { isFinal: true, 0: { transcript: "$15,000" } },
        { isFinal: true, 0: { transcript: "$15,000 panadería" } },
      ],
    });
    session = finalizeSpeechSession(session);
    assert.equal(displaySpeechTranscript(session), "nota $15,000 panadería");
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
