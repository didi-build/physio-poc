export const MCP_SAMPLE_SEARCH_EXERCISES_OUTPUT = {
  summary: "No approved exercises matched.",
  share_link: "",
  manage_url: "https://app.example.com/exercises",
  exercises: [],
  search_link: "https://app.example.com/exercises/search?q=missing",
} as const;

export const MCP_SAMPLE_SEARCH_ROUTINES_OUTPUT = {
  summary: "No routines matched.",
  share_link: "",
  manage_url: "https://app.example.com/routines",
  routines: [],
} as const;

export const MCP_SAMPLE_GET_PROGRAM_BUILDER_OUTPUT = {
  summary: "Open the program builder.",
  share_link: "",
  builder_link: "https://app.example.com/programs/PRG-7K3Q",
  manage_url: "https://app.example.com/programs/PRG-7K3Q",
  program_code: "PRG-7K3Q",
} as const;

export const MCP_SAMPLE_GET_PROGRAM_BUILDER_FROM_ROUTINE_OUTPUT = {
  summary: "Open the program builder from a routine.",
  share_link: "",
  builder_link:
    "https://app.example.com/programs/new?from_routine_id=550e8400-e29b-41d4-a716-446655440000",
  manage_url: "https://app.example.com/programs/new",
  from_routine_id: "550e8400-e29b-41d4-a716-446655440000",
} as const;

export const MCP_SAMPLE_GET_PROGRAM_DRAFT_ONLY_OUTPUT = {
  summary: "Draft only; nothing published yet.",
  share_link: "",
  pdf_url: "",
  manage_url: "https://app.example.com/programs/PRG-7K3Q",
  publish_link: "https://app.example.com/programs/PRG-7K3Q/publish",
  manage_link: "https://app.example.com/programs/PRG-7K3Q/share",
  draft: { version: 1, updated_at: "2026-10-29T12:00:00Z" },
  published: null,
} as const;

export const MCP_SAMPLE_GET_PROGRAM_PUBLISHED_OUTPUT = {
  summary: "Published program on file.",
  share_link: "https://app.example.com/l/abc",
  pdf_url: "https://app.example.com/l/abc.pdf",
  manage_url: "https://app.example.com/programs/PRG-7K3Q",
  publish_link: "",
  manage_link: "https://app.example.com/programs/PRG-7K3Q/share",
  expires_at: "2027-10-29T12:00:00Z",
  draft: null,
  published: { version: 2, updated_at: "2026-10-28T12:00:00Z" },
  program_code: "PRG-7K3Q",
} as const;

export const MCP_SAMPLE_GET_PROGRAM_BOTH_OUTPUT = {
  summary: "Published version live; newer draft not published.",
  share_link: "https://app.example.com/l/abc",
  pdf_url: "https://app.example.com/l/abc.pdf",
  manage_url: "https://app.example.com/programs/PRG-7K3Q",
  publish_link: "https://app.example.com/programs/PRG-7K3Q/publish",
  manage_link: "https://app.example.com/programs/PRG-7K3Q/share",
  expires_at: "2027-10-29T12:00:00Z",
  draft: { version: 3, updated_at: "2026-10-29T14:00:00Z" },
  published: { version: 2, updated_at: "2026-10-28T12:00:00Z" },
} as const;
