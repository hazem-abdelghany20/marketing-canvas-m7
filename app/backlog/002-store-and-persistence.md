# Build the API client and the store cache

## Context
- `docs/spec.md` § Data model
- `docs/spec.md` § Dependency manifest, the store's role
- `../../api/README.md` — the contract this layer speaks
- `docs/state-matrix.md` § S3 — Workspace (shell), Loading and Error rows

## Scope
`src/api/client.ts` (fetch wrapper: base URL, bearer token, JSON, error envelope),
`src/api/endpoints.ts` (one typed function per endpoint), `src/store/` (slices for
board, nodes, edges, annotations, files, chat, session), `src/types.ts`.
Tests under `src/api/__tests__/` and `src/store/__tests__/`.

## Acceptance
- Given any endpoint call, when it returns a non-2xx, then the client throws a typed error carrying `code`, `message` and `field` from the response envelope, and never a bare `Error`.
- Given a 401 `invalid_token`, when any request returns it, then the session is cleared once and the app routes to `/signin` — concurrent 401s must not stack redirects.
- Given a mutation, when it settles, then the cache reflects the server's returned object rather than the optimistic guess.
- Given a mutation that fails, when the error surfaces, then the cache is unchanged and the failure is reported to the caller.
- Given a board load, when it resolves, then nodes, edges, annotations, files, strokes, marks, pins and viewport are all populated.
- Given a viewport change, when it is written, then `PATCH /board` is debounced to at most one request per 500ms.
- Given any mutation, when undo is invoked, then the prior state is restored and the history holds at least 50 entries.

## Guardrails
No React imports in this layer. No UI. No `localStorage` for anything except the
session token and the theme override — the API is the system of record.
Never construct a request URL by string concatenation of user input.

## Verify
`npm run typecheck && npx vitest run src/api src/store`
