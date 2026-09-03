import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  combineSpeechTranscript,
  isSpeechRecognitionAvailable,
  speechErrorMessage,
  transcriptFromResults,
} from "./speech-recognition";

describe("speech-recognition helpers", () => {
  it("joins spoken chunks and prefixes existing text", () => {
    assert.equal(combineSpeechTranscript("", "gasté 24000"), "gasté 24000");
    assert.equal(combineSpeechTranscript("ya escrito", "en supermercado"), "ya escrito en supermercado");
    assert.equal(
      transcriptFromResults([{ 0: { transcript: "gasté 24000 " } }, { 0: { transcript: "en supermercado" } }]),
      "gasté 24000 en supermercado"
    );
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
