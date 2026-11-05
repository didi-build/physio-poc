# DIDI-1162 mutation table (consent env-switch and REPLACE write counter)

Verified on branch head `ecd27707e8e0af551f930fc958b5790b345b99d0` (full `npm test` per mutant, then `git checkout --` on the touched production or helper file).

| Id  | Mutant                                                                  | Killing test(s)                                                                                                                                                                                                    | Result |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Q10 | `process.env.PHYSIO_TRACE_SQL` read on its own line in the node adapter | `node-wrap-sql-port.test.ts` > does not read process.env anywhere in create-node-app-dependencies (Q10)                                                                                                            | Killed |
| Q11 | `env.PHYSIO_SQL_WRAP === "passthrough"` skips `wrapSqlPort`             | `node-wrap-sql-port.test.ts` > wires wrapSqlPort only through the DI default and sqlPort assignment; `node-wrap-sql-port.test.ts` > always applies wrapSqlPort to deps.sql even when env would skip wrapping (Q11) | Killed |
| Q12 | Drop `REPLACE` from `isWriteSql` in the counting wrapper                | `counting-sql-storage.test.ts` > increments sqlWriteCallCount on REPLACE run statements (Q12); `counting-sql-storage.test.ts` > increments sqlWriteCallCount on REPLACE in batch statements (Q12)                  | Killed |

Totals: 3 mutants run, 3 killed, 0 survived, 0 equivalent.

Full-suite evidence (each mutant alone): 1875/1880 or 1874/1880 tests passed with 1 or 2 failures in the killing file(s) above; exit code 1.
