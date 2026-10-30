import type { JsonSchema } from "../src/mcp-connector/index.js";

export const SCHEMA_WALK_KEYS = [
  "properties",
  "items",
  "prefixItems",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "$defs",
  "definitions",
  "dependentSchemas",
] as const;

const URL_LIKE_FORMATS = new Set([
  "uri",
  "uri-reference",
  "iri",
  "iri-reference",
  "url",
]);

const URL_LIKE_INPUT_PROPERTY = /url|uri|link|href|base/i;

export function visitSchemaNodes(
  schema: unknown,
  visit: (node: JsonSchema) => void,
): void {
  if (!schema || typeof schema !== "object") return;
  const node = schema as JsonSchema;
  visit(node);

  for (const key of SCHEMA_WALK_KEYS) {
    const branch = node[key];
    if (Array.isArray(branch)) {
      for (const sub of branch) visitSchemaNodes(sub, visit);
    } else if (branch && typeof branch === "object") {
      if (key === "properties" || key === "dependentSchemas") {
        for (const sub of Object.values(branch as Record<string, unknown>)) {
          visitSchemaNodes(sub, visit);
        }
      } else {
        visitSchemaNodes(branch, visit);
      }
    }
  }

  const additional = node.additionalProperties;
  if (additional && typeof additional === "object") {
    visitSchemaNodes(additional, visit);
  }
}

export function collectInputUrlLikeViolations(schema: JsonSchema): string[] {
  const violations: string[] = [];

  visitSchemaNodes(schema, (node) => {
    const format = node.format;
    if (typeof format === "string" && URL_LIKE_FORMATS.has(format)) {
      violations.push(`format:${format}`);
    }
    const pattern = node.pattern;
    if (typeof pattern === "string" && /http/i.test(pattern)) {
      violations.push(`pattern:${pattern}`);
    }
    const props = node.properties;
    if (props && typeof props === "object") {
      for (const key of Object.keys(props as Record<string, unknown>)) {
        if (URL_LIKE_INPUT_PROPERTY.test(key)) {
          violations.push(`property:${key}`);
        }
      }
    }
  });

  return violations;
}

const FORBIDDEN_LEGACY_SCHEMA_PROPERTY_NAMES = new Set([
  "expires_in",
  "custom_date",
  "exercises_not_found",
]);

const PATIENT_FIXTURE_NAME =
  /\b(?:Jane|John|Maria)\s+(?:Doe|Smith|Lopez)\b|\bpatient\s+name\s*:/i;

const SURNAME_LIKE = new Set([
  "Adams",
  "Allen",
  "Anderson",
  "Bailey",
  "Baker",
  "Bell",
  "Bennett",
  "Brooks",
  "Brown",
  "Butler",
  "Campbell",
  "Carter",
  "Clark",
  "Collins",
  "Cook",
  "Cooper",
  "Cox",
  "Cruz",
  "Davis",
  "Diaz",
  "Doe",
  "Edwards",
  "Evans",
  "Fisher",
  "Flores",
  "Foster",
  "Garcia",
  "Gomez",
  "Gray",
  "Green",
  "Hall",
  "Harris",
  "Hill",
  "Howard",
  "Hughes",
  "Jackson",
  "James",
  "Jenkins",
  "Johnson",
  "Jones",
  "Kelly",
  "King",
  "Lee",
  "Lewis",
  "Long",
  "Lopez",
  "Martin",
  "Martinez",
  "Miller",
  "Mitchell",
  "Moore",
  "Morgan",
  "Morales",
  "Murphy",
  "Myers",
  "Nelson",
  "Nguyen",
  "Ortiz",
  "Parker",
  "Perry",
  "Peterson",
  "Phillips",
  "Powell",
  "Price",
  "Ramirez",
  "Reed",
  "Reyes",
  "Richardson",
  "Rivera",
  "Roberts",
  "Rodgers",
  "Rogers",
  "Ross",
  "Russell",
  "Sanders",
  "Scott",
  "Smith",
  "Stewart",
  "Sullivan",
  "Taylor",
  "Thomas",
  "Thompson",
  "Torres",
  "Turner",
  "Walker",
  "Ward",
  "Watson",
  "White",
  "Williams",
  "Wilson",
  "Wood",
  "Wright",
  "Young",
]);

const capitalizedNameWithKnownSurname = new RegExp(
  `\\b([A-Z][a-z]{2,})\\s+(${Array.from(SURNAME_LIKE).join("|")})\\b`,
  "g",
);

export function collectSchemaPropertyNames(schema: JsonSchema): Set<string> {
  const names = new Set<string>();
  visitSchemaNodes(schema, (node) => {
    const props = node.properties;
    if (props && typeof props === "object") {
      for (const key of Object.keys(props as Record<string, unknown>)) {
        names.add(key);
      }
    }
  });
  return names;
}

export function collectForbiddenLegacySchemaFields(schema: JsonSchema): string[] {
  const hits: string[] = [];
  visitSchemaNodes(schema, (node) => {
    const props = node.properties;
    if (props && typeof props === "object") {
      for (const key of Object.keys(props as Record<string, unknown>)) {
        if (FORBIDDEN_LEGACY_SCHEMA_PROPERTY_NAMES.has(key)) {
          hits.push(`property:${key}`);
        }
      }
    }
    if (node.format === "date") {
      hits.push("format:date");
    }
  });
  return hits;
}

export function collectPatientLikeDescriptionViolations(text: string): string[] {
  const violations: string[] = [];
  if (PATIENT_FIXTURE_NAME.test(text)) {
    violations.push("fixture-patient-name");
  }

  capitalizedNameWithKnownSurname.lastIndex = 0;
  let surnameMatch: RegExpExecArray | null;
  while ((surnameMatch = capitalizedNameWithKnownSurname.exec(text)) !== null) {
    const pair = `${surnameMatch[1]} ${surnameMatch[2]}`;
    violations.push(`capitalized-pair:${pair}`);
  }

  return violations;
}

export function collectSchemaDescriptionViolations(schema: JsonSchema): string[] {
  const violations: string[] = [];
  visitSchemaNodes(schema, (node) => {
    const description = node.description;
    if (typeof description === "string") {
      violations.push(...collectPatientLikeDescriptionViolations(description));
    }
  });
  return violations;
}

export function findSchemaAtPath(
  root: JsonSchema,
  path: string[],
): JsonSchema | undefined {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    const node = current as JsonSchema;
    if (segment === "items") {
      current = node.items;
      continue;
    }
    const props = node.properties as Record<string, JsonSchema> | undefined;
    if (!props || !(segment in props)) return undefined;
    current = props[segment];
  }
  return current as JsonSchema | undefined;
}
