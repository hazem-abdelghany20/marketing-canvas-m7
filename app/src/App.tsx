import { useEffect, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router-dom";
import { redirectIfSignedIn, requireSession } from "./auth/session";
import { AuthSkeleton } from "./components/AuthCard";
import SignIn from "./routes/SignIn";
import NodeDetail from "./routes/NodeDetail";
import SignUp from "./routes/SignUp";
import Workspace from "./routes/Workspace";
import { setSessionExpiredHandler } from "./store";

export const routes: RouteObject[] = [
  {
    // Loaders run before first paint; the skeleton covers the moment they take.
    HydrateFallback: AuthSkeleton,
    children: [
      { path: "/signin", loader: redirectIfSignedIn, Component: SignIn },
      { path: "/signup", loader: redirectIfSignedIn, Component: SignUp },
      {
        path: "/",
        loader: requireSession,
        Component: Workspace,
        // The detail panel renders inside the workspace, over a canvas that stays mounted.
        children: [{ path: "node/:id", Component: NodeDetail }],
      },
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
