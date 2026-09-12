/**
 * 四库只读浏览（debug 域，unilabos/server/api/debug.py）。
 *
 * 微后端把 runtime / materials / telemetry / history 四个 SQLite 文件以
 * `mode=ro` 短连接暴露为分页行浏览：没有 SQL 入口、没有写路径，BLOB 列只回长度
 * 占位。这是数据库调试面板的唯一数据源，表清单来自实时 `sqlite_master`，
 * 前端不再维护静态表清单。
 */
import type { HttpTransport, JsonValue } from "./common.js";

export type ServerDatabaseKey = "runtime" | "materials" | "telemetry" | "history";

export const SERVER_DATABASE_KEYS: readonly ServerDatabaseKey[] = [
  "runtime",
  "materials",
  "telemetry",
  "history",
];

export interface DebugTableSummary {
  name: string;
  rows: number;
}

export interface DebugDatabaseSummary {
  database: ServerDatabaseKey | (string & {});
  path: string;
  exists: boolean;
  size_bytes?: number;
  tables?: DebugTableSummary[];
}

export interface DebugDatabasesResponse {
  root: string;
  databases: DebugDatabaseSummary[];
}

export interface DebugColumn {
  name: string;
  type: string;
  pk: boolean;
}

export type DebugRow = Record<string, JsonValue>;

export interface DebugTablePage {
  database: string;
  table: string;
  columns: DebugColumn[];
  total_rows: number;
  limit: number;
  offset: number;
  rows: DebugRow[];
}

export interface DebugTableQuery {
  limit?: number;
  offset?: number;
  /** 排序列名；缺省按 rowid 倒序（最新写入在前）。 */
  order?: string;
  descending?: boolean;
}

export function createDebugApi(http: HttpTransport) {
  return {
    /** GET /api/v1/debug/databases —— 四库文件状态与每张表行数 */
    databases: () =>
      http.request<DebugDatabasesResponse>({ method: "GET", path: "/api/v1/debug/databases" }),
    /** GET /api/v1/debug/databases/{database}/tables/{table} —— 单表分页浏览 */
    table: (database: string, table: string, query: DebugTableQuery = {}) =>
      http.request<DebugTablePage>({
        method: "GET",
        path: `/api/v1/debug/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}`,
        params: {
          limit: query.limit,
          offset: query.offset,
          order: query.order,
          descending:
            query.descending === undefined ? undefined : query.descending ? "true" : "false",
        },
      }),
  };
}

export type DebugApi = ReturnType<typeof createDebugApi>;
