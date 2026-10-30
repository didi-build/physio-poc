# Program builder service mutation guard coverage

Each guard in `program-builder-service.ts` (and related repository filters exercised here) should fail the listed test if removed.

| Guard                                                            | Killing test                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `requirePractitioner` opaque id                                  | (opaque validation on practitioner id via create with unknown id still runs parse first; practitioner guard test) |
| `requirePractitioner` row exists                                 | `ProgramBuilderService practitioner guard` rejects unknown well-formed id                                         |
| `requireOwnedProgram` `created_by`                               | cross-practitioner forbidden table                                                                                |
| `requireOwnedProgram` deleted without allowDeleted               | getProgram on deleted without allow (delete flow)                                                                 |
| `requireOwnedRow` `program_id` match                             | row isolation (when added) / updateRow with wrong program row                                                     |
| `parsePlaceholderPrescriptionType` required                      | requires prescriptionType with specific message                                                                   |
| `parsePrescriptionTypeLiteral`                                   | rejects invalid prescriptionType literal                                                                          |
| `assertExerciseRequestOwnedByPractitioner`                       | treats another practitioner's request like missing                                                                |
| `assertExerciseRequestOpenForPlaceholder`                        | rejects approved/withdrawn attach                                                                                 |
| `addExerciseRow` version exercise_id match                       | addExerciseRow version versus exercise (when present)                                                             |
| `linkApprovedPlaceholders` request/version exercise match        | rejects approvedVersionId when different exercise                                                                 |
| `linkApprovedPlaceholders` skip incompatible type (CTO f23ec081) | skips incompatible prescription types and returns skipped count                                                   |
| `resolvePlaceholderParams` practitioner defaults                 | uses practitioner My type defaults for placeholder rows                                                           |
| `restoreProgram` uses `this.now()` only                          | restores at exactly 30 days boundary                                                                              |
| duplicate row id SQLite mapping                                  | program row id already in use (when present)                                                                      |
| `ProgramsRepository.listForPractitioner` created_by              | listPrograms excludes other practitioner (when present)                                                           |
