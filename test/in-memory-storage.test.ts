import { describe, expect, it } from "vitest";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";
import { SqlDuplicateIdError } from "../src/storage/errors/sql-duplicate-id-error.js";

describe("InMemoryObjectStorage (unit)", () => {
  it("copies bytes on put and get", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new TextEncoder().encode("demo-bytes");
    await storage.put("media/exercise/demo.png", body, "image/png");
    body[0] = 0xff;
    const roundTrip = await storage.get("media/exercise/demo.png");
    expect(roundTrip?.body[0]).not.toBe(0xff);
    expect(new TextDecoder().decode(roundTrip?.body)).toBe("demo-bytes");
  });

  it("copies bytes on get so mutating a result does not change stored data", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new TextEncoder().encode("demo-bytes");
    await storage.put("media/exercise/demo.png", body, "image/png");
    const first = await storage.get("media/exercise/demo.png");
    if (!first) {
      throw new Error("expected object");
    }
    first.body[0] = 0xaa;
    const second = await storage.get("media/exercise/demo.png");
    expect(second?.body[0]).toBe("demo-bytes".charCodeAt(0));
  });

  it("head reports size and content-type", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new TextEncoder().encode("abc");
    await storage.put("media/a.bin", body, "application/octet-stream");
    await expect(storage.head("media/a.bin")).resolves.toEqual({
      contentType: "application/octet-stream",
      size: 3,
    });
    expect(await storage.head("missing")).toBeNull();
  });

  it("deletes stored objects", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new TextEncoder().encode("demo-bytes");
    await storage.put("media/exercise/demo.png", body, "image/png");
    await storage.delete("media/exercise/demo.png");
    expect(await storage.get("media/exercise/demo.png")).toBeNull();
  });
});

describe("InMemorySqlStorage (unit)", () => {
  it("inserts and selects rows with neutral fixtures", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["item-1", "alpha"]);
    const row = await sql.first<{ id: string; label: string }>(
      "SELECT * FROM items WHERE id = ? LIMIT 1",
      ["item-1"],
    );
    expect(row?.label).toBe("alpha");
  });

  it("returns row copies from first()", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["item-1", "alpha"]);
    const row = await sql.first<{ id: string; label: string }>(
      "SELECT * FROM items WHERE id = ? LIMIT 1",
      ["item-1"],
    );
    if (!row) {
      throw new Error("expected row");
    }
    row.label = "mutated";
    const again = await sql.first<{ id: string; label: string }>(
      "SELECT * FROM items WHERE id = ? LIMIT 1",
      ["item-1"],
    );
    expect(again?.label).toBe("alpha");
  });

  it("first() returns null for a missing id", async () => {
    const sql = new InMemorySqlStorage();
    await expect(
      sql.first("SELECT * FROM items WHERE id = ? LIMIT 1", ["missing"]),
    ).resolves.toBeNull();
  });

  it("run() returns rowsAffected 1 on insert", async () => {
    const sql = new InMemorySqlStorage();
    await expect(
      sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["item-1", "alpha"]),
    ).resolves.toEqual({ rowsAffected: 1 });
  });

  it("all() returns every matching row without LIMIT 1", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO items (id, status) VALUES (?, ?)", ["a", "open"]);
    await sql.run("INSERT INTO items (id, status) VALUES (?, ?)", ["b", "open"]);
    await sql.run("INSERT INTO items (id, status) VALUES (?, ?)", ["c", "closed"]);
    const rows = await sql.all<{ id: string; status: string }>(
      "SELECT * FROM items WHERE status = ?",
      ["open"],
    );
    expect(rows.map((row) => row.id).sort()).toEqual(["a", "b"]);
  });

  it("first() requires LIMIT 1 on supported SELECT queries", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["item-1", "alpha"]);
    await expect(
      sql.first("SELECT * FROM items WHERE id = ?", ["item-1"]),
    ).rejects.toThrow(/Unsupported SQL/);
  });

  it("all() rejects LIMIT 1 on supported SELECT queries", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["item-1", "alpha"]);
    await expect(
      sql.all("SELECT * FROM items WHERE id = ? LIMIT 1", ["item-1"]),
    ).rejects.toThrow(/Unsupported SQL/);
  });

  it("rejects duplicate ids with SqlDuplicateIdError on programs only", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO programs (id, label) VALUES (?, ?)", ["dup", "one"]);
    await expect(
      sql.run("INSERT INTO programs (id, label) VALUES (?, ?)", ["dup", "two"]),
    ).rejects.toBeInstanceOf(SqlDuplicateIdError);
  });

  it("rejects binding count mismatch on insert", async () => {
    const sql = new InMemorySqlStorage();
    await expect(
      sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["only-one"]),
    ).rejects.toThrow(/column count must match bindings/);
  });

  it("rejects non-? placeholders on insert", async () => {
    const sql = new InMemorySqlStorage();
    await expect(
      sql.run("INSERT INTO items (id, label) VALUES ($1, ?)", ["a", "b"]),
    ).rejects.toThrow(/Only \? placeholders/);
  });

  it("updates a row with UPDATE", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["item-1", "alpha"]);
    await sql.run("UPDATE items SET label = ? WHERE id = ?", ["beta", "item-1"]);
    const row = await sql.first<{ label: string }>(
      "SELECT * FROM items WHERE id = ? LIMIT 1",
      ["item-1"],
    );
    expect(row?.label).toBe("beta");
  });

  it("stores boolean bindings as 1 or 0 like D1", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO flags (id, active) VALUES (?, ?)", ["f1", true]);
    await sql.run("INSERT INTO flags (id, active) VALUES (?, ?)", ["f2", false]);
    const active = await sql.first<{ active: number }>(
      "SELECT * FROM flags WHERE id = ? LIMIT 1",
      ["f1"],
    );
    const inactive = await sql.first<{ active: number }>(
      "SELECT * FROM flags WHERE id = ? LIMIT 1",
      ["f2"],
    );
    expect(active?.active).toBe(1);
    expect(inactive?.active).toBe(0);
  });
});
