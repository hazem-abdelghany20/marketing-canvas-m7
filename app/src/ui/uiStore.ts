import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { isNarrow } from "../lib/useMediaQuery";
import type { InkColorId } from "../whiteboard/inkPalette";
import type { Tool } from "../whiteboard/toolMode";

/**
 * Client-only state: what is selected, which overlay is open, what the toasts
 * say. None of it round-trips to the API, so it lives apart from the cache in
 * src/store, which mirrors the server.
 */

export type ToastTone = "info" | "success" | "warn" | "danger";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

export type ToastInput = Omit<Toast, "id" | "tone" | "durationMs"> & Partial<Pick<Toast, "tone" | "durationMs">>;

/** A file being read before its asset node exists. Rendered as a placeholder card. */
export interface PendingImport {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  x: number;
  y: number;
}

export interface ConnectState {
  active: boolean;
  sourceId: string | null;
  /** Set once a target is picked; the kind picker is open while it is. */
  targetId: string | null;
}

/**
 * An Auto-arrange in flight: where each node that is moving started, and when. The
 * store already holds the new positions; the canvas draws the glide between the two.
 */
export interface Arrangement {
  from: Record<string, { x: number; y: number }>;
  startedAt: number;
  durationMs: number;
}

/**
 * The rail's collapse is remembered for this tab across a reload. It is a preference of
 * the screen, not board data, so it is not sent to the API; and localStorage is for the
 * session token and the theme alone, so it lives in sessionStorage.
 */
const RAIL_COLLAPSED_KEY = "mc-rail-collapsed";

function readRailCollapsed(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(RAIL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeRailCollapsed(collapsed: boolean) {
  try {
    if (collapsed) globalThis.sessionStorage?.setItem(RAIL_COLLAPSED_KEY, "1");
    else globalThis.sessionStorage?.removeItem(RAIL_COLLAPSED_KEY);
  } catch {
    /* storage unavailable: the rail simply opens expanded next time */
  }
}

/** What the pen and highlighter draw with next. A preference of the screen, so it is not sent anywhere. */
export interface InkPrefs {
  color: InkColorId;
  /** The pen's width in board units; the highlighter draws it five times wider. */
  size: number;
}

export const FLASH_MS = 1200;
const DEFAULT_TOAST_MS = 5000;
const ACTION_TOAST_MS = 10_000;

export interface UiState {
  selectedIds: string[];
  connect: ConnectState;
  addMenuOpen: boolean;
  searchOpen: boolean;
  flashIds: string[];
  pendingImports: PendingImport[];
  toasts: Toast[];
  /** Null at rest, and always under prefers-reduced-motion: the move is then instant. */
  arrangement: Arrangement | null;
  /** Nodes the assistant's latest reply cited; marked on the canvas until the selection moves elsewhere. */
  citedIds: string[];
  /** The chat rail's column is collapsed to a strip (wide screens). Persisted for the tab. */
  railCollapsed: boolean;
  /** The chat rail's overlay sheet is open (below 900px). Not persisted. */
  chatSheetOpen: boolean;
  /** What is typed in the composer, so it survives collapsing the rail. */
  chatDraft: string;
  /** Replies whose proposal is being added to the canvas right now. */
  applyingProposals: string[];
  /** Set by "From chat": the composer takes focus as soon as it is on screen, once. */
  composerFocusPending: boolean;
  /** The whiteboard tool in hand. Client-only; Select is the resting state. */
  tool: Tool;
  ink: InkPrefs;
  /** The "Clear all ink?" confirmation is open. */
  clearInkOpen: boolean;

  select: (ids: string[]) => void;
  setConnect: (connect: Partial<ConnectState>) => void;
  exitConnect: () => void;
  setAddMenuOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  /** Endpoints of a new edge flash once. */
  flash: (ids: string[]) => void;
  addPending: (pending: PendingImport) => void;
  removePending: (id: string) => void;
  setCited: (ids: string[]) => void;
  setProposalApplying: (messageId: string, applying: boolean) => void;
  setRailCollapsed: (collapsed: boolean) => void;
  setChatSheetOpen: (open: boolean) => void;
  setChatDraft: (text: string) => void;
  /** Puts text in the composer without sending it, and focuses the composer. */
  prefillChat: (text: string) => void;
  /** Asks for focus in the composer, leaving its text alone. */
  prefillChatFocus: () => void;
  /** Shows the rail (opening the sheet when narrow, expanding the column otherwise) and focuses the composer. */
  openChat: () => void;
  consumeComposerFocus: () => void;
  /** Raw setter: whether the tool may be used is decided by `reduceTool`, before this is called. */
  setTool: (tool: Tool) => void;
  setInk: (patch: Partial<InkPrefs>) => void;
  setClearInkOpen: (open: boolean) => void;
  startArrangement: (from: Arrangement["from"], durationMs: number) => void;
  endArrangement: () => void;
  toast: (toast: ToastInput) => number;
  dismissToast: (id: number) => void;
  reset: () => void;
}

const IDLE_CONNECT: ConnectState = { active: false, sourceId: null, targetId: null };

const INITIAL = {
  selectedIds: [] as string[],
  connect: IDLE_CONNECT,
  addMenuOpen: false,
  searchOpen: false,
  flashIds: [] as string[],
  pendingImports: [] as PendingImport[],
  toasts: [] as Toast[],
  arrangement: null as Arrangement | null,
  citedIds: [] as string[],
  applyingProposals: [] as string[],
  chatSheetOpen: false,
  chatDraft: "",
  composerFocusPending: false,
  tool: "select" as Tool,
  ink: { color: "ink-1", size: 3 } as InkPrefs,
  clearInkOpen: false,
};

let nextToastId = 1;

export const uiStore = createStore<UiState>()((set) => ({
  ...INITIAL,
  railCollapsed: readRailCollapsed(),

  select: (ids) => set({ selectedIds: ids }),
  setConnect: (connect) => set((s) => ({ connect: { ...s.connect, ...connect } })),
  exitConnect: () => set({ connect: IDLE_CONNECT }),
  setAddMenuOpen: (open) => set({ addMenuOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),

  flash(ids) {
    set({ flashIds: ids });
    setTimeout(() => set((s) => (s.flashIds === ids ? { flashIds: [] } : {})), FLASH_MS);
  },

  addPending: (pending) => set((s) => ({ pendingImports: [...s.pendingImports, pending] })),
  removePending: (id) => set((s) => ({ pendingImports: s.pendingImports.filter((p) => p.id !== id) })),

  setCited: (ids) => set({ citedIds: ids }),
  setProposalApplying: (messageId, applying) =>
    set((s) => ({
      applyingProposals: applying
        ? [...s.applyingProposals.filter((id) => id !== messageId), messageId]
        : s.applyingProposals.filter((id) => id !== messageId),
    })),
  setRailCollapsed(collapsed) {
    writeRailCollapsed(collapsed);
    set({ railCollapsed: collapsed });
  },
  setChatSheetOpen: (open) => set({ chatSheetOpen: open }),
  setChatDraft: (text) => set({ chatDraft: text }),
  prefillChat: (text) => set({ chatDraft: text, composerFocusPending: true }),
  prefillChatFocus: () => set({ composerFocusPending: true }),
  openChat() {
    if (isNarrow()) {
      set({ chatSheetOpen: true, composerFocusPending: true });
    } else {
      writeRailCollapsed(false);
      set({ railCollapsed: false, composerFocusPending: true });
    }
  },
  consumeComposerFocus: () => set({ composerFocusPending: false }),
  // A drawing tool makes the cards inert, so a selection (and the quick-peek on it) has nothing to point at.
  setInk: (patch) => set((s) => ({ ink: { ...s.ink, ...patch } })),
  setClearInkOpen: (open) => set({ clearInkOpen: open }),
  setTool: (tool) =>
    set((s) => (tool === "select" || s.selectedIds.length === 0 ? { tool } : { tool, selectedIds: [] })),

  startArrangement: (from, durationMs) => set({ arrangement: { from, durationMs, startedAt: performance.now() } }),
  endArrangement: () => set({ arrangement: null }),

  toast(input) {
    // A toast with something to press stays long enough to be reached and pressed, unless it says otherwise.
    const durationMs = input.durationMs ?? (input.actionLabel ? ACTION_TOAST_MS : DEFAULT_TOAST_MS);
    const toast: Toast = { tone: "info", ...input, durationMs, id: nextToastId++ };
    // One message per wording: a repeated failure refreshes its toast instead of stacking.
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== toast.message), toast].slice(-4) }));
    return toast.id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  reset: () => set({ ...INITIAL, railCollapsed: readRailCollapsed() }),
}));

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}
