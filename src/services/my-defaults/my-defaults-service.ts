import { generateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import {
  ParamValidationError,
  validateExerciseParamsForPrescriptionType,
  type ExerciseParams,
} from "../../domain/exercise-params.js";
import {
  ShareLinkExpiryValidationError,
  validateShareLinkExpiryChoice,
  type ShareLinkExpiryChoice,
} from "../../domain/share-link-expiry.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../domain/exercise-types.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../domain/global-type-defaults-seed.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import { PractitionersRepository } from "../../storage/repositories/exercise-data.js";
import { ShareLinkDefaultsRepository } from "../../storage/repositories/programs.js";
import { TypeDefaultsRepository } from "../../storage/repositories/type-defaults.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import type {
  MyDefaultsExerciseTypeView,
  MyDefaultsPageView,
  ShareLinkExpiryDefaultsView,
} from "./types.js";

export class MyDefaultsServiceError extends Error {
  constructor(
    message: string,
    readonly code: "practitioner_not_found" | "invalid_input" | "type_not_found",
  ) {
    super(message);
    this.name = "MyDefaultsServiceError";
  }
}

const PRACTITIONER_DEFAULT_EXPIRES_IN = [
  SHARE_LINK_EXPIRES_IN.one_week,
  SHARE_LINK_EXPIRES_IN.thirty_days,
  SHARE_LINK_EXPIRES_IN.ninety_days,
  SHARE_LINK_EXPIRES_IN.one_year,
  SHARE_LINK_EXPIRES_IN.never,
] as const;

export type PractitionerShareLinkExpiresIn =
  (typeof PRACTITIONER_DEFAULT_EXPIRES_IN)[number];

export class MyDefaultsService {
  private readonly practitioners: PractitionersRepository;
  private readonly shareLinkDefaults: ShareLinkDefaultsRepository;
  private readonly typeDefaults: TypeDefaultsRepository;

  constructor(sql: SqlStoragePort) {
    this.practitioners = new PractitionersRepository(sql);
    this.shareLinkDefaults = new ShareLinkDefaultsRepository(sql);
    this.typeDefaults = new TypeDefaultsRepository(sql);
  }

  async getPage(practitionerId: string): Promise<MyDefaultsPageView> {
    await this.requirePractitioner(practitionerId);
    const globalShare = await this.shareLinkDefaults.getGlobalDefault();
    const practitionerShare =
      await this.shareLinkDefaults.getPractitionerDefault(practitionerId);
    const practitionerTypes =
      await this.typeDefaults.listPractitionerDefaults(practitionerId);

    const shareLinkExpiry: ShareLinkExpiryDefaultsView = {
      global: globalShare,
      practitioner: practitionerShare,
      effective: practitionerShare ?? globalShare,
    };

    const exerciseTypes: MyDefaultsExerciseTypeView[] = PRESCRIPTION_TYPES.map(
      (type) => ({
        type,
        global_params: GLOBAL_TYPE_DEFAULTS_SEED[type],
        practitioner_params: practitionerTypes[type] ?? null,
      }),
    );

    return { share_link_expiry: shareLinkExpiry, exercise_types: exerciseTypes };
  }

  async updateShareLinkDefault(
    practitionerId: string,
    expiresIn: ShareLinkExpiresIn,
  ): Promise<ShareLinkExpiryDefaultsView> {
    await this.requirePractitioner(practitionerId);
    if (expiresIn === SHARE_LINK_EXPIRES_IN.custom_date) {
      throw new MyDefaultsServiceError(
        "Custom date is not allowed for practitioner share link default",
        "invalid_input",
      );
    }
    if (
      !PRACTITIONER_DEFAULT_EXPIRES_IN.includes(
        expiresIn as PractitionerShareLinkExpiresIn,
      )
    ) {
      throw new MyDefaultsServiceError(
        "Invalid share link expiry choice",
        "invalid_input",
      );
    }
    let validated: ShareLinkExpiryChoice;
    try {
      validated = validateShareLinkExpiryChoice({ expiresIn });
    } catch (error) {
      if (error instanceof ShareLinkExpiryValidationError) {
        throw new MyDefaultsServiceError(error.message, "invalid_input");
      }
      throw error;
    }
    await this.shareLinkDefaults.upsertPractitionerDefault(
      generateOpaqueEntityId(),
      practitionerId,
      validated,
    );
    const globalShare = await this.shareLinkDefaults.getGlobalDefault();
    const practitionerShare =
      await this.shareLinkDefaults.getPractitionerDefault(practitionerId);
    return {
      global: globalShare,
      practitioner: practitionerShare,
      effective: practitionerShare ?? globalShare,
    };
  }

  async upsertTypeDefault(
    practitionerId: string,
    type: PrescriptionType,
    params: ExerciseParams,
  ): Promise<MyDefaultsExerciseTypeView> {
    await this.requirePractitioner(practitionerId);
    if (!PRESCRIPTION_TYPES.includes(type)) {
      throw new MyDefaultsServiceError("Unknown exercise type", "type_not_found");
    }
    let validated: ExerciseParams;
    try {
      validated = validateExerciseParamsForPrescriptionType(params, type);
    } catch (error) {
      if (error instanceof ParamValidationError) {
        throw new MyDefaultsServiceError(error.message, "invalid_input");
      }
      throw error;
    }
    await this.typeDefaults.upsertPractitionerDefaults(
      generateOpaqueEntityId(),
      practitionerId,
      type,
      validated,
    );
    return {
      type,
      global_params: GLOBAL_TYPE_DEFAULTS_SEED[type],
      practitioner_params: validated,
    };
  }

  async resetTypeDefault(
    practitionerId: string,
    type: PrescriptionType,
  ): Promise<MyDefaultsExerciseTypeView> {
    await this.requirePractitioner(practitionerId);
    if (!PRESCRIPTION_TYPES.includes(type)) {
      throw new MyDefaultsServiceError("Unknown exercise type", "type_not_found");
    }
    await this.typeDefaults.deletePractitionerDefaults(practitionerId, type);
    return {
      type,
      global_params: GLOBAL_TYPE_DEFAULTS_SEED[type],
      practitioner_params: null,
    };
  }

  private async requirePractitioner(practitionerId: string): Promise<void> {
    const row = await this.practitioners.findById(practitionerId);
    if (!row) {
      throw new MyDefaultsServiceError(
        "Practitioner not found",
        "practitioner_not_found",
      );
    }
  }
}
