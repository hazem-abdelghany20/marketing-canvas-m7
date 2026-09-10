# Build the sign-in and sign-up screens

## Context
- `docs/spec.md` § S1 — Sign in
- `docs/spec.md` § S2 — Sign up
- `docs/state-matrix.md` § S1, § S2
- `../../api/README.md` § Auth

## Scope
`src/routes/SignIn.tsx`, `src/routes/SignUp.tsx`, `src/components/AuthCard.tsx`,
`src/components/Field.tsx`, `src/auth/session.ts`, `src/App.tsx` (routes only).

## Acceptance
- Given a signed-out visitor, when `/signin` loads, then the email field holds keyboard focus.
- Given an email without `@`, when the form is submitted, then submission is blocked client-side and an inline error names the email field — without a request.
- Given credentials the API rejects with `bad_credentials`, when submission returns, then both values are retained, a form-level error renders, and the submit button is interactive again.
- Given `taken@example.com` on the sign-up form, when submitted, then the `email_taken` error renders with an inline link to sign in.
- Given a successful login, when the token returns, then it is stored, and every subsequent request carries it as `Authorization: Bearer <token>`.
- Given a successful sign-up, when it returns, then the app lands on `/` and renders the first-run empty state, because a new board has zero nodes.
- Given an existing session, when `/signin` is visited, then the app redirects to `/` before first paint.
- While a submission is pending, the submit button shall be disabled and labelled `Signing in…` / `Creating…`.

## Guardrails
Passwords are never persisted and never logged.
Field-level validation runs client-side first; the API's codes drive form-level errors only.
Error copy comes from the state matrix, not from the raw API `message`, except where the
matrix explicitly defers to it.

## Verify
`npm run typecheck && npx vitest run src/routes src/auth`
