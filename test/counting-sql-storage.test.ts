import { describe, expect, it } from "vitest";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import { wrapSqlStorageWithPendingSelectCounter } from "./helpers/counting-sql-storage.js";

describe("wrapSqlStorageWithPendingSelectCounter (unit)", () => {
  it("counts first, all, and run against pending consent SQL", async () => {
    const inner: SqlStoragePort = {
      run: async () => ({ rowsAffected: 0 }),
      all: async () => [],
      first: async () => null,
    };
    const { sql, pendingConsentStoreCallCount, resetPendingConsentStoreCallCount } =
      wrapSqlStorageWithPendingSelectCounter(inner);
    resetPendingConsentStoreCallCount();
    await sql.first("SELECT * FROM physio_mcp_pending_consent WHERE id = ? LIMIT 1", [
      "x",
    ]);
    await sql.all("SELECT * FROM physio_mcp_pending_consent");
    await sql.run(
      "UPDATE physio_mcp_pending_consent SET consumed_at_ms = ? WHERE id = ?",
      [1, "x"],
    );
    expect(pendingConsentStoreCallCount()).toBe(3);
  });
});
