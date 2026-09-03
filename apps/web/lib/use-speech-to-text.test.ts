import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpeechToText } from "./use-speech-to-text";

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;
  static startCount = 0;
  lang = "";
  continuous = true;
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

  it("uses continuous=false for short dictation sessions", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const { result } = renderHook(() => useSpeechToText(vi.fn()));
    act(() => {
      result.current.start("");
    });
    expect(FakeSpeechRecognition.latest?.continuous).toBe(false);
    expect(FakeSpeechRecognition.latest?.interimResults).toBe(true);
    expect(FakeSpeechRecognition.latest?.lang).toBe("es-AR");
  });

  it("Chrome Android pattern: revised finals become one phrase", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechToText(onTranscript));

    act(() => {
      result.current.toggle("");
    });
    const recognition = FakeSpeechRecognition.latest;

    act(() => {
      recognition?.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "$15,000" } }],
      });
    });
    act(() => {
      recognition?.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "$15,000" } },
          { isFinal: true, 0: { transcript: "$15,000" } },
        ],
      });
    });
    act(() => {
      recognition?.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "$15,000" } },
          { isFinal: true, 0: { transcript: "$15,000" } },
          { isFinal: true, 0: { transcript: "$15,000 panadería" } },
        ],
      });
    });

    expect(onTranscript).toHaveBeenLastCalledWith("$15,000 panadería");
    for (const call of onTranscript.mock.calls) {
      expect(call[0]).not.toMatch(/\$15,000\$15,000/);
    }
  });

  it("preserves baseText and consolidates on end", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechToText(onTranscript));

    act(() => {
      result.current.toggle("ayer");
    });
    const recognition = FakeSpeechRecognition.latest;

    act(() => {
      recognition?.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "gasté 15 mil en panadería" } }],
      });
    });
    expect(onTranscript).toHaveBeenLastCalledWith("ayer gasté 15 mil en panadería");

    act(() => {
      result.current.toggle("ayer");
    });
    expect(recognition?.stop).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
    expect(onTranscript).toHaveBeenLastCalledWith("ayer gasté 15 mil en panadería");
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
