# Web UI (`src/ui/`)

Future implementation of the Physio web app shell and screens.

- Layout breakpoints follow [`design/README.md`](../../design/README.md): mobile first at **390 px**; desktop mockups at **1280 px**.
- Nav and copy come from feature specs under `design/app/` (no new user-facing strings in code until UI tickets).
- UI components call `src/services/` only; they do not import storage adapters or platform entry modules.

DIDI-996 does not add screens or a UI framework choice here.
