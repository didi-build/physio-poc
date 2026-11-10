import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import type {
  ProgramBuilderView,
  ProgramMutationResult,
  ProgramOriginFilter,
  ProgramSearchResult,
} from "../../services/programs/types.js";
import type { ProgramListItem } from "../../services/programs/types.js";
import type {
  ProgramPublishResult,
  ProgramShareConnectorView,
} from "../../services/programs/program-publish-service.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { type ReadRequestOptions, readGetInit } from "./read-request-options.js";
import {
  PROGRAMS_API_BASE,
  programPath,
  programPublishPath,
  programShareLinkPath,
  programRestorePath,
  programRowDuplicatePath,
  programRowLibraryUpdateApplyPath,
  programRowLibraryUpdateKeepPath,
  programRowPath,
  programRowsPath,
  programRowsReorderPath,
  programByCodePath,
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

export class ProgramsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProgramsApiError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ProgramsApiError(
      body.error ?? "request_failed",
      body.message ?? `Request failed (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

export class ProgramsClient {
  private readonly fetchFn: FetchFn;

  constructor(options: ProgramsClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  listPrograms(
    searchQuery?: string,
    originFilter: ProgramOriginFilter = "all",
    options?: ReadRequestOptions,
  ): Promise<ProgramSearchResult> {
    const path = programsCollectionPath(searchQuery, originFilter);
    return this.fetchFn(path, readGetInit(options)).then((response) =>
      readJson<ProgramSearchResult>(response),
    );
  }

  getProgramByCode(
    programCode: string,
    options?: ReadRequestOptions,
  ): Promise<ProgramBuilderView> {
    return this.fetchFn(programByCodePath(programCode), readGetInit(options)).then(
      (response) => readJson<ProgramBuilderView>(response),
    );
  }

  listDeletedPrograms(
    options?: ReadRequestOptions,
  ): Promise<{ items: ProgramListItem[] }> {
    return this.fetchFn(programsDeletedListPath(), readGetInit(options)).then(
      (response) => readJson<{ items: ProgramListItem[] }>(response),
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

  getProgram(
    programId: string,
    options?: ReadRequestOptions,
  ): Promise<ProgramBuilderView> {
    return this.fetchFn(programPath(programId), readGetInit(options)).then((response) =>
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
      exercise_version_id?: string;
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

  getShareLink(
    programId: string,
    options?: ReadRequestOptions,
  ): Promise<ProgramShareConnectorView> {
    return this.fetchFn(programShareLinkPath(programId), readGetInit(options)).then(
      (response) => readJson<ProgramShareConnectorView>(response),
    );
  }

  publishProgram(
    programId: string,
    input: {
      expires_in?: ShareLinkExpiresIn;
      custom_expires_on?: string | null;
    } = {},
  ): Promise<ProgramPublishResult> {
    return this.fetchFn(
      programPublishPath(programId),
      withJsonContentType({
        method: "POST",
        body: JSON.stringify({
          ...(input.expires_in ? { expires_in: input.expires_in } : {}),
          ...(input.custom_expires_on !== undefined
            ? { custom_expires_on: input.custom_expires_on }
            : {}),
        }),
      }),
    ).then((response) => readJson<ProgramPublishResult>(response));
  }

  setShareLinkExpiry(
    programId: string,
    input: {
      expires_in: ShareLinkExpiresIn;
      custom_expires_on?: string | null;
    },
  ): Promise<ProgramShareConnectorView> {
    return this.fetchFn(
      programShareLinkPath(programId),
      withJsonContentType({
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    ).then((response) => readJson<ProgramShareConnectorView>(response));
  }

  closeShareLink(programId: string): Promise<ProgramShareConnectorView> {
    return this.fetchFn(
      programShareLinkPath(programId),
      withJsonContentType({
        method: "DELETE",
        body: "{}",
      }),
    ).then((response) => readJson<ProgramShareConnectorView>(response));
  }
}

let defaultClient: ProgramsClient | null = null;

export function getProgramsClient(): ProgramsClient {
  defaultClient ??= new ProgramsClient();
  return defaultClient;
}
