import { afterEach, describe, expect, it, vi } from "vitest";
import { login, getMe, logout, setOnUnauthorized, isUnauthorizedError, ApiClientError } from "./api";

describe("api credentials", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setOnUnauthorized(null);
  });

  it("sends credentials include on JSON requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: "1", name: "QA", email: "a@b.co", timezone: "UTC" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await getMe();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("sends credentials include on login and logout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: "1", name: "QA", email: "a@b.co", timezone: "UTC" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await login({ email: "a@b.co", password: "twelvechars!!" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });

    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
    await logout();
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    });
  });

  it("notifies unauthorized on protected 401 and not on login 401", async () => {
    const onUnauthorized = vi.fn();
    setOnUnauthorized(onUnauthorized);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "UNAUTHENTICATED", message: "Necesitás iniciar sesión." } }),
      })
    );
    await expect(getMe()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    onUnauthorized.mockClear();
    await expect(login({ email: "a@b.co", password: "twelvechars!!" })).rejects.toMatchObject({
      status: 401,
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("treats UNAUTHENTICATED as a global auth error and not login failures", () => {
    expect(
      isUnauthorizedError(new ApiClientError(401, "UNAUTHENTICATED", "Necesitás iniciar sesión."))
    ).toBe(true);
    expect(
      isUnauthorizedError(new ApiClientError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos."))
    ).toBe(false);
    expect(isUnauthorizedError(new ApiClientError(400, "VALIDATION_ERROR", "bad"))).toBe(false);
  });
});
