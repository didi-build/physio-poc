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
      | "start_reference_unavailable",
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
    exerciseVersionId: string;
    regenerationNote?: string | null;
  }): Promise<ExerciseMediaSetView> {
    const regenerationNote = parseRegenerationNote(input.regenerationNote);
    const version = await this.requireVersion(input.exerciseVersionId);
    const visibility: MediaVisibility =
      version.status === "approved" ? "public" : "draft";
    const promptContext = this.promptContextFromVersion(version, regenerationNote);
    const generated = await this.images.generateStartAndEndImages({
      startPrompt: buildStartImagePrompt(promptContext),
      endPrompt: buildEndImagePrompt(promptContext),
      regenerationNote,
    });
    return this.persistMediaSet({
      version,
      visibility,
      start: generated.start,
      end: generated.end,
      updateVersion: true,
    });
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
        outcome: "new_approved_version";
        media: ExerciseMediaSetView;
        newVersionId: string;
        newVersionNumber: number;
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

    const version = await this.requireVersion(input.exerciseVersionId);
    const promptContext = this.promptContextFromVersion(version, regenerationNote);
    const existing = version.media_set_id
      ? await this.mediaSets.findById(version.media_set_id)
      : null;

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
    const imageOptions = { regenerationNote };

    if (input.scope === "start" || input.scope === "both") {
      const generated = await this.images.generateStartImage(
        buildStartImagePrompt(promptContext),
        imageOptions,
      );
      startImage = { body: generated.bytes, contentType: generated.contentType };
      if (generated.providerSourceUrl) {
        startProviderUrl = generated.providerSourceUrl;
      }
    }
    if (input.scope === "end" || input.scope === "both") {
      const startReferenceImageUrl =
        input.scope === "both"
          ? (startProviderUrl ?? undefined)
          : (existing?.start_provider_url ?? undefined);
      if (!startReferenceImageUrl) {
        throw new ExerciseMediaServiceError(
          "Start reference image is not available for end regeneration",
          "start_reference_unavailable",
        );
      }
      const generated = await this.images.generateEndImage(
        buildEndImagePrompt(promptContext),
        {
          ...imageOptions,
          startReferenceImageUrl,
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
      startProviderUrl = pair.start.providerSourceUrl ?? startProviderUrl;
    }

    const nowIso = this.clock().toISOString();
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

    if (version.status === "draft") {
      const media = await this.persistMediaSet({
        version,
        visibility: "draft",
        start: {
          bytes: startImage.body,
          contentType: startImage.contentType,
          providerSourceUrl: startProviderUrl,
        },
        end: { bytes: endImage.body, contentType: endImage.contentType },
        updateVersion: true,
      });
      return { outcome: "draft_updated", media, quota: updatedQuota };
    }

    const mediaSetId = this.createId();
    const keys = mediaObjectKeys(mediaSetId);
    await this.media.putImage(
      keys.startObjectKey,
      startImage.body,
      startImage.contentType,
      "public",
    );
    await this.media.putImage(
      keys.endObjectKey,
      endImage.body,
      endImage.contentType,
      "public",
    );
    await this.mediaSets.insert({
      id: mediaSetId,
      startObjectKey: keys.startObjectKey,
      endObjectKey: keys.endObjectKey,
      startProviderUrl,
      visibility: "public",
      createdAt: nowIso,
    });

    const latest = await this.versions.latestApprovedVersionNumber(version.exercise_id);
    const nextVersion = (latest ?? version.version_number) + 1;
    const newVersionId = this.createId();
    const summary = summarizeRegeneration(input.scope);
    await this.versions.insertApprovedVersionFromSource({
      id: newVersionId,
      source: version,
      versionNumber: nextVersion,
      mediaSetId,
      approvedBy: input.practitionerId,
      approvedAt: nowIso,
      changeSummary: summary,
      createdAt: nowIso,
    });

    return {
      outcome: "new_approved_version",
      media: {
        mediaSetId,
        startObjectKey: keys.startObjectKey,
        endObjectKey: keys.endObjectKey,
        visibility: "public",
      },
      newVersionId,
      newVersionNumber: nextVersion,
      quota: updatedQuota,
    };
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
  ): Promise<ExerciseMediaSetView | null> {
    const version = await this.requireVersion(exerciseVersionId);
    if (!version.media_set_id) {
      return null;
    }
    const row = await this.mediaSets.findById(version.media_set_id);
    if (!row) {
      return null;
    }
    if (access === "public") {
      if (row.visibility !== "public" || version.status !== "approved") {
        return null;
      }
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
    },
    regenerationNote?: string | null,
  ): ExerciseMediaPromptContext {
    return {
      title: version.title,
      startingPosition: version.starting_position,
      steps: version.steps,
      regenerationNote,
    };
  }

  private async persistMediaSet(input: {
    version: { id: string; media_set_id: string | null };
    visibility: MediaVisibility;
    start: {
      bytes: Uint8Array;
      contentType: string;
      providerSourceUrl?: string | null;
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
      startProviderUrl: input.start.providerSourceUrl ?? null,
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
      throw new ExerciseMediaServiceError(
        "Exercise version not found",
        "version_not_found",
      );
    }
    return version;
  }
}

function summarizeRegeneration(scope: MediaRegenerationScope): string {
  const scopeLabel =
    scope === "both" ? "images" : scope === "start" ? "start image" : "end image";
  return `Regenerated ${scopeLabel}`;
}
