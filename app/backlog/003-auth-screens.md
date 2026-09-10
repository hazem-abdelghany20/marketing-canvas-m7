# Build the sign-in and sign-up screens

## Context
- `docs/spec.md` § S1 — Sign in
- `docs/spec.md` § S2 — Sign up
- `docs/state-matrix.md` § S1, § S2

## Scope
`src/routes/SignIn.tsx`, `src/routes/SignUp.tsx`, `src/components/AuthCard.tsx`,
`src/components/Field.tsx`, `src/auth/mockAuth.ts`, `src/App.tsx` (routes only).

## Acceptance
- Given a signed-out visitor, when `/signin` loads, then the email field holds keyboard focus.
- Given an email without `@`, when the form is submitted, then submission is blocked and an inline error names the email field.
- Given a password and a non-matching confirmation on `/signup`, when submitted, then submission is blocked and an inline error names the confirmation field.
- Given `taken@example.com` on `/signup`, when submitted, then a form-level error states the address is registered and all non-password values are retained.
- While a submission is pending, every field and the submit button shall be non-interactive.
- Given an existing session, when `/signin` is visited, then the app redirects to `/`.

## Guardrails
Mock auth only — no network calls. Passwords are never written to storage or logged.
Tokens only, no raw color.

## Verify
`npx vitest run src/routes && npx playwright test e2e/auth.spec.ts`
