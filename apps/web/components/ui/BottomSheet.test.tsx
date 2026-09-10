import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

describe("BottomSheet", () => {
  it("renders a labelled dialog with its content", () => {
    render(
      <BottomSheet title="Más secciones" onClose={() => undefined}>
        <p>contenido</p>
      </BottomSheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: "Más secciones" })).toBeTruthy();
    expect(screen.getByText("contenido")).toBeTruthy();
  });

  it("closes with the close button, Escape and the backdrop", async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="Más secciones" onClose={onClose}>
        <p>contenido</p>
      </BottomSheet>
    );

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("renders nothing when closed", () => {
    render(
      <BottomSheet title="Más secciones" onClose={() => undefined} open={false}>
        <p>contenido</p>
      </BottomSheet>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
