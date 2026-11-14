import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, resetIpc } from "../test/mockIpc";
import { useUpdateCheck } from "./useUpdateCheck";

vi.mock("../lib/ipc", async () => (await import("../test/mockIpc")).ipcMock);

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

beforeEach(() => {
  resetIpc();
  vi.useRealTimers();
});

describe("useUpdateCheck", () => {
  it("checks on mount and keeps what it finds", async () => {
    api.checkForUpdate.mockResolvedValue({
      version: "0.2.1",
      currentVersion: "0.2.0",
      notes: "Fixes",
    });
    const { result } = renderHook(() => useUpdateCheck());
    await act(async () => {});
    expect(api.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.update).toEqual({
      version: "0.2.1",
      currentVersion: "0.2.0",
      notes: "Fixes",
    });
  });

  it("waits six hours before checking again", async () => {
    vi.useFakeTimers();
    renderHook(() => useUpdateCheck());
    await act(async () => {});
    expect(api.checkForUpdate).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS - 1000);
    });
    expect(api.checkForUpdate).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(api.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("ignores a failed background check", async () => {
    api.checkForUpdate.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useUpdateCheck());
    await act(async () => {});
    expect(result.current.update).toBeNull();
  });

  it("lets a manual check fail loudly so Settings can show it", async () => {
    api.checkForUpdate.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useUpdateCheck());
    await act(async () => {});
    await expect(result.current.check()).rejects.toThrow("offline");
  });

  it("marks itself busy while installing and recovers if it fails", async () => {
    let finish: (() => void) | undefined;
    api.installUpdate.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useUpdateCheck());
    await act(async () => {});
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.install();
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish?.();
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });
});
