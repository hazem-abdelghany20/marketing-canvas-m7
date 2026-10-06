import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { arrangeBoard, createNodeAt, createNote } from "../canvas/actions";
import { exitConnect, startConnect } from "../canvas/connect";
import { useCitationHighlight } from "../canvas/useCitationHighlight";
import { useFitToBounds } from "../canvas/useFitToBounds";
import { useGoToNode } from "../canvas/useGoToNode";
import { useViewport } from "../canvas/useViewport";
import { useViewportCenter } from "../canvas/viewportCenter";
import { useWorkspaceShortcuts } from "../canvas/useWorkspaceShortcuts";
import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import { PANEL_WIDTH } from "../components/detail/ConnectionList";
import { importFiles, ROW_GAP } from "../files/importFiles";
import { isNarrow, useNarrow } from "../lib/useMediaQuery";
import { ADD_TAB_ID } from "../phone/TabBar";
import { appStore } from "../store";
import type { CanvasNode, NodeType } from "../types";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";
import { useToolShortcuts } from "../whiteboard/useToolShortcuts";

/** Where a search result lands: close enough to read the card. */
const SEARCH_FOCUS_ZOOM = 1.25;

/**
 * Everything the workspace does, apart from how it looks: loading the board, the add menu, importing files,
 * arranging, connecting, searching, and the keys. The desktop layout and the phone layout both draw from this,
 * so a handler is written once. Must be called inside the React Flow provider.
 */
export function useWorkspace() {
  const navigate = useNavigate();
  const token = useStore(appStore, (s) => s.token);
  const status = useStore(appStore, (s) => s.boardStatus);
  const boardError = useStore(appStore, (s) => s.boardError);
  const nodeCount = useStore(appStore, (s) => Object.keys(s.nodes).length);
  const pendingCount = useUi((s) => s.pendingImports.length);
  const addMenuOpen = useUi((s) => s.addMenuOpen);
  const searchOpen = useUi((s) => s.searchOpen);
  const connecting = useUi((s) => s.connect.active);
  const panelOpen = useMatch("/node/:id") !== null;
  const narrow = useNarrow();
  const sheetOpen = useUi((s) => s.chatSheetOpen);
  const flow = useReactFlow();
  const fileInput = useRef<HTMLInputElement>(null);
  const { initialViewport, onViewportChange } = useViewport();
  const viewportCenter = useViewportCenter();
  const fitToBounds = useFitToBounds();
  useCitationHighlight();

  useEffect(() => {
    uiStore.getState().reset();
    void appStore.getState().loadBoard();
  }, []);

  const ready = status === "ready" && initialViewport !== null;

  // Focus goes back where it came from when the menu closes without creating anything.
  const returnFocus = useRef<HTMLElement | null>(null);
  const openAddMenu = useCallback(() => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
    uiStore.getState().setAddMenuOpen(true);
  }, []);
  const closeAddMenu = useCallback((restoreFocus = true) => {
    uiStore.getState().setAddMenuOpen(false);
    if (!restoreFocus) return;
    // Back to what had focus; failing that, to the control that opens the menu: the toolbar's, or the phone's Add tab.
    const target = returnFocus.current?.isConnected
      ? returnFocus.current
      : (document.getElementById("toolbar-add") ?? document.getElementById(ADD_TAB_ID));
    target?.focus();
  }, []);

  const addNote = useCallback(() => {
    closeAddMenu(false);
    void createNote(viewportCenter(), {
      onCreated: (node) => navigate(`/node/${encodeURIComponent(node.id)}`, { state: { focusTitle: true } }),
    });
  }, [closeAddMenu, navigate, viewportCenter]);

  /** The phone's Add sheet chooses the type first; the desktop's menu makes a note and asks later. */
  const addOfType = useCallback(
    (type: NodeType) => {
      closeAddMenu(false);
      void createNodeAt(viewportCenter(), {
        type,
        onCreated: (node) => navigate(`/node/${encodeURIComponent(node.id)}`, { state: { focusTitle: true } }),
      });
    },
    [closeAddMenu, navigate, viewportCenter],
  );

  const fromChat = useCallback(() => {
    closeAddMenu(false);
    // Opens the rail if it is folded away, then the composer takes focus.
    uiStore.getState().openChat();
  }, [closeAddMenu]);

  const runImport = useCallback(async (files: File[], origin: { x: number; y: number }) => {
    const { messages } = await importFiles(files, origin, { store: appStore, ui: uiStore });
    if (messages.length > 0) uiStore.getState().toast({ message: messages.join(" "), tone: "warn", durationMs: 9000 });
  }, []);

  // Dropped files centre on the drop point; picked files centre on the viewport.
  const onDropFiles = useCallback(
    (files: File[], at: { clientX: number; clientY: number }) => {
      const point = flow.screenToFlowPosition({ x: at.clientX, y: at.clientY });
      void runImport(files, { x: point.x - CARD_WIDTH / 2, y: point.y - CARD_HEIGHT / 2 });
    },
    [flow, runImport],
  );
  const onPickFiles = useCallback(
    (files: File[]) => {
      const center = viewportCenter();
      const rowWidth = (files.length - 1) * (CARD_WIDTH + ROW_GAP);
      void runImport(files, { x: center.x - rowWidth / 2, y: center.y });
    },
    [runImport, viewportCenter],
  );
  const pickFile = useCallback(() => {
    closeAddMenu(false);
    fileInput.current?.click();
  }, [closeAddMenu]);

  // Auto-arrange is an action, never a mode: it runs here and nowhere else.
  const arrange = useCallback(() => {
    // The camera frames what the detail panel leaves uncovered.
    arrangeBoard((bounds) => fitToBounds(bounds, panelOpen && !isNarrow() ? PANEL_WIDTH : 0));
  }, [fitToBounds, panelOpen]);

  const toggleConnect = useCallback(() => {
    if (uiStore.getState().connect.active) exitConnect();
    else startConnect();
  }, []);

  // O5 — focus comes back to where it was, unless a result was chosen: then it goes to that card.
  const searchReturn = useRef<HTMLElement | null>(null);
  const openSearch = useCallback(() => {
    if (Object.keys(appStore.getState().nodes).length === 0) return false;
    if (!uiStore.getState().searchOpen) {
      const active = document.activeElement;
      searchReturn.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    uiStore.getState().setSearchOpen(true);
    return true;
  }, []);
  const closeSearch = useCallback(() => {
    uiStore.getState().setSearchOpen(false);
    searchReturn.current?.focus();
  }, []);
  const goTo = useGoToNode();
  const goToNode = useCallback(
    (node: CanvasNode) => {
      uiStore.getState().setSearchOpen(false);
      goTo(node, { zoom: SEARCH_FOCUS_ZOOM, focusCard: true });
    },
    [goTo],
  );
  const createFromSearch = useCallback(
    (title: string) => {
      uiStore.getState().setSearchOpen(false);
      void createNote(viewportCenter(), {
        title,
        onCreated: (node) => navigate(`/node/${encodeURIComponent(node.id)}`, { state: { focusTitle: true } }),
      });
    },
    [navigate, viewportCenter],
  );

  // Below 900px the open chat sheet covers everything; keys must not act on what is hidden beneath it.
  useWorkspaceShortcuts(ready && !(narrow && sheetOpen), {
    onAdd: openAddMenu,
    onConnect: toggleConnect,
    onSearch: openSearch,
  });

  // The dock's keys (V P H E S T C, Esc). Like the others, they stand down while the sheet covers the canvas.
  useToolShortcuts(ready && !(narrow && sheetOpen));

  const state = ready ? "ready" : status === "error" ? "error" : "loading";
  // What the toolbar says to anything pressed before the board is there: still coming, or not coming.
  const waiting = ready ? null : state === "error" ? COPY.boardFailed : COPY.loading;

  return {
    token,
    boardError,
    nodeCount,
    pendingCount,
    addMenuOpen,
    searchOpen,
    connecting,
    panelOpen,
    initialViewport,
    onViewportChange,
    ready,
    state,
    waiting,
    fileInput,
    openAddMenu,
    closeAddMenu,
    addNote,
    addOfType,
    fromChat,
    pickFile,
    onPickFiles,
    onDropFiles,
    arrange,
    toggleConnect,
    openSearch,
    closeSearch,
    goToNode,
    createFromSearch,
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspace>;
