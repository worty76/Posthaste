import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedLook, Settings } from "../lib/types";
import { api, emit, resetIpc, settingsState } from "../test/mockIpc";
import { media } from "../test/setup";
import { useAppearance } from "./useAppearance";

vi.mock("../lib/ipc", async () => (await import("../test/mockIpc")).ipcMock);

const root = document.documentElement;

function inkLook(base: ResolvedLook["base"] = "dark"): ResolvedLook {
  return {
    id: "builtin:ink",
    name: "Ink",
    author: null,
    base,
    shape: "sharp",
    font: "mono",
    tokens: { "--bg": "#0f0f0f", "--accent": "#ffffff" },
  };
}

function lookFromResolved(base: ResolvedLook["base"] = "light"): ResolvedLook {
  return { ...inkLook(base), id: "preview", name: "Preview" };
}

/** Renders the hook with buttons that drive `setPreview` from the UI. */
function Probe({ settings }: { settings: Settings }) {
  const { setPreview } = useAppearance(settings);
  return (
    <>
      <button onClick={() => setPreview(lookFromResolved("light"))}>Preview light</button>
      <button onClick={() => setPreview(null)}>Clear preview</button>
    </>
  );
}

function renderProbe(patch: Partial<Settings> = {}) {
  render(<Probe settings={{ ...settingsState(patch).settings }} />);
  return userEvent.setup();
}

beforeEach(() => {
  resetIpc();
  media.dark = false;
});

afterEach(() => {
  applyLookCleanup();
});

/** The hook removes its tokens on unmount; this guards the html element
    between tests in case a test asserts before cleanup ran. */
function applyLookCleanup() {
  root.removeAttribute("style");
  delete root.dataset.shape;
  delete root.dataset.font;
}

describe("useAppearance", () => {
  it("applies the active look's tokens and pins the theme to its base", async () => {
    api.lookActive.mockResolvedValue(inkLook("dark"));
    await renderProbe({ look_id: "builtin:ink" });
    await waitFor(() => expect(root.style.getPropertyValue("--bg")).toBe("#0f0f0f"));
    expect(root.style.getPropertyValue("--accent")).toBe("#ffffff");
    expect(root.dataset.shape).toBe("sharp");
    expect(root.dataset.font).toBe("mono");
    expect(root.dataset.theme).toBe("dark");
  });

  it("keeps the look's base when the OS appearance flips", async () => {
    api.lookActive.mockResolvedValue(inkLook("dark"));
    await renderProbe({ look_id: "builtin:ink" });
    await waitFor(() => expect(root.dataset.theme).toBe("dark"));
    media.dark = true;
    act(() => media.listeners.forEach((fn) => fn()));
    expect(root.dataset.theme).toBe("dark");
  });

  it("refetches the active look when another window changes looks", async () => {
    api.lookActive.mockResolvedValue(null);
    await renderProbe({ look_id: "builtin:ink" });
    await waitFor(() => expect(api.lookActive).toHaveBeenCalledTimes(1));
    api.lookActive.mockResolvedValue(inkLook("dark"));
    act(() => emit("looks-changed"));
    await waitFor(() => expect(api.lookActive).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(root.style.getPropertyValue("--bg")).toBe("#0f0f0f"));
  });

  it("falls back to the theme setting and no tokens when the look cannot be resolved", async () => {
    api.lookActive.mockRejectedValue({ code: "not_found", message: "That note no longer exists." });
    await renderProbe({ look_id: "user:gone" });
    await waitFor(() => expect(api.lookActive).toHaveBeenCalled());
    await act(async () => {});
    expect(root.style.getPropertyValue("--bg")).toBe("");
    expect(root.dataset.shape).toBeUndefined();
    expect(root.dataset.theme).toBe("light"); // media.dark is false
  });

  it("lets a preview override the active look and restores it when cleared", async () => {
    api.lookActive.mockResolvedValue(inkLook("dark"));
    const user = await renderProbe({ look_id: "builtin:ink" });
    await waitFor(() => expect(root.dataset.theme).toBe("dark"));
    await user.click(screen.getByRole("button", { name: "Preview light" }));
    await waitFor(() => expect(root.dataset.theme).toBe("light"));
    expect(root.style.getPropertyValue("--bg")).toBe("#0f0f0f"); // same tokens, new look
    await user.click(screen.getByRole("button", { name: "Clear preview" }));
    await waitFor(() => expect(root.dataset.theme).toBe("dark"));
  });

  it("leaves the plain theme behaviour alone when no look is selected", async () => {
    await renderProbe({ look_id: null });
    await waitFor(() => expect(root.dataset.theme).toBe("light"));
    media.dark = true;
    act(() => media.listeners.forEach((fn) => fn()));
    expect(root.dataset.theme).toBe("dark");
  });
});
