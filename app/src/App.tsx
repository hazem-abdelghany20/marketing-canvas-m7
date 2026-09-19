import { useEffect, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router-dom";
import { redirectIfSignedIn, requireSession } from "./auth/session";
import { AuthSkeleton } from "./components/AuthCard";
import SignIn from "./routes/SignIn";
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
      { path: "/", loader: requireSession, Component: Workspace },
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
