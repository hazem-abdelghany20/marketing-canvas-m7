# State matrix

Every screen and overlay from `spec.md` § Screen inventory × six states.
**No cell is blank.** `n/a` is a deliberate answer with a reason.

Error copy always says what failed **and** what to do.

---

## S1 — Sign in

| State | Behavior |
|---|---|
| **Loading** | Session check runs before first paint. Full-page skeleton of the card (logo block, two field bars, button bar) — never a flash of the form followed by a redirect. |
| **Empty** | The default state. Both fields blank, submit enabled, no errors shown. Not an error condition. |
| **Error** | *Field:* "Enter a valid email address." / "Password must be at least 8 characters." Inline, below the field, red, with `aria-describedby`. *Form:* "We couldn't sign you in. Check your email and password, then try again." Both values retained. *Network:* "Couldn't reach the server. Check your connection and try again." with a Retry button. |
| **Success** | Button shows a check for 200ms, then navigate to `/`. No success toast — the destination is the confirmation. |
| **Disabled** | Submit disabled while pending, labelled "Signing in…". Fields remain readable but non-editable during pending. |
| **Permissions** | Already-authenticated visitor is redirected to `/` before paint. No permission tiers exist in a single-actor app. |

## S2 — Sign up

| State | Behavior |
|---|---|
| **Loading** | Same pre-paint session check and skeleton as S1. |
| **Empty** | Default. Four blank fields. The password rule ("at least 8 characters") is shown as guidance from the start, in muted text — not as an error. |
| **Error** | *Field:* per-field messages naming the rule broken; confirm-mismatch reads "Passwords don't match." *Form:* "That email is already registered. Sign in instead, or use a different address." with an inline link to S1. All values except the passwords retained. |
| **Success** | Session + empty board created, navigate to `/`, which renders its first-run empty state. |
| **Disabled** | All fields and the submit button non-interactive while pending; submit reads "Creating…". |
| **Permissions** | Authenticated visitor redirected to `/`. n/a beyond that — single actor. |

## S3 — Workspace (shell)

| State | Behavior |
|---|---|
| **Loading** | Board hydrating from storage: canvas shows a dimmed grid with a centered spinner; toolbar rendered but disabled; chat rail renders its own skeleton (3 message placeholders). No layout shift when data lands. |
| **Empty** | Zero nodes: centered first-run panel — "Nothing on the canvas yet." + "Add your first node" (opens O1) + one line naming the six types. Legend hidden until at least one node exists. Fit and Auto-arrange disabled. |
| **Error** | *Corrupt/unreadable stored board:* full-canvas message — "We couldn't read your saved board. Your data is still on this device; reload to try again, or start a new board." with Reload and Start new. *Storage quota exceeded on write:* toast — "Couldn't save — this device is out of storage. Free up space; your last change is not saved." The unsaved change stays on screen. |
| **Success** | Nodes and edges render, viewport restored to its saved x/y/zoom. Mutations confirm through the artifact itself (node appears, edge draws) plus a toast only when the action is undoable. |
| **Disabled** | Fit + Auto-arrange disabled at zero nodes. Connect disabled at fewer than two nodes. Undo disabled with an empty history. Zoom-in disabled at 2×, zoom-out at 0.25×. All disabled controls keep tooltips explaining why. |
| **Permissions** | Unauthenticated visitor redirected to `/signin`. n/a otherwise — single actor, no per-node access. |

## O1 — Add-node menu

| State | Behavior |
|---|---|
| **Loading** | n/a — opens from local state, nothing to fetch. |
| **Empty** | n/a — the menu always has its three fixed options. |
| **Error** | Node creation failing on write: menu closes, toast — "Couldn't add the node. Your board is out of storage on this device." No half-created node is left on canvas. |
| **Success** | Menu closes, node appears at viewport center with a 150ms entrance, S4 opens with the title focused. |
| **Disabled** | "From chat" disabled while a chat response is streaming; tooltip — "Wait for the current reply to finish." |
| **Permissions** | n/a — single actor. |

## O2 — File import

| State | Behavior |
|---|---|
| **Loading** | Per-file progress on each pending asset node (indeterminate bar over the card) while the object URL is created and a thumbnail is generated. |
| **Empty** | Drop with zero valid files: no node created, toast — "No supported files in that drop. Images, PDFs, text and Office files are supported." |
| **Error** | *Unsupported type:* "`{name}` isn't a supported file type. Supported: images, PDF, text, Office." *Too large:* "`{name}` is {size} — the limit is 25MB." *Read failure:* "Couldn't read `{name}`. Try adding it again." In a multi-file drop, valid files still import; the toast lists each rejection by filename. |
| **Success** | One asset node per file, laid out in a row from the drop point, each showing name + thumbnail + size. |
| **Disabled** | Drop target inactive while connect mode is on; the canvas shows no drop outline. |
| **Permissions** | n/a — single actor, local files only. |

## O3 — Connect mode

| State | Behavior |
|---|---|
| **Loading** | n/a — purely local; edge creation is synchronous. |
| **Empty** | Entered with fewer than two nodes: mode does not activate; toast — "Add another node first — connections need two." |
| **Error** | *Self-connection:* "A node can't connect to itself." *Duplicate:* "These nodes are already connected." *Target removed mid-flow:* mode resets to source-picking, toast — "That node was removed. Pick another target." No edge is created in any case. |
| **Success** | Edge draws with a 200ms animation, both endpoints flash once, mode exits, the new edge is listed on both nodes' detail panels. |
| **Disabled** | The kind picker's `serves` option is disabled when the direction would duplicate an existing `serves` edge; tooltip names the existing connection. |
| **Permissions** | n/a — single actor. |

## O4 — Node quick-peek

| State | Behavior |
|---|---|
| **Loading** | n/a — reads already-loaded node state. |
| **Empty** | Node with no body: excerpt area shows "No description yet" in muted text; Open still works. |
| **Error** | Referenced node missing from the store: peek dismisses itself silently and selection clears — a stale selection is not an error worth interrupting for. |
| **Success** | Card renders adjacent to the node, flipping side when it would leave the viewport. |
| **Disabled** | "Connect from here" disabled when it is the only node; tooltip — "Add another node to connect to." |
| **Permissions** | n/a — single actor. |

## O5 — Search / jump-to-node

| State | Behavior |
|---|---|
| **Loading** | n/a — filtering is synchronous over in-memory nodes. |
| **Empty** | *No query:* results area shows the 5 most recently updated nodes under "Recent". *No matches:* "No nodes match "{query}"." plus "Create a note with this title" as an action. |
| **Error** | n/a — a local string filter has no failure mode. Kept explicitly so the absence is a decision, not an oversight. |
| **Success** | Enter pans and zooms to the node (400ms, instant under reduced-motion), selects it, closes the overlay. |
| **Disabled** | Search disabled at zero nodes; the toolbar button's tooltip — "Nothing to search yet." |
| **Permissions** | n/a — single actor. |

## O6 — Chat rail

| State | Behavior |
|---|---|
| **Loading** | Streaming assistant message shows a caret and appends text; a 3-dot indicator shows before the first token arrives. |
| **Empty** | No messages: rail shows a short prompt — "Ask about your canvas, or ask me to draft something." plus three example prompts, one per mode, each clickable to prefill the composer. |
| **Error** | Mock failure: assistant bubble turns to an error state — "That reply didn't finish. Try again." with a Retry button. The user's message is retained and the composer is re-enabled. *Proposal apply fails:* toast — "Couldn't add that to the canvas. Your board is out of storage on this device." and the button returns to its actionable state. |
| **Success** | Message completes, citations render as chips, proposals render an action button, cited nodes highlight on the canvas. |
| **Disabled** | Composer and send disabled while streaming. `[Add to canvas]` becomes a non-interactive "Added" after a successful apply. Rail collapse control never disabled. |
| **Permissions** | n/a — single actor, mocked model. |

## S4 — Node detail

| State | Behavior |
|---|---|
| **Loading** | Deep-link to `/node/:id` before hydration: panel skeleton (title bar, body block, three section headers) with the canvas dimmed behind it. |
| **Empty** | *No body:* placeholder — "Add a description." *No files:* "No files attached" + Attach. *No connections:* "Not connected to anything yet" + Connect — the highest-value empty state in the app, since an unconnected node defeats the purpose. *No annotations:* "No notes yet." |
| **Error** | *Node not found (`/node/:id` with a bad or deleted id):* panel shows "That node doesn't exist. It may have been deleted." + Back to canvas — never the same message as a save failure. *Autosave failure:* inline banner at the panel top — "Changes aren't saving — this device is out of storage. Your text is still here; free up space and edit again." Edits stay in the fields. *Missing blob after reload:* file row reads "File not available after reload" + Re-attach. |
| **Success** | Autosave shows a brief "Saved" that fades; edits reflect on the canvas card immediately. |
| **Disabled** | Type picker disabled while an autosave is in flight. Remove-connection disabled during connect mode. Annotation submit disabled while the input is empty or whitespace only. |
| **Permissions** | Unauthenticated deep-link redirects to `/signin` and returns to `/node/:id` after signing in. n/a beyond that — single actor. |
