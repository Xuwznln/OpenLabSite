#!/usr/bin/env node
/**
 * 同步微后端 OpenAPI 契约快照并重新生成类型。
 *
 *   pnpm --filter @openlab/protocol openapi:sync                 # 调用 Uni-Lab-OS 的离线导出器
 *   pnpm --filter @openlab/protocol openapi:sync -- --file x.json # 用已导出的文件
 *   pnpm --filter @openlab/protocol openapi:types                # 只按当前快照重生成类型
 *
 * 导出器：`python -m unilabos.server.openapi_export`（两种角色的路由全集，带 x-openlab-role）。
 * 解释器按 --python / $UNILABOS_PYTHON / python 依次取；conda 环境可写
 * `--python "mamba run -n unilab-dev-jazzy python"`。
 *
 * 运行中进程的 GET /api/openapi.json 只有当前角色的路由、也没有角色标注，不能当快照用。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = resolve(root, "openapi/unilabos-openapi.json");
const GENERATED = resolve(root, "src/generated/openapi.ts");

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const typesOnly = args.includes("--types-only");

if (!typesOnly) {
  const file = flag("--file");
  if (file) {
    const document = JSON.parse(readFileSync(resolve(file), "utf8"));
    assertContractDocument(document);
    writeSnapshot(document);
  } else {
    const python = (flag("--python") ?? process.env.UNILABOS_PYTHON ?? "python").split(" ").filter(Boolean);
    const [command, ...prefix] = python;
    const output = execFileSync(command, [...prefix, "-m", "unilabos.server.openapi_export", "--output", "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    });
    const document = JSON.parse(output.slice(output.indexOf("{")));
    assertContractDocument(document);
    writeSnapshot(document);
  }
}

const ast = await openapiTS(pathToFileURL(SNAPSHOT), { alphabetize: true, exportType: true });
const banner = `// 由 scripts/sync-openapi.mjs 从 openapi/unilabos-openapi.json 生成，勿手改。\n// 重新生成：pnpm --filter @openlab/protocol openapi:types\n\n`;
mkdirSync(dirname(GENERATED), { recursive: true });
writeFileSync(GENERATED, banner + astToString(ast), "utf8");

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const operations = Object.values(snapshot.paths).reduce(
  (count, item) => count + Object.keys(item).filter((method) => ["get", "post", "put", "patch", "delete"].includes(method)).length,
  0,
);
console.log(
  `OpenAPI snapshot: unilabos ${snapshot.info.version}, ${Object.keys(snapshot.paths).length} paths / ${operations} operations → ${GENERATED.replace(root, ".")}`,
);

function assertContractDocument(document) {
  const meta = document?.info?.["x-openlab-protocol"];
  if (!meta || meta.api_version !== "v1") {
    throw new Error("不是契约全集：缺少 info.x-openlab-protocol（请用 python -m unilabos.server.openapi_export 导出，而不是进程的 /api/openapi.json）");
  }
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (["get", "post", "put", "patch", "delete"].includes(method) && !operation["x-openlab-role"]) {
        throw new Error(`${method.toUpperCase()} ${path} 缺少 x-openlab-role`);
      }
    }
  }
}

function writeSnapshot(document) {
  mkdirSync(dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, JSON.stringify(document, null, 2) + "\n", "utf8");
}
