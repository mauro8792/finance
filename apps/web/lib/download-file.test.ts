import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadTextFile } from "./download-file";

describe("downloadTextFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("triggers a single download link", () => {
    const click = vi.fn();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:movimientos",
      revokeObjectURL,
    });
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreate(tagName);
      if (tagName === "a") {
        element.click = click;
      }
      return element;
    });

    downloadTextFile("Fecha\n", "movimientos.csv", "text/csv;charset=utf-8");

    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:movimientos");
  });
});
