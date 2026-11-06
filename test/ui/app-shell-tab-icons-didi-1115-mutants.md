# DIDI-1115 phone tab bar icon mutants

Branch head at generation: `104b782b63f53f70e348eb5e681e55c013efc993`. Temp dir: `TMPDIR=/tmp/didi-1115-tmp`. Each mutant was applied alone on production or test sources, then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Touched paths were restored with `git checkout HEAD --` before the next row.

| ID      | Mutant                                                                   | Verdict | Killing test(s)                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1115-1 | Remove `ShellTabIcon` from phone tabs (`ShellNav.tsx`)                   | Killed  | `app shell nav (integration) > renders an approved mock icon in each phone tab link`; `maps each phone tab to its own icon path`; `uses heavier stroke on the active phone tab icon` |
| M1115-2 | Use `SHELL_TAB_ICON_PATH_ROUTINES` on the Exercises tab (`ShellNav.tsx`) | Killed  | `renders an approved mock icon in each phone tab link`; `maps each phone tab to its own icon path`                                                                                   |
| M1115-3 | Force `strokeWidth={1.8}` for active icons (`ShellTabIcon.tsx`)          | Killed  | `uses heavier stroke on the active phone tab icon`                                                                                                                                   |
| M1115-4 | Render dummy path `M0 0h1v1H0z` in `ShellTabIcon.tsx`                    | Killed  | `renders an approved mock icon in each phone tab link`; `maps each phone tab to its own icon path`                                                                                   |
| M1115-5 | Remove `aria-hidden` from `.shell-tab-icon-wrap` (`ShellNav.tsx`)        | Killed  | `renders an approved mock icon in each phone tab link`                                                                                                                               |
| M1115-6 | Delete `@media (prefers-color-scheme: dark)` tab bar block (`shell.css`) | Killed  | `styles the phone tab bar for dark mode in shell.css`                                                                                                                                |

**Totals:** 6 mutants run against the full suite, **6 killed**, **0 equivalent**, **0 survived**.

Log: `/tmp/didi-1115-tmp/mutant-log.txt`
