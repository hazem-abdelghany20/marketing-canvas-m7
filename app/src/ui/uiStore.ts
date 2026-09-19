import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

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

export const FLASH_MS = 1200;
const DEFAULT_TOAST_MS = 5000;

export interface UiState {
  selectedIds: string[];
  connect: ConnectState;
  addMenuOpen: boolean;
  searchOpen: boolean;
  flashIds: string[];
  pendingImports: PendingImport[];
  toasts: Toast[];

  select: (ids: string[]) => void;
  setConnect: (connect: Partial<ConnectState>) => void;
  exitConnect: () => void;
  setAddMenuOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  /** Endpoints of a new edge flash once. */
  flash: (ids: string[]) => void;
  addPending: (pending: PendingImport) => void;
  removePending: (id: string) => void;
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
};

let nextToastId = 1;

export const uiStore = createStore<UiState>()((set) => ({
  ...INITIAL,

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

  toast(input) {
    const toast: Toast = { tone: "info", durationMs: DEFAULT_TOAST_MS, ...input, id: nextToastId++ };
    // One message per wording: a repeated failure refreshes its toast instead of stacking.
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== toast.message), toast].slice(-4) }));
    return toast.id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  reset: () => set(INITIAL),
}));

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}
