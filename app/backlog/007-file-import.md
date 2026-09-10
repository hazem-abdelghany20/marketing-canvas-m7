# Import files as asset nodes

## Context
- `docs/spec.md` § S3 — Behavior/O2
- `docs/state-matrix.md` § O2 — File import

## Scope
`src/components/FileDropZone.tsx`, `src/files/importFiles.ts`,
`src/store/files.ts`, `src/components/NodeCard.tsx` (asset variant only).

## Acceptance
- Given a supported file dropped on the canvas, when the drop settles, then one asset node is created at the drop point showing the file name, size and a thumbnail where the type allows.
- Given three files dropped at once, when the drop settles, then three asset nodes are created in a row.
- Given a drop mixing one valid and one unsupported file, when it settles, then the valid file becomes a node and a message names the rejected file and the supported types.
- Given a file over 25MB, when dropped, then no node is created for it and a message names the file and the limit.
- Given a drop containing zero supported files, when it settles, then no node is created and a message lists the supported types.
- While a file is being read, its node shall show a progress indicator.
- While connect mode is active, the canvas shall not show a drop target.

## Guardrails
Object URLs only — no upload, no network. Files stay on device.
Do not change node creation behavior from ticket 006.

## Verify
`npx vitest run src/files && npx playwright test e2e/file-import.spec.ts`
