# Web UI (`src/ui/`)

Physio web app shell and screens (React with Vite).

- Layout breakpoints follow [`design/README.md`](../../design/README.md): mobile first at **390 px**; desktop mockups at **1280 px** (top nav from **1024 px**).
- Nav and account copy live in [`copy/nav.ts`](copy/nav.ts) from `design/README.md` Shared layout.
- UI components call `src/ui/api/exercise-library-client.ts` for exercise library HTTP; other use cases call `src/services/` when added. They do not import storage adapters or platform entry modules.

- UI stack: **React with Vite** (ADR 0004 item 6), built to static assets served by the same entry.
