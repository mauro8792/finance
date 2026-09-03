import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, exportTransactionsCsv } from "./api";
import { downloadBlob } from "./download-file";

vi.mock("./download-file", () => ({
  downloadBlob: vi.fn(),
  downloadTextFile: vi.fn(),
}));

describe("exportTransactionsCsv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(downloadBlob).mockReset();
  });

  it("downloads the CSV once with the same filters as the list", async () => {
    const body = new Uint8Array([0xef, 0xbb, 0xbf, 0x46, 0x65, 0x63, 0x68, 0x61]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body.buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    await exportTransactionsCsv({ month: 6, type: "EXPENSE" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/transactions/export?");
    expect(url).toContain("month=6");
    expect(url).toContain("type=EXPENSE");
    expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadBlob).mock.calls[0]?.[1]).toBe("movimientos.csv");
  });

  it("preserves UTF-8 BOM bytes instead of decoding as text", async () => {
    const body = new Uint8Array([0xef, 0xbb, 0xbf, 0x43, 0x61, 0x74, 0x65, 0x67, 0x6f, 0x72, 0xc3, 0xad, 0x61]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => body.buffer,
      })
    );

    await exportTransactionsCsv();

    const blob = vi.mocked(downloadBlob).mock.calls[0]?.[0] as Blob;
    const downloaded = new Uint8Array(await blob.arrayBuffer());
    expect([...downloaded.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect([...downloaded]).toEqual([...body]);
  });

  it("does not download when the export fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: "INTERNAL_ERROR", message: "falló" },
        }),
      })
    );

    await expect(exportTransactionsCsv()).rejects.toMatchObject({
      name: "ApiClientError",
      message: "falló",
    } satisfies Partial<ApiClientError>);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
