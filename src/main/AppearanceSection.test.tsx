import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LookSummary, ResolvedLook, Settings } from "../lib/types";
import { api, resetIpc, settingsState } from "../test/mockIpc";
import { AppearanceSection } from "./AppearanceSection";

vi.mock("../lib/ipc", async () => (await import("../test/mockIpc")).ipcMock);

const strawberry: LookSummary = {
  id: "builtin:strawberry-milk",
  name: "Strawberry Milk",
  author: "Posthaste",
  builtin: true,
  base: "light",
  preview: { bg: "#fff5f7", surface: "#ffffff", text: "#4a2c3a", accent: "#ff8fb1" },
};

const mine: LookSummary = {
  id: "user:abc",
  name: "My Look",
  author: null,
  builtin: false,
  base: "dark",
  preview: { bg: "#0f0f0f", surface: "#181818", text: "#f2f2f2", accent: "#ffffff" },
};

function renderSection(patch: Partial<Settings> = {}) {
  const update = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  const onPreviewLook = vi.fn((look: ResolvedLook | null) => void look);
  render(
    <AppearanceSection
      settings={settingsState(patch).settings}
      update={update}
      notify={notify}
      onPreviewLook={onPreviewLook}
    />,
  );
  return { update, notify, user: userEvent.setup() };
}

beforeEach(() => {
  resetIpc();
  api.lookList.mockResolvedValue([strawberry, mine]);
});

describe("the look gallery", () => {
  it("offers Default and every look, marking the selected one", async () => {
    renderSection({ look_id: "builtin:strawberry-milk" });
    const group = await screen.findByRole("radiogroup", { name: "Look" });
    expect(within(group).getByRole("radio", { name: "Default" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Strawberry Milk" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "My Look" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Strawberry Milk" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(group).getByRole("radio", { name: "Default" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("marks Default as selected when no look is set", async () => {
    renderSection({ look_id: null });
    const group = await screen.findByRole("radiogroup", { name: "Look" });
    expect(within(group).getByRole("radio", { name: "Default" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("selects a look and Default", async () => {
    const { update, user } = renderSection({ look_id: null });
    await user.click(await screen.findByRole("radio", { name: "Strawberry Milk" }));
    expect(update).toHaveBeenCalledWith({ look_id: "builtin:strawberry-milk" });

    await user.click(screen.getByRole("radio", { name: "Default" }));
    expect(update).toHaveBeenCalledWith({ look_id: null });
  });

  it("moves the selection with the arrow keys like Segmented", async () => {
    const { update, user } = renderSection({ look_id: "builtin:strawberry-milk" });
    await user.click(await screen.findByRole("radio", { name: "Strawberry Milk" }));
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ look_id: "user:abc" }));
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ look_id: null }));
  });
});

describe("actions for the selected look", () => {
  it("offers Make a copy and Copy share code for a bundled look, not Edit or Delete", async () => {
    renderSection({ look_id: "builtin:strawberry-milk" });
    expect(await screen.findByRole("button", { name: "Make a copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy share code" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("offers Edit and Delete for a user look", async () => {
    renderSection({ look_id: "user:abc" });
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy share code" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make a copy" })).toBeNull();
  });

  it("copies the share code and says so", async () => {
    const { notify, user } = renderSection({ look_id: "builtin:strawberry-milk" });
    api.lookExportCode.mockResolvedValue("posthaste-look:1:abc");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(await screen.findByRole("button", { name: "Copy share code" }));
    await waitFor(() => expect(api.lookExportCode).toHaveBeenCalledWith("builtin:strawberry-milk"));
    expect(writeText).toHaveBeenCalledWith("posthaste-look:1:abc");
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Copied share code"));
  });
});

describe("adding a look from a code", () => {
  it("hands the pasted text to import and selects the new look", async () => {
    const { update, user } = renderSection({ look_id: null });
    api.lookImport.mockResolvedValue({ ...mine, id: "user:new", name: "Imported" });
    await user.click(await screen.findByRole("button", { name: "Add from code…" }));
    await user.type(screen.getByLabelText("Look code"), "posthaste-look:1:abc");
    await user.click(screen.getByRole("button", { name: "Add look" }));
    await waitFor(() => expect(api.lookImport).toHaveBeenCalledWith("posthaste-look:1:abc"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ look_id: "user:new" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add from code" })).toBeNull());
  });

  it("keeps the dialog open with the error when the code is rejected", async () => {
    const { user } = renderSection({ look_id: null });
    api.lookImport.mockRejectedValue({
      code: "look_invalid",
      message: "That code looks incomplete, or it changed when it was copied. Ask for it again.",
    });
    await user.click(await screen.findByRole("button", { name: "Add from code…" }));
    await user.type(screen.getByLabelText("Look code"), "broken");
    await user.click(screen.getByRole("button", { name: "Add look" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That code looks incomplete");
    expect(screen.getByRole("dialog", { name: "Add from code" })).toBeInTheDocument();
    expect(screen.getByLabelText("Look code")).toHaveValue("broken");
  });
});

describe("deleting a look", () => {
  it("asks for confirmation and then deletes", async () => {
    const { user } = renderSection({ look_id: "user:abc" });
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: /Delete “My Look”\?/ });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.lookDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.lookDelete).toHaveBeenCalledWith("user:abc"));
  });
});

describe("refreshing", () => {
  it("refetches the list when another window changes looks", async () => {
    const { emit } = await import("../test/mockIpc");
    renderSection({ look_id: null });
    await screen.findByRole("radio", { name: "Strawberry Milk" });
    api.lookList.mockResolvedValue([strawberry, mine, { ...mine, id: "user:new", name: "Third" }]);
    emit("looks-changed");
    expect(await screen.findByRole("radio", { name: "Third" })).toBeInTheDocument();
  });
});
