import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpeechToText } from "./use-speech-to-text";

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;
  static startCount = 0;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult:
    | ((event: {
        resultIndex?: number;
        results: Array<{ isFinal?: boolean; 0: { transcript: string } }>;
      }) => void)
    | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => {
    FakeSpeechRecognition.startCount += 1;
  });
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
    FakeSpeechRecognition.startCount = 0;
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

  it("replaces interim updates and keeps a single final phrase", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechToText(onTranscript));

    act(() => {
      result.current.toggle("");
    });
    const recognition = FakeSpeechRecognition.latest;

    act(() => {
      recognition?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: "14" } }],
      });
    });
    act(() => {
      recognition?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: "14 mil" } }],
      });
    });
    act(() => {
      recognition?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: "14 mil en" } }],
      });
    });
    act(() => {
      recognition?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "14 mil en el pádel" } }],
      });
    });

    expect(onTranscript).toHaveBeenLastCalledWith("14 mil en el pádel");
    expect(onTranscript.mock.calls.map((call) => call[0])).not.toContain(
      "14 14 mil 14 mil en 14 mil en el pádel"
    );
  });

  it("preserves prior text and consolidates on end", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechToText(onTranscript));

    act(() => {
      result.current.toggle("nota previa");
    });
    const recognition = FakeSpeechRecognition.latest;

    act(() => {
      recognition?.onresult?.({
        resultIndex: 0,
        results: [
          { isFinal: true, 0: { transcript: "pago " } },
          { isFinal: false, 0: { transcript: "parcial" } },
        ],
      });
    });
    expect(onTranscript).toHaveBeenLastCalledWith("nota previa pago parcial");

    act(() => {
      result.current.toggle("nota previa");
    });
    expect(recognition?.stop).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
    expect(onTranscript).toHaveBeenLastCalledWith("nota previa pago");
  });

  it("does not start two recognition instances at once", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const { result } = renderHook(() => useSpeechToText(vi.fn()));

    act(() => {
      result.current.start("");
      result.current.start("");
    });

    expect(FakeSpeechRecognition.startCount).toBe(1);
    expect(result.current.listening).toBe(true);
  });

  it("clears handlers on unmount", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const { result, unmount } = renderHook(() => useSpeechToText(vi.fn()));
    act(() => {
      result.current.start("");
    });
    const recognition = FakeSpeechRecognition.latest;
    unmount();
    expect(recognition?.abort).toHaveBeenCalled();
    expect(recognition?.onresult).toBeNull();
    expect(recognition?.onerror).toBeNull();
    expect(recognition?.onend).toBeNull();
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
