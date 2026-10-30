import { describe, expect, it } from "vitest";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import { MyDefaultsService } from "../src/services/my-defaults/index.js";
import {
  ProgramsRepository,
  ShareLinkDefaultsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import {
  openMigratedDatabase,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";

const id = (suffix: string) => testOpaqueEntityId(`my-defaults-${suffix}`);

describe("MyDefaultsService (integration, SQLite)", () => {
  it("returns global 1 year share link default when practitioner has no override", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const page = await new MyDefaultsService(storage).getPage(practitionerId);
      expect(page.share_link_expiry.global.expiresIn).toBe(
        SHARE_LINK_EXPIRES_IN.one_year,
      );
      expect(page.share_link_expiry.practitioner).toBeNull();
      expect(page.share_link_expiry.effective.expiresIn).toBe(
        SHARE_LINK_EXPIRES_IN.one_year,
      );
    } finally {
      storage.close();
    }
  });

  it("updates practitioner share link default without changing existing open links", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      const links = new ShareLinksRepository(storage);
      const firstLink = await links.createOpenLinkForProgram({
        id: id("link-1"),
        programId: id("prog-1"),
        practitionerId,
        createdAt: TS,
        now: new Date("2026-03-01T12:00:00.000Z"),
      });
      const firstExpiresAt = firstLink.expires_at;

      const service = new MyDefaultsService(storage);
      await service.updateShareLinkDefault(
        practitionerId,
        SHARE_LINK_EXPIRES_IN.one_week,
      );

      const reopened = await links.findOpenByProgramId(id("prog-1"));
      expect(reopened?.expires_at).toBe(firstExpiresAt);

      await programs.create({
        id: id("prog-2"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      const secondNow = new Date("2026-03-15T12:00:00.000Z");
      const secondLink = await links.createOpenLinkForProgram({
        id: id("link-2"),
        programId: id("prog-2"),
        practitionerId,
        createdAt: TS,
        now: secondNow,
      });
      expect(secondLink.expires_at).toBe("2026-03-23T03:59:59.999Z");
      expect(secondLink.expires_at).not.toBe(firstExpiresAt);
    } finally {
      storage.close();
    }
  });

  it("reset to global deletes the practitioner type_defaults row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await typeDefaults.upsertPractitionerDefaults(
        id("td-1"),
        practitionerId,
        "concentric",
        {
          reps: 12,
          hold_s: 2,
          sets: 3,
          rest_s: 60,
          days_per_week: 3,
        },
      );

      const service = new MyDefaultsService(storage);
      const reset = await service.resetTypeDefault(practitionerId, "concentric");
      expect(reset.practitioner_params).toBeNull();

      const row = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerId, "concentric"],
      );
      expect(row).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("persists practitioner share link default via ShareLinkDefaultsRepository", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new MyDefaultsService(storage);
      await service.updateShareLinkDefault(practitionerId, SHARE_LINK_EXPIRES_IN.never);
      const repo = new ShareLinkDefaultsRepository(storage);
      expect(await repo.getPractitionerDefault(practitionerId)).toEqual({
        expiresIn: SHARE_LINK_EXPIRES_IN.never,
        customExpiresOn: null,
      });
    } finally {
      storage.close();
    }
  });
});
