import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import type {
  ProgramBuilderView,
  ProgramMutationResult,
  ProgramSearchResult,
} from "../../services/programs/types.js";
import type { ProgramListItem } from "../../services/programs/types.js";
import {
  PROGRAMS_API_BASE,
  programPath,
  programRestorePath,
  programRowDuplicatePath,
  programRowLibraryUpdateApplyPath,
  programRowLibraryUpdateKeepPath,
  programRowPath,
  programRowsPath,
  programRowsReorderPath,
  programsCollectionPath,
  programsDeletedListPath,
} from "../../programs-api-paths.js";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ProgramsClientOptions = {
  fetchFn?: FetchFn;
};

const JSON_CONTENT_TYPE = "application/json";

function withJsonContentType(init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", JSON_CONTENT_TYPE);
  }
  return { ...init, headers };
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export class ProgramsClient {
  private readonly fetchFn: FetchFn;

  constructor(options: ProgramsClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  listPrograms(searchQuery?: string): Promise<ProgramSearchResult> {
    const path = programsCollectionPath(searchQuery);
    return this.fetchFn(path, { method: "GET" }).then((response) =>
      readJson<ProgramSearchResult>(response),
    );
  }

  listDeletedPrograms(): Promise<{ items: ProgramListItem[] }> {
    return this.fetchFn(programsDeletedListPath(), { method: "GET" }).then((response) =>
      readJson<{ items: ProgramListItem[] }>(response),
    );
  }

  createProgram(input: {
    program_id: string;
    name?: string | null;
  }): Promise<ProgramMutationResult> {
    return this.fetchFn(
      PROGRAMS_API_BASE,
      withJsonContentType({
        method: "POST",
        body: JSON.stringify({
          program_id: input.program_id,
          ...(input.name !== undefined ? { name: input.name } : {}),
        }),
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  getProgram(programId: string): Promise<ProgramBuilderView> {
    return this.fetchFn(programPath(programId), { method: "GET" }).then((response) =>
      readJson<ProgramBuilderView>(response),
    );
  }

  updateProgramName(
    programId: string,
    name: string | null,
  ): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programPath(programId),
      withJsonContentType({
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  deleteProgram(programId: string): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programPath(programId),
      withJsonContentType({
        method: "DELETE",
        body: "{}",
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  restoreProgram(programId: string): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRestorePath(programId),
      withJsonContentType({
        method: "POST",
        body: "{}",
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  addExerciseRow(
    programId: string,
    body: {
      row_id: string;
      exercise_id: string;
      exercise_version_id?: string;
      prescription_type?: PrescriptionType;
      params?: ExerciseParams;
      note?: string | null;
    },
  ): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRowsPath(programId),
      withJsonContentType({
        method: "POST",
        body: JSON.stringify(body),
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  addPlaceholderRow(
    programId: string,
    body: {
      row_id: string;
      exercise_request_id: string;
      prescription_type: PrescriptionType;
      params?: ExerciseParams;
      note?: string | null;
    },
  ): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRowsPath(programId),
      withJsonContentType({
        method: "POST",
        body: JSON.stringify(body),
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  updateRow(
    programId: string,
    rowId: string,
    body: {
      prescription_type?: PrescriptionType;
      params?: ExerciseParams;
      note?: string | null;
    },
  ): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRowPath(programId, rowId),
      withJsonContentType({
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  deleteRow(programId: string, rowId: string): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRowPath(programId, rowId),
      withJsonContentType({
        method: "DELETE",
        body: "{}",
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  reorderRows(
    programId: string,
    orderedRowIds: readonly string[],
  ): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRowsReorderPath(programId),
      withJsonContentType({
        method: "PATCH",
        body: JSON.stringify({ ordered_row_ids: [...orderedRowIds] }),
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  duplicateRow(
    programId: string,
    rowId: string,
    newRowId: string,
  ): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRowDuplicatePath(programId, rowId),
      withJsonContentType({
        method: "POST",
        body: JSON.stringify({ new_row_id: newRowId }),
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  applyLibraryUpdate(programId: string, rowId: string): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRowLibraryUpdateApplyPath(programId, rowId),
      withJsonContentType({
        method: "POST",
        body: "{}",
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }

  keepLibraryUpdate(programId: string, rowId: string): Promise<ProgramMutationResult> {
    return this.fetchFn(
      programRowLibraryUpdateKeepPath(programId, rowId),
      withJsonContentType({
        method: "POST",
        body: "{}",
      }),
    ).then((response) => readJson<ProgramMutationResult>(response));
  }
}

let defaultClient: ProgramsClient | null = null;

export function getProgramsClient(): ProgramsClient {
  defaultClient ??= new ProgramsClient();
  return defaultClient;
}
