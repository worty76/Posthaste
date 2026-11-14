import { afterEach, describe, expect, it } from "vitest";
import { applyLook } from "./appearance";
import type { ResolvedLook } from "./types";

function look(
  tokens: Record<string, string>,
  shape: ResolvedLook["shape"] = "round",
  font: ResolvedLook["font"] = "rounded",
): ResolvedLook {
  return { id: "test", name: "Test", author: null, base: "dark", shape, font, tokens };
}

const root = document.documentElement;

afterEach(() => {
  applyLook(null);
});

describe("applyLook", () => {
  it("sets every token and the shape and font attributes", () => {
    applyLook(look({ "--bg": "#1a1423", "--accent": "#c58bff" }));
    expect(root.style.getPropertyValue("--bg")).toBe("#1a1423");
    expect(root.style.getPropertyValue("--accent")).toBe("#c58bff");
    expect(root.dataset.shape).toBe("round");
    expect(root.dataset.font).toBe("rounded");
  });

  it("removes tokens the second look no longer has", () => {
    applyLook(look({ "--bg": "#1a1423", "--accent": "#c58bff" }));
    applyLook(look({ "--bg": "#0f0f0f" }, "sharp", "mono"));
    expect(root.style.getPropertyValue("--bg")).toBe("#0f0f0f");
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(root.dataset.shape).toBe("sharp");
    expect(root.dataset.font).toBe("mono");
  });

  it("clears everything when given null", () => {
    applyLook(look({ "--bg": "#1a1423" }));
    applyLook(null);
    expect(root.style.getPropertyValue("--bg")).toBe("");
    expect(root.dataset.shape).toBeUndefined();
    expect(root.dataset.font).toBeUndefined();
  });

  it("never writes the theme attribute", () => {
    root.dataset.theme = "light";
    applyLook(look({ "--bg": "#1a1423" }));
    expect(root.dataset.theme).toBe("light");
    applyLook(null);
    expect(root.dataset.theme).toBe("light");
    delete root.dataset.theme;
  });
});
