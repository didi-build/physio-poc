# DIDI-1167 mutation table (program builder dose box)

Verified at branch head `106ad99b4b5c7364c7295d6dc14078744cbc8829` (full `npm test` per mutant, then restore sources from `.bak` copies).

| Id  | Mutant                                                                                               | Killing test(s)                                                                                                                                                                     | Result |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D1  | `toBuilderRow`: `params_source` always `null` instead of `paramsMatchResolved ? paramsSource : null` | `program-builder-service.test.ts` > adds rows with param precedence: exercise override, type defaults, global                                                                       | Killed |
| D2  | `toBuilderRow`: `paramsMatchResolved` forced false                                                   | `program-builder-service.test.ts` > adds rows with param precedence: exercise override, type defaults, global                                                                       | Killed |
| D3  | `ProgramBuilderRowCard`: `doseEdited` forced false                                                   | `programs-builder-actions.test.tsx` > Program builder dose box (DIDI-1167) > saves edited params via auto-save and shows amber edited state when stored params differ from defaults | Killed |
| D4  | `exerciseParamsEqual`: return `true` immediately                                                     | `program-builder-service-from-routine.test.ts` > copies three pinned routine rows with full field fidelity for community and My copy sources                                        | Killed |

**Totals:** 4 Killed, 0 Survived, 0 Equivalent across 4 full-suite runs (`npm test`).
