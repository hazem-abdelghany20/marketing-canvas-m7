import { useEffect, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router-dom";
import { useStore } from "zustand";
import { redirectIfSignedIn, requireSession } from "./auth/session";
import { AuthSkeleton } from "./components/AuthCard";
import SignIn from "./routes/SignIn";
import SignUp from "./routes/SignUp";
import { appStore, setSessionExpiredHandler } from "./store";

export const routes: RouteObject[] = [
  {
    // Loaders run before first paint; the skeleton covers the moment they take.
    HydrateFallback: AuthSkeleton,
    children: [
      { path: "/signin", loader: redirectIfSignedIn, Component: SignIn },
      { path: "/signup", loader: redirectIfSignedIn, Component: SignUp },
      { path: "/", loader: requireSession, Component: BoardPlaceholder },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

export default function App() {
  const [router] = useState(() => createBrowserRouter(routes));

  useEffect(() => {
    setSessionExpiredHandler(() => void router.navigate("/signin", { replace: true }));
  }, [router]);

  return <RouterProvider router={router} />;
}

/**
 * Stand-in for `/` until the workspace lands in ticket 004. It loads the board so
 * sign-up can land on the first-run empty state, and offers a way back out.
 */
function BoardPlaceholder() {
  const status = useStore(appStore, (s) => s.boardStatus);
  const nodeCount = useStore(appStore, (s) => Object.keys(s.nodes).length);
  const edgeCount = useStore(appStore, (s) => Object.keys(s.edges).length);
  const userName = useStore(appStore, (s) => s.user?.name);
  const token = useStore(appStore, (s) => s.token);

  useEffect(() => {
    void appStore.getState().loadBoard();
  }, []);

  if (!token) return <Navigate to="/signin" replace />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas bg-[radial-gradient(var(--grid-dot)_1px,transparent_1px)] bg-[length:26px_26px] p-6 text-center">
      {status === "loading" || status === "idle" ? (
        <p role="status" className="text-sm text-muted">
          Loading your board…
        </p>
      ) : status === "error" ? (
        <>
          <p className="text-sm text-danger">We couldn't load your board. Check your connection, then reload.</p>
          <button
            type="button"
            onClick={() => void appStore.getState().loadBoard()}
            className="rounded-md border border-subtle bg-elevated px-3 py-1.5 text-sm"
          >
            Reload
          </button>
        </>
      ) : nodeCount === 0 ? (
        <>
          <h1 className="text-lg font-semibold text-primary">Nothing on the canvas yet.</h1>
          <p className="max-w-sm text-sm text-muted">
            Goals, strategies, campaigns, content, assets and notes will live here.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-primary">
            {nodeCount} nodes, {edgeCount} connections
          </h1>
          <p className="max-w-sm text-sm text-muted">Your board is loaded. The canvas arrives in the next ticket.</p>
        </>
      )}
      <button
        type="button"
        onClick={() => void appStore.getState().signOut()}
        className="mt-4 text-[13px] font-semibold text-accent underline underline-offset-2"
      >
        {userName ? `Sign out ${userName}` : "Sign out"}
      </button>
    </main>
  );
}
