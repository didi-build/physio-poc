import { describe, expect, it, vi } from "vitest";
import {
  PROGRAMS_API_BASE,
  programPath,
  programRestorePath,
  programRowDuplicatePath,
  programRowPath,
  programRowsPath,
  programRowsReorderPath,
  programsCollectionPath,
  programsDeletedListPath,
} from "../../src/programs-api-paths.js";
import { ProgramsClient } from "../../src/ui/api/programs-client.js";

describe("ProgramsClient (unit)", () => {
  it("GET list uses collection path with optional q", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], matched_code: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.listPrograms("PRG-1");
    expect(fetchFn).toHaveBeenCalledWith(programsCollectionPath("PRG-1"), {
      method: "GET",
    });
  });

  it("POST create sends JSON content-type and body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ program: { program_id: "p1" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.createProgram({ program_id: "p1" });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(PROGRAMS_API_BASE);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      program_id: "p1",
    });
    expect(new Headers((init as RequestInit).headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("DELETE program sends empty JSON object body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ program: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.deleteProgram("prog-1");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programPath("prog-1"));
    expect((init as RequestInit).method).toBe("DELETE");
    expect((init as RequestInit).body).toBe("{}");
  });

  it("POST restore uses restore path", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ program: {} }), { status: 200 }),
      );
    const client = new ProgramsClient({ fetchFn });
    await client.restoreProgram("prog-1");
    expect(fetchFn.mock.calls[0]![0]).toBe(programRestorePath("prog-1"));
  });

  it("GET deleted list path", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const client = new ProgramsClient({ fetchFn });
    await client.listDeletedPrograms();
    expect(fetchFn.mock.calls[0]![0]).toBe(programsDeletedListPath());
  });

  it("POST row uses rows path and body", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ program: {} }), { status: 200 }),
      );
    const client = new ProgramsClient({ fetchFn });
    await client.addExerciseRow("prog-1", {
      row_id: "row-1",
      exercise_id: "ex-1",
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programRowsPath("prog-1"));
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      row_id: "row-1",
      exercise_id: "ex-1",
    });
  });

  it("PATCH reorder sends ordered_row_ids", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ program: {} }), { status: 200 }),
      );
    const client = new ProgramsClient({ fetchFn });
    await client.reorderRows("prog-1", ["a", "b"]);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programRowsReorderPath("prog-1"));
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      ordered_row_ids: ["a", "b"],
    });
  });

  it("POST duplicate sends new_row_id", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ program: {} }), { status: 200 }),
      );
    const client = new ProgramsClient({ fetchFn });
    await client.duplicateRow("prog-1", "row-1", "row-2");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programRowDuplicatePath("prog-1", "row-1"));
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      new_row_id: "row-2",
    });
  });

  it("DELETE row uses row path", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ program: {} }), { status: 200 }),
      );
    const client = new ProgramsClient({ fetchFn });
    await client.deleteRow("prog-1", "row-1");
    expect(fetchFn.mock.calls[0]![0]).toBe(programRowPath("prog-1", "row-1"));
  });
});
