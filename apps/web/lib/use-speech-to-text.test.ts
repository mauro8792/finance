import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpeechToText } from "./use-speech-to-text";

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: { results: Array<{ 0: { transcript: string } }> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.latest = this;
  }
}

describe("useSpeechToText", () => {
  afterEach(() => {
    FakeSpeechRecognition.latest = null;
    vi.unstubAllGlobals();
  });

  it("does nothing when the API is missing", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechToText(onTranscript));
    expect(result.current.supported).toBe(false);
    act(() => {
      result.current.toggle("hola");
    });
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("writes the transcript into the callback and stops on toggle", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechToText(onTranscript));
    expect(result.current.supported).toBe(true);

    act(() => {
      result.current.toggle("prefijo");
    });
    const recognition = FakeSpeechRecognition.latest;
    expect(result.current.listening).toBe(true);
    expect(recognition?.start).toHaveBeenCalled();
    expect(recognition?.lang).toBe("es-AR");

    act(() => {
      recognition?.onresult?.({ results: [{ 0: { transcript: "gasté 24000" } }] });
    });
    expect(onTranscript).toHaveBeenCalledWith("prefijo gasté 24000");

    act(() => {
      result.current.toggle("prefijo");
    });
    expect(recognition?.stop).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it("keeps the form usable after a permission error", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const { result } = renderHook(() => useSpeechToText(vi.fn()));
    act(() => {
      result.current.start("");
    });
    act(() => {
      FakeSpeechRecognition.latest?.onerror?.({ error: "not-allowed" });
    });
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toMatch(/micrófono/);
  });
});
