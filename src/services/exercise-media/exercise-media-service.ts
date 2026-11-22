import {
  buildEndImagePrompt,
  buildStartImagePrompt,
  type ExerciseMediaPromptContext,
} from "../../domain/exercise-media-prompts.js";
import {
  FreeTextValidationError,
  validateMediaRegenerationNote,
} from "../../domain/exercise-free-text.js";
import type { ImageGenerationPort } from "../../storage/ports/image-generation.js";
import type {
  MediaStoragePort,
  MediaVisibility,
} from "../../storage/ports/media-storage.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  ExerciseMediaSetsRepository,
  ExerciseVersionMediaRepository,
  MediaRegenerationsRepository,
  type ExerciseVersionMediaRow,
  type MediaRegenerationScope,
} from "../../storage/repositories/exercise-media.js";

export const DAILY_MEDIA_REGENERATION_CAP = 5;

export type RegenerationQuota = {
  limit: number;
  used: number;
  remaining: number;
  limitReached: boolean;
};

export type ExerciseMediaSetView = {
  mediaSetId: string;
  startObjectKey: string;
  endObjectKey: string;
  visibility: MediaVisibility;
};

export class ExerciseMediaServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "version_not_found"
      | "media_set_not_found"
      | "daily_limit_reached"
      | "invalid_scope"
      | "invalid_input"
      | "start_reference_unavailable"
      | "exercise_media_already_generated",
  ) {
    super(message);
    this.name = "ExerciseMediaServiceError";
  }
}

type Clock = () => Date;

function utcDayBounds(now: Date): { start: string; end: string } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function mediaObjectKeys(mediaSetId: string): {
  startObjectKey: string;
  endObjectKey: string;
} {
  return {
    startObjectKey: `media-sets/${mediaSetId}/start.png`,
    endObjectKey: `media-sets/${mediaSetId}/end.png`,
  };
}

function parseRegenerationNote(note: string | null | undefined): string | null {
  try {
    return validateMediaRegenerationNote(note);
  } catch (error) {
    if (error instanceof FreeTextValidationError) {
      throw new ExerciseMediaServiceError(error.message, "invalid_input");
    }
    throw error;
  }
}

export class ExerciseMediaService {
  private readonly mediaSets: ExerciseMediaSetsRepository;
  private readonly regenerations: MediaRegenerationsRepository;
  private readonly versions: ExerciseVersionMediaRepository;

  constructor(
    private readonly sql: SqlStoragePort,
    private readonly images: ImageGenerationPort,
    private readonly media: MediaStoragePort,
    private readonly clock: Clock = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {
    this.mediaSets = new ExerciseMediaSetsRepository(this.sql);
    this.regenerations = new MediaRegenerationsRepository(this.sql);
    this.versions = new ExerciseVersionMediaRepository(this.sql);
  }

  async getRegenerationQuota(practitionerId: string): Promise<RegenerationQuota> {
    const now = this.clock();
    const bounds = utcDayBounds(now);
    const used = await this.regenerations.countForPractitionerOnUtcDay(
      practitionerId,
      bounds.start,
      bounds.end,
    );
    const remaining = Math.max(0, DAILY_MEDIA_REGENERATION_CAP - used);
    return {
      limit: DAILY_MEDIA_REGENERATION_CAP,
      used,
      remaining,
      limitReached: remaining <= 0,
    };
  }

  async generateInitialMediaForVersion(input: {
    practitionerId: string;
    exerciseVersionId: string;
    regenerationNote?: string | null;
    /** First draft orchestration sets false so the initial stills skip the 5-a-day counter. */
    countTowardDailyQuota?: boolean;
  }): Promise<ExerciseMediaSetView> {
    const regenerationNote = parseRegenerationNote(input.regenerationNote);
    const countTowardDailyQuota = input.countTowardDailyQuota !== false;
    if (countTowardDailyQuota) {
      const quota = await this.getRegenerationQuota(input.practitionerId);
      if (quota.limitReached) {
        throw new ExerciseMediaServiceError(
          "Daily media regeneration limit reached",
          "daily_limit_reached",
        );
      }
    }
    const version = await this.requireVersionForPractitioner(
      input.exerciseVersionId,
      input.practitionerId,
    );
    if (version.media_set_id) {
      const existing = await this.mediaSets.findById(version.media_set_id);
      if (existing) {
        throw new ExerciseMediaServiceError(
          "Exercise media already generated for this version",
          "exercise_media_already_generated",
        );
      }
    }
    if (version.pending_media_set_id) {
      const pending = await this.mediaSets.findById(version.pending_media_set_id);
      if (pending) {
        throw new ExerciseMediaServiceError(
          "Exercise media already generated for this version",
          "exercise_media_already_generated",
        );
      }
    }
    const promptContext = this.promptContextFromVersion(version, regenerationNote);
    const generated = await this.images.generateStartAndEndImages({
      startPrompt: buildStartImagePrompt(promptContext),
      endPrompt: buildEndImagePrompt(promptContext),
      regenerationNote,
    });
    const media =
      version.status === "approved"
        ? await this.persistApprovedPendingMediaSet({
            version,
            practitionerId: input.practitionerId,
            start: generated.start,
            end: generated.end,
          })
        : await this.persistMediaSet({
            version,
            visibility: "draft",
            start: generated.start,
            end: generated.end,
            updateVersion: true,
          });
    if (countTowardDailyQuota) {
      const nowIso = this.clock().toISOString();
      await this.regenerations.insert({
        id: this.createId(),
        practitionerId: input.practitionerId,
        exerciseId: version.exercise_id,
        exerciseVersionId: version.id,
        scope: "both",
        hadNote: regenerationNote !== null,
        createdAt: nowIso,
      });
    }
    return media;
  }

  async regenerateMedia(input: {
    practitionerId: string;
    exerciseVersionId: string;
    scope: MediaRegenerationScope;
    note?: string | null;
  }): Promise<
    | {
        outcome: "draft_updated";
        media: ExerciseMediaSetView;
        quota: RegenerationQuota;
      }
    | {
        outcome: "pending_draft_updated";
        media: ExerciseMediaSetView;
        quota: RegenerationQuota;
      }
  > {
    if (!["start", "end", "both"].includes(input.scope)) {
      throw new ExerciseMediaServiceError(
        "Invalid regeneration scope",
        "invalid_scope",
      );
    }

    const regenerationNote = parseRegenerationNote(input.note);

    const quota = await this.getRegenerationQuota(input.practitionerId);
    if (quota.limitReached) {
      throw new ExerciseMediaServiceError(
        "Daily media regeneration limit reached",
        "daily_limit_reached",
      );
    }

    const version = await this.requireVersionForPractitioner(
      input.exerciseVersionId,
      input.practitionerId,
    );
    if (
      version.status === "approved" &&
      version.pending_media_requested_by &&
      version.pending_media_requested_by !== input.practitionerId
    ) {
      throw this.versionNotFoundError();
    }
    const promptContext = this.promptContextFromVersion(version, regenerationNote);
    const liveSet = version.media_set_id
      ? await this.mediaSets.findById(version.media_set_id)
      : null;
    const pendingSet =
      version.pending_media_set_id &&
      version.pending_media_requested_by === input.practitionerId
        ? await this.mediaSets.findById(version.pending_media_set_id)
        : null;
    const existing = pendingSet ?? liveSet;

    let startImage = existing
      ? await this.media.getImage(
          existing.start_object_key,
          existing.visibility as MediaVisibility,
        )
      : null;
    let endImage = existing
      ? await this.media.getImage(
          existing.end_object_key,
          existing.visibility as MediaVisibility,
        )
      : null;

    let startProviderUrl = existing?.start_provider_url ?? null;
    if (input.scope === "start" || input.scope === "both") {
      startProviderUrl = null;
    }
    const imageOptions = { regenerationNote };

    if (input.scope === "start" || input.scope === "both") {
      const generated = await this.images.generateStartImage(
        buildStartImagePrompt(promptContext),
        imageOptions,
      );
      startImage = { body: generated.bytes, contentType: generated.contentType };
    }
    if (input.scope === "end" || input.scope === "both") {
      const startReferenceImage =
        startImage !== null
          ? { bytes: startImage.body, contentType: startImage.contentType }
          : undefined;
      if (!startReferenceImage) {
        throw new ExerciseMediaServiceError(
          "Start reference image is not available for end regeneration",
          "start_reference_unavailable",
        );
      }
      const generated = await this.images.generateEndImage(
        buildEndImagePrompt(promptContext),
        {
          ...imageOptions,
          startReferenceImage,
        },
      );
      endImage = { body: generated.bytes, contentType: generated.contentType };
    }
    if (!startImage || !endImage) {
      const pair = await this.images.generateStartAndEndImages({
        startPrompt: buildStartImagePrompt(promptContext),
        endPrompt: buildEndImagePrompt(promptContext),
        regenerationNote,
      });
      startImage = { body: pair.start.bytes, contentType: pair.start.contentType };
      endImage = { body: pair.end.bytes, contentType: pair.end.contentType };
    }

    const nowIso = this.clock().toISOString();

    if (version.status === "draft") {
      const media = await this.persistMediaSet({
        version,
        visibility: "draft",
        start: {
          bytes: startImage.body,
          contentType: startImage.contentType,
          startProviderUrl,
        },
        end: { bytes: endImage.body, contentType: endImage.contentType },
        updateVersion: true,
      });
      await this.regenerations.insert({
        id: this.createId(),
        practitionerId: input.practitionerId,
        exerciseId: version.exercise_id,
        exerciseVersionId: version.id,
        scope: input.scope,
        hadNote: regenerationNote !== null,
        createdAt: nowIso,
      });
      const updatedQuota = await this.getRegenerationQuota(input.practitionerId);
      return { outcome: "draft_updated", media, quota: updatedQuota };
    }

    const media = await this.persistApprovedPendingMediaSet({
      version,
      practitionerId: input.practitionerId,
      start: {
        bytes: startImage.body,
        contentType: startImage.contentType,
        startProviderUrl,
      },
      end: { bytes: endImage.body, contentType: endImage.contentType },
    });
    await this.regenerations.insert({
      id: this.createId(),
      practitionerId: input.practitionerId,
      exerciseId: version.exercise_id,
      exerciseVersionId: version.id,
      scope: input.scope,
      hadNote: regenerationNote !== null,
      createdAt: nowIso,
    });
    const updatedQuota = await this.getRegenerationQuota(input.practitionerId);

    return { outcome: "pending_draft_updated", media, quota: updatedQuota };
  }

  async getDraftStillImage(input: {
    practitionerId: string;
    exerciseVersionId: string;
    which: "start" | "end";
  }): Promise<{ body: Uint8Array; contentType: string } | null> {
    const version = await this.requireVersionForPractitioner(
      input.exerciseVersionId,
      input.practitionerId,
    );
    if (!version.media_set_id) {
      return null;
    }
    const row = await this.mediaSets.findById(version.media_set_id);
    if (!row || row.visibility !== "draft") {
      return null;
    }
    const key = input.which === "start" ? row.start_object_key : row.end_object_key;
    const image = await this.media.getImage(key, "draft");
    if (!image) {
      return null;
    }
    return { body: image.body, contentType: image.contentType };
  }

  async promoteDraftMediaOnApproval(
    exerciseVersionId: string,
  ): Promise<ExerciseMediaSetView | null> {
    const version = await this.requireVersion(exerciseVersionId);
    if (!version.media_set_id) {
      return null;
    }
    const row = await this.mediaSets.findById(version.media_set_id);
    if (!row) {
      throw new ExerciseMediaServiceError("Media set not found", "media_set_not_found");
    }
    if (row.visibility === "public") {
      return {
        mediaSetId: row.id,
        startObjectKey: row.start_object_key,
        endObjectKey: row.end_object_key,
        visibility: "public",
      };
    }
    await this.media.promoteDraftToPublic({
      startObjectKey: row.start_object_key,
      endObjectKey: row.end_object_key,
    });
    await this.mediaSets.updateVisibility(row.id, "public");
    return {
      mediaSetId: row.id,
      startObjectKey: row.start_object_key,
      endObjectKey: row.end_object_key,
      visibility: "public",
    };
  }

  async getMediaForServing(
    exerciseVersionId: string,
    access: "internal" | "public",
    sessionPractitionerId?: string,
  ): Promise<ExerciseMediaSetView | null> {
    if (access === "public") {
      const version = await this.requireVersionForPublicServing(exerciseVersionId);
      if (!version.media_set_id) {
        return null;
      }
      const row = await this.mediaSets.findById(version.media_set_id);
      if (!row) {
        return null;
      }
      if (row.visibility !== "public" || version.status !== "approved") {
        return null;
      }
      return {
        mediaSetId: row.id,
        startObjectKey: row.start_object_key,
        endObjectKey: row.end_object_key,
        visibility: row.visibility,
      };
    }

    const version = await this.versions.findVersionWithExerciseOwner(exerciseVersionId);
    if (!version) {
      throw this.versionNotFoundError();
    }

    if (version.pending_media_set_id) {
      const pendingRow = await this.mediaSets.findById(version.pending_media_set_id);
      if (pendingRow) {
        if (sessionPractitionerId !== version.pending_media_requested_by) {
          throw this.versionNotFoundError();
        }
        return {
          mediaSetId: pendingRow.id,
          startObjectKey: pendingRow.start_object_key,
          endObjectKey: pendingRow.end_object_key,
          visibility: pendingRow.visibility,
        };
      }
    }

    await this.requireVersionForPractitioner(
      exerciseVersionId,
      sessionPractitionerId ?? "",
    );
    if (!version.media_set_id) {
      return null;
    }
    const row = await this.mediaSets.findById(version.media_set_id);
    if (!row) {
      return null;
    }
    return {
      mediaSetId: row.id,
      startObjectKey: row.start_object_key,
      endObjectKey: row.end_object_key,
      visibility: row.visibility,
    };
  }

  private promptContextFromVersion(
    version: {
      title: string;
      starting_position: string;
      steps: string;
      ending_position?: string;
    },
    regenerationNote?: string | null,
  ): ExerciseMediaPromptContext {
    return {
      title: version.title,
      startingPosition: version.starting_position,
      endingPosition: version.ending_position,
      steps: version.steps,
      regenerationNote,
    };
  }

  private async persistApprovedPendingMediaSet(input: {
    version: ExerciseVersionMediaRow;
    practitionerId: string;
    start: {
      bytes: Uint8Array;
      contentType: string;
      startProviderUrl?: string | null;
    };
    end: { bytes: Uint8Array; contentType: string };
  }): Promise<ExerciseMediaSetView> {
    if (input.version.pending_media_set_id) {
      const previous = await this.mediaSets.findById(
        input.version.pending_media_set_id,
      );
      if (previous) {
        await this.media.deleteDraftSet({
          startObjectKey: previous.start_object_key,
          endObjectKey: previous.end_object_key,
        });
        await this.mediaSets.deleteById(previous.id);
      }
    }
    const mediaSetId = this.createId();
    const keys = mediaObjectKeys(mediaSetId);
    const createdAt = this.clock().toISOString();
    await this.media.putImage(
      keys.startObjectKey,
      input.start.bytes,
      input.start.contentType,
      "draft",
    );
    await this.media.putImage(
      keys.endObjectKey,
      input.end.bytes,
      input.end.contentType,
      "draft",
    );
    await this.mediaSets.insert({
      id: mediaSetId,
      startObjectKey: keys.startObjectKey,
      endObjectKey: keys.endObjectKey,
      startProviderUrl: input.start.startProviderUrl ?? null,
      visibility: "draft",
      createdAt,
    });
    await this.versions.updatePendingDraft(input.version.id, {
      pendingMediaSetId: mediaSetId,
      pendingMediaRequestedBy: input.practitionerId,
    });
    return {
      mediaSetId,
      startObjectKey: keys.startObjectKey,
      endObjectKey: keys.endObjectKey,
      visibility: "draft",
    };
  }

  private async persistMediaSet(input: {
    version: { id: string; media_set_id: string | null };
    visibility: MediaVisibility;
    start: {
      bytes: Uint8Array;
      contentType: string;
      startProviderUrl?: string | null;
    };
    end: { bytes: Uint8Array; contentType: string };
    updateVersion: boolean;
  }): Promise<ExerciseMediaSetView> {
    const mediaSetId = this.createId();
    const keys = mediaObjectKeys(mediaSetId);
    const createdAt = this.clock().toISOString();
    await this.media.putImage(
      keys.startObjectKey,
      input.start.bytes,
      input.start.contentType,
      input.visibility,
    );
    await this.media.putImage(
      keys.endObjectKey,
      input.end.bytes,
      input.end.contentType,
      input.visibility,
    );
    await this.mediaSets.insert({
      id: mediaSetId,
      startObjectKey: keys.startObjectKey,
      endObjectKey: keys.endObjectKey,
      startProviderUrl: input.start.startProviderUrl ?? null,
      visibility: input.visibility,
      createdAt,
    });
    if (input.updateVersion) {
      await this.versions.updateMediaSetId(input.version.id, mediaSetId);
    }
    return {
      mediaSetId,
      startObjectKey: keys.startObjectKey,
      endObjectKey: keys.endObjectKey,
      visibility: input.visibility,
    };
  }

  private async requireVersion(id: string) {
    const version = await this.versions.findVersion(id);
    if (!version) {
      throw this.versionNotFoundError();
    }
    return version;
  }

  private async requireVersionForPublicServing(
    versionId: string,
  ): Promise<ExerciseVersionMediaRow> {
    const version = await this.versions.findVersionWithExerciseOwner(versionId);
    if (!version) {
      throw this.versionNotFoundError();
    }
    if (version.status === "draft") {
      throw this.versionNotFoundError();
    }
    return version;
  }

  private async requireVersionForPractitioner(
    versionId: string,
    practitionerId: string,
  ): Promise<ExerciseVersionMediaRow> {
    const version = await this.versions.findVersionWithExerciseOwner(versionId);
    if (!version || version.exercise_created_by !== practitionerId) {
      throw this.versionNotFoundError();
    }
    return version;
  }

  private versionNotFoundError(): ExerciseMediaServiceError {
    return new ExerciseMediaServiceError(
      "Exercise version not found",
      "version_not_found",
    );
  }
}
