# Scaffold the app and define the design tokens

## Context
- `docs/spec.md` § Dependency manifest
- `docs/spec.md` § Design tokens
- `docs/spec.md` § Global rules

## Scope
`package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`,
`index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`.
No other files.

## Acceptance
- Given a clean checkout, when `npm install && npm run dev` runs, then the dev server starts and renders a page with no console errors.
- Given the token stylesheet, when it is inspected, then every token named in the spec's token list is defined for both light and dark themes.
- Given `prefers-color-scheme: dark`, when the app loads with no stored override, then dark token values are in effect.
- When a theme override is stored locally, the app shall apply it over the system preference on load.
- Given the repo, when grepped for a raw hex outside `src/styles/tokens.css`, then no match is found.

## Guardrails
Only the dependencies in the manifest. No component work. No routing.

## Verify
`npm run build && npm run typecheck && ! grep -rEn '#[0-9a-fA-F]{3,8}\b' src --include='*.tsx' --include='*.ts' --include='*.css' | grep -v tokens.css`
