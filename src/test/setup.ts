import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

// jsdom has no matchMedia; tests flip `systemDark` to simulate the OS theme.
export const media = { dark: false, listeners: new Set<() => void>() };
window.matchMedia = ((query: string) => ({
  get matches() {
    return query.includes("dark") ? media.dark : false;
  },
  media: query,
  addEventListener: (_: string, fn: () => void) => media.listeners.add(fn),
  removeEventListener: (_: string, fn: () => void) => media.listeners.delete(fn),
})) as unknown as typeof window.matchMedia;

// jsdom doesn't implement <dialog> methods.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new Event("close"));
};
Element.prototype.scrollIntoView = vi.fn();
