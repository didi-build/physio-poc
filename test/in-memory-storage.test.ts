import { describe, expect, it } from "vitest";
import { isNonEmptyCode } from "../src/domain/program.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";

describe("InMemoryObjectStorage (unit)", () => {
  it("stores and retrieves media by opaque key", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new TextEncoder().encode("demo-bytes");
    await storage.put("media/exercise/demo.png", body, "image/png");
    const roundTrip = await storage.get("media/exercise/demo.png");
    expect(roundTrip?.contentType).toBe("image/png");
    expect(roundTrip?.body).toEqual(body);
    await storage.delete("media/exercise/demo.png");
    expect(await storage.get("media/exercise/demo.png")).toBeNull();
  });
});

describe("InMemorySqlStorage (unit)", () => {
  it("inserts and selects program rows without patient fields", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run(
      "INSERT INTO programs (id, code, title, params_json) VALUES (?, ?, ?, ?)",
      ["prog-1", "AB12CD", "Morning routine", '{"reps":10}'],
    );
    const row = await sql.first<{
      id: string;
      code: string;
      title: string | null;
      params_json: string;
    }>("SELECT * FROM programs WHERE id = ? LIMIT 1", ["prog-1"]);
    expect(row?.code).toBe("AB12CD");
    expect(row?.title).toBe("Morning routine");
    expect(row?.params_json).toBe('{"reps":10}');
    expect(isNonEmptyCode(row?.code ?? "")).toBe(true);
  });
});
