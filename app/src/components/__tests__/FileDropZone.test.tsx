// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDropZone } from "../FileDropZone";

afterEach(cleanup);

function transfer(files: File[] = [new File(["x"], "a.png", { type: "image/png" })]) {
  return { types: ["Files"], files, dropEffect: "none" };
}

function mount(enabled: boolean) {
  const onFiles = vi.fn();
  const { container } = render(
    <FileDropZone enabled={enabled} onFiles={onFiles}>
      <div>canvas</div>
    </FileDropZone>,
  );
  const zone = container.querySelector("[data-drop-zone]")!;
  return { zone, onFiles, outline: () => container.querySelector("[data-drop-outline]") };
}

describe("FileDropZone", () => {
  it("outlines the canvas while files are dragged over it, and hands them over on drop", () => {
    const { zone, onFiles, outline } = mount(true);
    const dataTransfer = transfer();

    fireEvent.dragOver(zone, { dataTransfer });
    expect(outline()).not.toBeNull();

    // jsdom has no DragEvent, so the drop point is covered by e2e/file-import.spec.ts.
    fireEvent.drop(zone, { dataTransfer });
    expect(outline()).toBeNull();
    expect(onFiles.mock.calls[0]![0]).toEqual(dataTransfer.files);
  });

  it("shows no drop target and takes nothing while it is off, as in connect mode", () => {
    const { zone, onFiles, outline } = mount(false);
    const dataTransfer = transfer();

    fireEvent.dragOver(zone, { dataTransfer });
    expect(outline()).toBeNull();
    fireEvent.drop(zone, { dataTransfer });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("ignores drags that carry no files", () => {
    const { zone, outline } = mount(true);
    fireEvent.dragOver(zone, { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(outline()).toBeNull();
  });
});
