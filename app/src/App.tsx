import { useEffect, useState } from "react";

/** "system" means: follow prefers-color-scheme. Anything else is a stored override. */
type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "mc-theme";
const PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* storage unavailable: follow the system preference */
  }
  return "system";
}

/** The override wins; only "system" defers to prefers-color-scheme. */
function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
    return;
  }
  root.setAttribute("data-theme", preference);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* the attribute still holds for this session */
  }
}

export default function App() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);

  useEffect(() => {
    applyPreference(preference);
  }, [preference]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-primary">Marketing Canvas</h1>
        <p className="text-sm text-muted">
          Scaffold and design tokens. Screens arrive in the tickets that follow.
        </p>
      </header>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-subtle bg-panel p-5">
        <legend className="px-1 text-xs uppercase tracking-wide text-muted">Theme</legend>
        <div className="flex gap-2">
          {PREFERENCES.map((option) => {
            const selected = option === preference;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => setPreference(option)}
                className={
                  selected
                    ? "rounded-md border border-strong bg-accent px-3 py-1.5 text-sm capitalize text-inverse"
                    : "rounded-md border border-subtle bg-elevated px-3 py-1.5 text-sm capitalize text-primary"
                }
              >
                {option}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          System follows <code className="font-mono">prefers-color-scheme</code>; light and dark
          are stored locally and win over it on the next load.
        </p>
      </fieldset>
    </main>
  );
}
