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

function assertJsonWrite(
  init: RequestInit | undefined,
  method: string,
  expectedBody: unknown,
): void {
  expect(init?.method).toBe(method);
  expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  expect(JSON.parse(String(init?.body))).toEqual(expectedBody);
}

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
    const [, init] = fetchFn.mock.calls[0]!;
    expect(fetchFn.mock.calls[0]![0]).toBe(PROGRAMS_API_BASE);
    assertJsonWrite(init as RequestInit, "POST", { program_id: "p1" });
  });

  it("PATCH name sends JSON content-type and body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ program: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.updateProgramName("prog-1", "Knee program A");
    const [, init] = fetchFn.mock.calls[0]!;
    expect(fetchFn.mock.calls[0]![0]).toBe(programPath("prog-1"));
    assertJsonWrite(init as RequestInit, "PATCH", { name: "Knee program A" });
  });

  it("DELETE program sends empty JSON object body and content-type", async () => {
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
    assertJsonWrite(init as RequestInit, "DELETE", {});
  });

  it("POST restore sends JSON content-type and empty body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ program: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.restoreProgram("prog-1");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programRestorePath("prog-1"));
    assertJsonWrite(init as RequestInit, "POST", {});
  });

  it("GET deleted list path", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const client = new ProgramsClient({ fetchFn });
    await client.listDeletedPrograms();
    expect(fetchFn.mock.calls[0]![0]).toBe(programsDeletedListPath());
  });

  it("POST row uses rows path, content-type, and body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ program: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.addExerciseRow("prog-1", {
      row_id: "row-1",
      exercise_id: "ex-1",
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programRowsPath("prog-1"));
    assertJsonWrite(init as RequestInit, "POST", {
      row_id: "row-1",
      exercise_id: "ex-1",
    });
  });

  it("PATCH reorder sends content-type and ordered_row_ids", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ program: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.reorderRows("prog-1", ["a", "b"]);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programRowsReorderPath("prog-1"));
    assertJsonWrite(init as RequestInit, "PATCH", { ordered_row_ids: ["a", "b"] });
  });

  it("POST duplicate sends content-type and new_row_id", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ program: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.duplicateRow("prog-1", "row-1", "row-2");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programRowDuplicatePath("prog-1", "row-1"));
    assertJsonWrite(init as RequestInit, "POST", { new_row_id: "row-2" });
  });

  it("DELETE row sends content-type and empty JSON body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ program: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ProgramsClient({ fetchFn });
    await client.deleteRow("prog-1", "row-1");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(programRowPath("prog-1", "row-1"));
    assertJsonWrite(init as RequestInit, "DELETE", {});
  });
});
