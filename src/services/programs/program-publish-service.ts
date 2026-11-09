import {
  FreeTextValidationError,
  validateProgramName,
} from "../../domain/exercise-free-text.js";
import {
  OpaqueEntityIdValidationError,
  generateOpaqueEntityId,
  validateOpaqueEntityId,
} from "../../domain/opaque-entity-id.js";
import {
  ShareLinkExpiryValidationError,
  validateShareLinkExpiryChoice,
  type ShareLinkExpiryChoice,
} from "../../domain/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import {
  inferGetProgramDisplayState,
  type ProgramVersionRef,
} from "../../mcp-connector/get-program-contract.js";
import {
  PROGRAM_PUBLISH_NAME_REQUIRED,
  PUBLIC_LINK_CLOSED_HEADING,
  PUBLIC_LINK_EXPIRY_NEVER,
  publicLinkExpiryUntilDateLine,
} from "../../copy/programs-share.js";
import { buildPublicShareLinkUrl } from "../../app-routes.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
  ProgramRepositoryError,
  ProgramsRepository,
  ShareLinksRepository,
  type ProgramRecord,
  type ShareLinkRecord,
} from "../../storage/repositories/programs.js";
import { PractitionersRepository } from "../../storage/repositories/exercise-data.js";
import {
  ProgramBuilderService,
  computeShareLinkStatus,
} from "./program-builder-service.js";
import type { ProgramBuilderView, ShareLinkStatus } from "./types.js";
import type { GetProgramDisplayState } from "../../mcp-connector/get-program-contract.js";
import type { PublishedProgramSnapshot } from "../../domain/program-types.js";
import { formatShareLinkExpiryDisplayDate } from "../../copy/programs-share.js";

export class ProgramPublishServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "practitioner_not_found"
      | "program_not_found"
      | "name_required"
      | "placeholders_block_publish"
      | "invalid_input",
  ) {
    super(message);
    this.name = "ProgramPublishServiceError";
  }
}

export type ProgramPublishResult = {
  program: ProgramBuilderView;
  share_link: string;
  published_at: string;
  display_state: GetProgramDisplayState;
  draft: ProgramVersionRef | null;
  published: ProgramVersionRef | null;
  expires_at: string | null;
};

export type ProgramShareConnectorView = {
  display_state: GetProgramDisplayState;
  share_link: string;
  share_link_status: ShareLinkStatus;
  expires_at: string | null;
  open_share_link: boolean;
  draft: ProgramVersionRef | null;
  published: ProgramVersionRef | null;
  program_code: string;
};

export type PublicShareLinkOpenRow = {
  position: number;
  title: string;
  prescription_type: PublishedProgramSnapshot["rows"][number]["prescriptionType"];
  params: PublishedProgramSnapshot["rows"][number]["params"];
  note: string | null;
};

export type PublicShareLinkOpenView = {
  availability: "open";
  program_name: string;
  published_at: string;
  expiry_line: string;
  rows: PublicShareLinkOpenRow[];
};

export type PublicShareLinkUnavailableView = {
  availability: "unavailable";
  heading: typeof PUBLIC_LINK_CLOSED_HEADING;
};

export const PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW: PublicShareLinkUnavailableView = {
  availability: "unavailable",
  heading: PUBLIC_LINK_CLOSED_HEADING,
};

export const PUBLIC_SHARE_LINK_UNAVAILABLE_BODY = JSON.stringify(
  PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW,
);

export type PublicShareLinkView =
  PublicShareLinkOpenView | PublicShareLinkUnavailableView;

function draftVersionRef(program: ProgramRecord): ProgramVersionRef {
  return {
    version: program.draft_version,
    updated_at: program.draft_updated_at,
  };
}

function publishedVersionRef(program: ProgramRecord): ProgramVersionRef | null {
  if (program.published_version === null || !program.published_at) {
    return null;
  }
  return {
    version: program.published_version,
    updated_at: program.published_at,
  };
}

function linkIsExpired(link: ShareLinkRecord, requestTime: Date): boolean {
  if (link.expires_at === null) {
    return false;
  }
  const expiresMs = Date.parse(link.expires_at);
  return !Number.isNaN(expiresMs) && expiresMs <= requestTime.getTime();
}

function unavailableView(): PublicShareLinkUnavailableView {
  return PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW;
}

export class ProgramPublishService {
  private readonly programs: ProgramsRepository;
  private readonly links: ShareLinksRepository;
  private readonly practitioners: PractitionersRepository;
  private readonly builder: ProgramBuilderService;

  constructor(
    private readonly sql: SqlStoragePort,
    private readonly webAppBaseUrl: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.programs = new ProgramsRepository(sql);
    this.links = new ShareLinksRepository(sql);
    this.practitioners = new PractitionersRepository(sql);
    this.builder = new ProgramBuilderService(sql, now);
  }

  async publishProgram(
    practitionerId: string,
    programId: string,
    options: { linkExpiry?: ShareLinkExpiryChoice } = {},
  ): Promise<ProgramPublishResult> {
    await this.requirePractitioner(practitionerId);
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    const program = await this.requireOwnedProgram(practitionerId, validatedProgramId);

    let validatedLinkExpiry: ShareLinkExpiryChoice | undefined;
    if (options.linkExpiry) {
      try {
        validatedLinkExpiry = validateShareLinkExpiryChoice(
          options.linkExpiry,
          new Date(this.now()),
        );
      } catch (err) {
        if (err instanceof ShareLinkExpiryValidationError) {
          throw new ProgramPublishServiceError(err.message, "invalid_input");
        }
        throw err;
      }
    }

    try {
      validateProgramName(program.name ?? "");
    } catch (err) {
      if (err instanceof FreeTextValidationError) {
        throw new ProgramPublishServiceError(
          PROGRAM_PUBLISH_NAME_REQUIRED,
          "name_required",
        );
      }
      throw err;
    }

    const placeholderRows = await this.sql.first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM program_rows
       WHERE program_id = ? AND exercise_request_id IS NOT NULL`,
      [validatedProgramId],
    );
    if ((placeholderRows?.c ?? 0) > 0) {
      throw new ProgramPublishServiceError(
        PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
        "placeholders_block_publish",
      );
    }

    const publishedAt = this.now();
    if (validatedLinkExpiry) {
      await this.programs.setLinkExpiry(
        validatedProgramId,
        validatedLinkExpiry,
        new Date(publishedAt),
      );
    }
    try {
      await this.programs.publish(validatedProgramId, publishedAt);
    } catch (err) {
      this.mapPublishRepositoryError(err);
    }

    let openLink = await this.links.findOpenByProgramId(validatedProgramId);
    if (!openLink) {
      openLink = await this.links.createOpenLinkForProgram({
        id: generateOpaqueEntityId(),
        programId: validatedProgramId,
        practitionerId,
        createdAt: publishedAt,
        now: new Date(publishedAt),
      });
    }

    const refreshed = await this.programs.findById(validatedProgramId);
    if (!refreshed) {
      throw new ProgramPublishServiceError("Program not found", "program_not_found");
    }

    const programView = await this.builder.getProgram(
      practitionerId,
      validatedProgramId,
    );
    const draft = draftVersionRef(refreshed);
    const published = publishedVersionRef(refreshed);
    return {
      program: programView,
      share_link: buildPublicShareLinkUrl(this.webAppBaseUrl, openLink.token),
      published_at: publishedAt,
      display_state: inferGetProgramDisplayState(draft, published),
      draft,
      published,
      expires_at: openLink.expires_at,
    };
  }

  async setProgramLinkExpiry(
    practitionerId: string,
    programId: string,
    choice: ShareLinkExpiryChoice,
  ): Promise<ProgramShareConnectorView> {
    await this.requirePractitioner(practitionerId);
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    await this.applyLinkExpiry(validatedProgramId, choice);
    return this.getShareConnectorView(practitionerId, validatedProgramId);
  }

  async closeShareLink(
    practitionerId: string,
    programId: string,
  ): Promise<ProgramShareConnectorView> {
    await this.requirePractitioner(practitionerId);
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    await this.links.closeOpenLinksForProgram(validatedProgramId, this.now());
    return this.getShareConnectorView(practitionerId, validatedProgramId);
  }

  async getShareConnectorView(
    practitionerId: string,
    programId: string,
  ): Promise<ProgramShareConnectorView> {
    await this.requirePractitioner(practitionerId);
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    const program = await this.requireOwnedProgram(practitionerId, validatedProgramId);
    const openLink = await this.links.findOpenByProgramId(validatedProgramId);
    const latestLink = await this.links.findLatestByProgramId(validatedProgramId);
    const draft = draftVersionRef(program);
    const published = publishedVersionRef(program);
    const shareLinkStatus = computeShareLinkStatus({
      latestLink,
      requestTimeIso: this.now(),
    });
    const shareLink =
      openLink && shareLinkStatus === "open"
        ? buildPublicShareLinkUrl(this.webAppBaseUrl, openLink.token)
        : "";
    return {
      display_state: inferGetProgramDisplayState(draft, published),
      share_link: shareLink,
      share_link_status: shareLinkStatus,
      expires_at: openLink?.expires_at ?? null,
      open_share_link: openLink !== null && shareLinkStatus === "open",
      draft,
      published,
      program_code: program.code,
    };
  }

  async getPublicShareLinkByToken(
    token: string,
    requestTime: Date = new Date(),
  ): Promise<PublicShareLinkView> {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      return unavailableView();
    }
    const link = await this.links.findByToken(trimmed);
    if (!link) {
      return unavailableView();
    }
    if (link.closed_at !== null) {
      return unavailableView();
    }
    if (linkIsExpired(link, requestTime)) {
      return unavailableView();
    }

    const program = await this.programs.findById(link.program_id);
    if (!program || program.deleted_at) {
      return unavailableView();
    }
    const snapshot = this.programs.getPublishedSnapshot(program);
    if (!snapshot) {
      return unavailableView();
    }

    const openLink = await this.links.findOpenByProgramId(program.id);
    if (!openLink || openLink.id !== link.id) {
      return unavailableView();
    }

    const expiryLine = this.buildExpiryLine(openLink);
    return {
      availability: "open",
      program_name: snapshot.name,
      published_at: snapshot.publishedAt,
      expiry_line: expiryLine,
      rows: snapshot.rows
        .filter((row) => row.exerciseId !== null && row.exerciseVersionId !== null)
        .map((row) => ({
          position: row.position,
          title: row.textSnapshot.title,
          prescription_type: row.prescriptionType,
          params: row.params,
          note: row.note,
        })),
    };
  }

  private buildExpiryLine(link: ShareLinkRecord): string {
    if (link.expires_at === null) {
      return PUBLIC_LINK_EXPIRY_NEVER;
    }
    const dateLabel = formatShareLinkExpiryDisplayDate(link.expires_at);
    return publicLinkExpiryUntilDateLine(dateLabel);
  }

  private async applyLinkExpiry(
    programId: string,
    choice: ShareLinkExpiryChoice,
  ): Promise<void> {
    try {
      const validated = validateShareLinkExpiryChoice(choice, new Date(this.now()));
      await this.programs.setLinkExpiry(programId, validated, new Date(this.now()));
    } catch (err) {
      if (err instanceof ShareLinkExpiryValidationError) {
        throw new ProgramPublishServiceError(err.message, "invalid_input");
      }
      throw err;
    }
  }

  private async requirePractitioner(practitionerId: string): Promise<void> {
    const practitioner = await this.practitioners.findById(practitionerId);
    if (!practitioner) {
      throw new ProgramPublishServiceError(
        "Practitioner not found",
        "practitioner_not_found",
      );
    }
  }

  private async requireOwnedProgram(
    practitionerId: string,
    programId: string,
  ): Promise<ProgramRecord> {
    const program = await this.programs.findById(programId);
    if (!program || program.created_by !== practitionerId || program.deleted_at) {
      throw new ProgramPublishServiceError("Program not found", "program_not_found");
    }
    return program;
  }

  private parseOpaqueId(value: string, label: string): string {
    try {
      return validateOpaqueEntityId(value, label);
    } catch (err) {
      if (err instanceof OpaqueEntityIdValidationError) {
        throw new ProgramPublishServiceError(err.message, "invalid_input");
      }
      throw err;
    }
  }

  private mapPublishRepositoryError(err: unknown): never {
    if (err instanceof FreeTextValidationError) {
      throw new ProgramPublishServiceError(
        PROGRAM_PUBLISH_NAME_REQUIRED,
        "name_required",
      );
    }
    if (err instanceof ProgramRepositoryError) {
      if (err.message === PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE) {
        throw new ProgramPublishServiceError(
          PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
          "placeholders_block_publish",
        );
      }
      if (err.message === "Program not found" || err.message === "Program is deleted") {
        throw new ProgramPublishServiceError("Program not found", "program_not_found");
      }
    }
    throw err;
  }
}

export function parseShareLinkExpiryBody(
  body: Record<string, unknown>,
): ShareLinkExpiryChoice {
  const expiresIn = body.expires_in;
  if (typeof expiresIn !== "string") {
    throw new ProgramPublishServiceError("expires_in is required", "invalid_input");
  }
  const customRaw = body.custom_expires_on;
  const customExpiresOn =
    customRaw === undefined || customRaw === null
      ? null
      : typeof customRaw === "string"
        ? customRaw
        : undefined;
  if (customRaw !== undefined && customRaw !== null && customExpiresOn === undefined) {
    throw new ProgramPublishServiceError(
      "custom_expires_on must be a string",
      "invalid_input",
    );
  }
  return {
    expiresIn: expiresIn as ShareLinkExpiresIn,
    customExpiresOn,
  };
}
