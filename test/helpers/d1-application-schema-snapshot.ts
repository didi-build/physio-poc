import { readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

export type ColumnInfo = {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKey: number;
};

export type ForeignKeyInfo = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  onUpdate: string;
  onDelete: string;
  match: string;
};

export type IndexColumnInfo = {
  seqno: number;
  cid: number;
  name: string;
};

export type IndexInfo = {
  name: string;
  unique: boolean;
  origin: string;
  partial: boolean;
  sql: string | null;
  columns: IndexColumnInfo[];
};

export type TableSchema = {
  createSql: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
};

export type ApplicationSchemaSnapshot = Record<string, TableSchema>;

export function normalizeSql(sql: string | null | undefined): string {
  if (sql == null || sql === "") {
    return "";
  }
  return sql.replace(/\s+/g, " ").trim();
}

export function schemasEqual(
  left: ApplicationSchemaSnapshot,
  right: ApplicationSchemaSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mutateSnapshotDropColumn(
  snapshot: ApplicationSchemaSnapshot,
  tableName: string,
  columnName: string,
): ApplicationSchemaSnapshot {
  const table = snapshot[tableName];
  if (!table) {
    throw new Error(`missing table ${tableName}`);
  }
  return {
    ...snapshot,
    [tableName]: {
      ...table,
      columns: table.columns.filter((column) => column.name !== columnName),
    },
  };
}

export function mutateSnapshotChangeColumnType(
  snapshot: ApplicationSchemaSnapshot,
  tableName: string,
  columnName: string,
  type: string,
): ApplicationSchemaSnapshot {
  const table = snapshot[tableName];
  if (!table) {
    throw new Error(`missing table ${tableName}`);
  }
  return {
    ...snapshot,
    [tableName]: {
      ...table,
      columns: table.columns.map((column) =>
        column.name === columnName ? { ...column, type } : column,
      ),
    },
  };
}

export function mutateSnapshotDropIndex(
  snapshot: ApplicationSchemaSnapshot,
  tableName: string,
  indexName: string,
): ApplicationSchemaSnapshot {
  const table = snapshot[tableName];
  if (!table) {
    throw new Error(`missing table ${tableName}`);
  }
  return {
    ...snapshot,
    [tableName]: {
      ...table,
      indexes: table.indexes.filter((index) => index.name !== indexName),
    },
  };
}

type SqlRow = Record<string, unknown>;

function mapColumnInfo(rows: SqlRow[]): ColumnInfo[] {
  return rows.map((row) => ({
    name: String(row.name),
    type: String(row.type),
    notNull: Number(row.notnull) === 1,
    defaultValue: row.dflt_value == null ? null : String(row.dflt_value),
    primaryKey: Number(row.pk),
  }));
}

function mapForeignKeyInfo(rows: SqlRow[]): ForeignKeyInfo[] {
  return rows.map((row) => ({
    id: Number(row.id),
    seq: Number(row.seq),
    table: String(row.table),
    from: String(row.from),
    to: String(row.to),
    onUpdate: String(row.on_update),
    onDelete: String(row.on_delete),
    match: String(row.match),
  }));
}

function mapIndexList(rows: SqlRow[]): Array<Omit<IndexInfo, "sql" | "columns">> {
  return rows.map((row) => ({
    name: String(row.name),
    unique: Number(row.unique) === 1,
    origin: String(row.origin),
    partial: Number(row.partial) === 1,
  }));
}

function mapIndexInfo(rows: SqlRow[]): IndexColumnInfo[] {
  return rows.map((row) => ({
    seqno: Number(row.seqno),
    cid: Number(row.cid),
    name: String(row.name),
  }));
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteSqliteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function resolveLocalD1SqlitePath(persistRoot: string): string {
  const objectDir = join(persistRoot, "v3", "d1", "miniflare-D1DatabaseObject");
  const candidates = readdirSync(objectDir)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(objectDir, name));
  if (candidates.length !== 1) {
    throw new Error(
      `expected one local D1 sqlite file under ${objectDir}, found ${candidates.length}`,
    );
  }
  return candidates[0]!;
}

export function captureApplicationSchemaFromPath(
  dbPath: string,
): ApplicationSchemaSnapshot {
  const db = new Database(dbPath, { readonly: true });
  try {
    const query = (sql: string): SqlRow[] => db.prepare(sql).all() as SqlRow[];

    const tableRows = query(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations' ORDER BY name",
    );

    const snapshot: ApplicationSchemaSnapshot = {};

    for (const row of tableRows) {
      const name = String(row.name);
      const createSql = normalizeSql(row.sql == null ? null : String(row.sql));

      const columns = mapColumnInfo(
        query(`PRAGMA table_info(${quoteSqliteIdentifier(name)})`),
      );
      const foreignKeys = mapForeignKeyInfo(
        query(`PRAGMA foreign_key_list(${quoteSqliteIdentifier(name)})`),
      );

      const indexList = mapIndexList(
        query(`PRAGMA index_list(${quoteSqliteIdentifier(name)})`),
      );
      const indexes: IndexInfo[] = [];
      for (const indexMeta of indexList) {
        if (indexMeta.name.startsWith("sqlite_autoindex_")) {
          continue;
        }
        const indexSqlRows = query(
          `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ${quoteSqliteString(
            indexMeta.name,
          )} LIMIT 1`,
        );
        indexes.push({
          ...indexMeta,
          sql: normalizeSql(
            indexSqlRows[0]?.sql == null ? null : String(indexSqlRows[0].sql),
          ),
          columns: mapIndexInfo(
            query(`PRAGMA index_info(${quoteSqliteIdentifier(indexMeta.name)})`),
          ),
        });
      }

      indexes.sort((a, b) => a.name.localeCompare(b.name));

      snapshot[name] = {
        createSql,
        columns,
        foreignKeys,
        indexes,
      };
    }

    return snapshot;
  } finally {
    db.close();
  }
}

export function listAppliedMigrationNamesFromPath(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .prepare("SELECT name FROM d1_migrations ORDER BY id")
      .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  } finally {
    db.close();
  }
}
