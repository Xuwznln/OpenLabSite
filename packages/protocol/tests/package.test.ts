/**
 * 发包形态守护：版本常量与 package.json 一致、公开入口齐全、目录与 conventions 的硬约束不漂移。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPERATIONS } from "../src/catalog";
import { OPENLAB_API_PREFIX, OPENLAB_PROTOCOL_VERSION } from "../src/common";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
  name: string;
  license: string;
  repository: { url: string; directory: string };
  bugs: { url: string };
  type: string;
  exports: Record<string, unknown>;
  files: string[];
  publishConfig?: { access?: string };
  scripts: Record<string, string>;
};

describe("@openlab/protocol 发包形态", () => {
  it("SDK 元数据、双语文档和许可证完整", () => {
    expect(pkg.name).toBe("@openlab/protocol");
    expect(pkg.license).toBe("Apache-2.0");
    expect(pkg.repository.url).toBe("git+https://github.com/Xuwznln/OpenLabSite.git");
    expect(pkg.repository.directory).toBe("packages/protocol");
    expect(pkg.bugs.url).toBe("https://github.com/Xuwznln/OpenLabSite/issues");
    expect(pkg.files).toEqual(expect.arrayContaining(["LICENSE", "README.zh-CN.md", "CHANGELOG.md"]));
    const license = readFileSync(new URL("../LICENSE", import.meta.url), "utf8").replace(/\r\n/g, "\n").trim();
    expect(license).toBe(readFileSync(new URL("../../../LICENSE", import.meta.url), "utf8").replace(/\r\n/g, "\n").trim());
    for (const file of ["README.md", "README.zh-CN.md"]) {
      const readme = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(readme).toContain("OpenLab TypeScript SDK");
      expect(readme).not.toContain("github.com/Xuwznln/OpenLab/");
    }
  });
  it("OPENLAB_PROTOCOL_VERSION 与 package.json 版本一致", () => {
    expect(OPENLAB_PROTOCOL_VERSION).toBe(pkg.version);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });

  it("ESM 包公开入口固定：主入口、目录、OpenAPI 类型与快照、package.json", () => {
    expect(pkg.type).toBe("module");
    expect(Object.keys(pkg.exports).sort()).toEqual([".", "./catalog", "./openapi", "./openapi.json", "./package.json"]);
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "openapi"]));
    expect(pkg.publishConfig?.access).toBe("public");
    expect(pkg.scripts.prepack).toContain("check");
  });

  it("OpenAPI 快照是契约全集导出，且前缀 / SSE 与常量一致", () => {
    const snapshot = JSON.parse(readFileSync(new URL("../openapi/unilabos-openapi.json", import.meta.url), "utf8")) as {
      info: { version: string; "x-openlab-protocol": { api_version: string; api_prefix: string; sse: string[] } };
      paths: Record<string, Record<string, { "x-openlab-role"?: string }>>;
    };
    const meta = snapshot.info["x-openlab-protocol"];
    expect(meta.api_version).toBe("v1");
    expect(meta.api_prefix).toBe(OPENLAB_API_PREFIX);
    expect(meta.sse).toEqual(OPERATIONS.filter((op) => op.method === "SSE").map((op) => op.path));
    for (const [path, item] of Object.entries(snapshot.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
          expect(operation["x-openlab-role"], `${method} ${path}`).toMatch(/^(host|backend|any)$/);
        }
      }
    }
  });

  it("目录全部落在 /api/v1 前缀下，id 按 <domain>.<resource>[.<action>] 命名", () => {
    for (const operation of OPERATIONS) {
      expect(operation.path.startsWith(`${OPENLAB_API_PREFIX}/`)).toBe(true);
      expect(operation.id).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      expect(operation.id.startsWith(`${operation.domain}.`)).toBe(true);
    }
  });

  it("路径命名：集合 kebab-case 复数，路径参数 snake_case 且带类型后缀", () => {
    const paramNames = new Set<string>();
    for (const operation of OPERATIONS) {
      for (const segment of operation.path.split("/").filter(Boolean)) {
        if (segment.startsWith("{")) {
          expect(segment).toMatch(/^\{[a-z][a-z0-9_]*\}$/);
          paramNames.add(segment.slice(1, -1));
        } else {
          expect(segment).toMatch(/^[a-z0-9][a-z0-9-]*$/);
        }
      }
    }
    // 权威分配的身份用 *_uuid；人可读键允许 id / name / 领域名词
    for (const name of paramNames) {
      expect(name).toMatch(/(_uuid|_id|^name$|^identity$|^version$|^database$|^table$|^resource_id$|^graph_name$)$/);
    }
  });
});
