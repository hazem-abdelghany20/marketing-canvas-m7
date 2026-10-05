import { configure } from "@testing-library/dom";

// The workspace mounts React Flow; its first paint can outlast the 1s default
// on a busy machine. A slow render is not a wrong one.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no CSS.escape, and the app uses it to look a card up by id. Without
// this the uncaught TypeError fails the whole run (exit 1) even though every test passes.
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function") {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: {
      ...(globalThis.CSS ?? {}),
      escape: (value: string) => String(value).replace(/[^a-zA-Z0-9_ -￿-]/g, (c) => `\\${c}`),
    },
  });
}

// jsdom has no PointerEvent, so fireEvent.pointerDown falls back to a bare Event that carries no
// clientX, button or pointerId. A MouseEvent that adds the pointer fields is all the whiteboard needs.
// (Only where there is a DOM at all: some suites run in plain node.)
if (typeof globalThis.MouseEvent !== "undefined" && typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  Object.defineProperty(globalThis, "PointerEvent", { configurable: true, value: PointerEventPolyfill });
}
