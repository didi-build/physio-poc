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
