import { vi } from "vitest";

export type Logged = [string, ...unknown[]];

/**
 * A 2D context that does nothing but remember: every method call and every property set goes into `log`, in
 * order, and measuring text gives each character 7 units. jsdom has no canvas, and a recorded order of
 * operations is what the export is tested on anyway.
 */
export function recordingContext() {
  const log: Logged[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_target, name: string) {
      if (name === "measureText") return (text: string) => ({ width: text.length * 7 });
      if (name in state) return state[name];
      return (...args: unknown[]) => void log.push([name, ...args]);
    },
    set(_target, name: string, value) {
      state[name] = value;
      log.push([`set ${name}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

/** What was drawn with fillText, in order. */
export const texts = (log: Logged[]) => log.filter(([name]) => name === "fillText").map(([, text]) => String(text));

/** The value fillStyle held when the nth `method` call was made. */
export function styleAt(log: Logged[], method: string, nth = 0, property = "fillStyle") {
  let seen = -1;
  let style: unknown;
  for (const [name, ...args] of log) {
    if (name === `set ${property}`) style = args[0];
    if (name === method && ++seen === nth) return style;
  }
  return undefined;
}

/** A Path2D that only remembers the path it was made from. */
export class FakePath2D {
  constructor(public readonly d?: string) {}
}

/** A canvas that hands out one recording context and settles toBlob however the test says. */
export function fakeCanvas(toBlob: (callback: (blob: Blob | null) => void, type?: string) => void = (cb, type) => cb(new Blob(["png"], { type }))) {
  const { ctx, log } = recordingContext();
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob } as unknown as HTMLCanvasElement;
  return { canvas, ctx, log };
}

/** Puts canvas, Path2D and blob URLs in jsdom, and catches the link a download is made with. */
export function stubBrowserExport(options: { toBlob?: Parameters<typeof fakeCanvas>[0] } = {}) {
  const { ctx, log } = recordingContext();
  const created: Array<{ width: number; height: number }> = [];
  const toBlobCalls: unknown[] = [];
  const toBlob = options.toBlob ?? ((cb: (b: Blob | null) => void, type?: string) => cb(new Blob(["png"], { type })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    created.push({ width: this.width, height: this.height });
    return ctx;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback, type?: string) {
    toBlobCalls.push(type);
    toBlob(cb, type);
  } as never);
  vi.stubGlobal("Path2D", FakePath2D);
  const urls = { made: [] as string[], revoked: [] as string[] };
  URL.createObjectURL = vi.fn(() => {
    urls.made.push("blob:board");
    return "blob:board";
  });
  URL.revokeObjectURL = vi.fn((url: string) => void urls.revoked.push(url));
  const downloads: Array<{ download: string; href: string }> = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ download: this.download, href: this.href });
  });
  return { log, created, toBlobCalls, urls, downloads };
}
