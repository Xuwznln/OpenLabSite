import { describe, expect, it } from "vitest";
import type { DriverPackageCatalog } from "@openlab/protocol";
import {
  DEFAULT_DEVICE_INDEX_URL,
  DEVICE_INDEX_STORAGE_KEY,
  deviceIndexRepoUrl,
  fetchDeviceIndex,
  filterRows,
  mergeCatalog,
  normalizePackageName,
  parseDeviceIndex,
  readDeviceIndexUrl,
  saveDeviceIndexUrl,
} from "./device-index";

const INDEX_URL = "https://raw.githubusercontent.com/Xuwznln/awesome-lab-devices/main/index.json";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

describe("device-index", () => {
  it("默认地址指向 awesome-lab-devices，raw 地址能还原成仓库页", () => {
    expect(DEFAULT_DEVICE_INDEX_URL).toBe(INDEX_URL);
    expect(deviceIndexRepoUrl(INDEX_URL)).toBe("https://github.com/Xuwznln/awesome-lab-devices");
    expect(deviceIndexRepoUrl("https://raw.githubusercontent.com/o/r/dev/index.json")).toBe("https://github.com/o/r/tree/dev");
    expect(deviceIndexRepoUrl("https://mirror.lab/index.json")).toBe("https://mirror.lab/index.json");
  });

  it("地址覆盖存 localStorage，空串 / 默认值即清除", () => {
    const storage = memoryStorage();
    expect(readDeviceIndexUrl(storage)).toBe(DEFAULT_DEVICE_INDEX_URL);
    expect(saveDeviceIndexUrl(" https://mirror.lab/index.json ", storage)).toBe("https://mirror.lab/index.json");
    expect(readDeviceIndexUrl(storage)).toBe("https://mirror.lab/index.json");
    expect(saveDeviceIndexUrl("", storage)).toBe(DEFAULT_DEVICE_INDEX_URL);
    expect(storage.getItem(DEVICE_INDEX_STORAGE_KEY)).toBeNull();
  });

  it("解析索引：官方缺省 official=true，缺 name/spec 的条目丢弃，schema 不认识则拒绝", () => {
    const index = parseDeviceIndex(INDEX_URL, {
      schema: "awesome-lab-devices/v1",
      name: "awesome-lab-devices",
      updated_at: "2026-09-03",
      packages: [
        { name: "site_demo", spec: "git+https://github.com/Xuwznln/LabDeviceSiteDemo.git", version: "0.2.0", devices: ["material_bench_demo"], tags: ["demo"] },
        { name: "community-x", spec: "community-x==1.0", official: false },
        { name: "", spec: "nothing" },
      ],
    });
    expect(index.updatedAt).toBe("2026-09-03");
    expect(index.packages.map((p) => [p.name, p.official])).toEqual([
      ["site_demo", true],
      ["community-x", false],
    ]);
    expect(parseDeviceIndex(INDEX_URL, [{ name: "bare-list", spec: "bare-list" }]).packages).toHaveLength(1);
    expect(() => parseDeviceIndex(INDEX_URL, { schema: "other/v9", packages: [] })).toThrow(/schema/);
    expect(() => parseDeviceIndex(INDEX_URL, { hello: 1 })).toThrow(/packages/);
  });

  it("fetch 失败给出 HTTP 状态", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchDeviceIndex(INDEX_URL, fetchImpl)).rejects.toThrow("HTTP 404");
  });

  it("合并：索引优先于 Edge 目录，installed 以台账为准，-/_ 不敏感", () => {
    const index = parseDeviceIndex(INDEX_URL, {
      packages: [
        { name: "site_demo", spec: "git+https://github.com/Xuwznln/LabDeviceSiteDemo.git", version: "0.2.0" },
        { name: "lock-demo", spec: "git+https://github.com/Xuwznln/LabDeviceLockDemo.git" },
      ],
    });
    const edge: DriverPackageCatalog = {
      sources: [
        { kind: "remote", location: "https://mirror.lab/index.json", ok: false, count: 0, error: "offline" },
        { kind: "local", location: "D:/unilabos_data/driver_package_catalog.json", ok: true, count: 2 },
      ],
      packages: [
        { name: "site-demo", spec: "site-demo==0.1", version: "0.1", description: "", homepage: "", devices: [], tags: [], official: false, source: "local", installed: false },
        { name: "acme-devices", spec: "D:/pkgs/acme", version: "0.1.0", description: "本地包", homepage: "", devices: ["acme_pump_demo"], tags: [], official: false, source: "local", installed: true },
      ],
    };
    const { rows, sources } = mergeCatalog(index, edge, ["lock_demo", "ACME_DEVICES"]);
    expect(rows.map((r) => [r.name, r.source, r.installed])).toEqual([
      ["site_demo", "index", false],
      ["lock-demo", "index", true],
      ["acme-devices", "edge-local", true],
    ]);
    expect(rows[0].spec).toBe("git+https://github.com/Xuwznln/LabDeviceSiteDemo.git");
    expect(sources).toEqual([
      { kind: "edge-remote", location: "https://mirror.lab/index.json", ok: false, count: 0, error: "offline", missing: undefined },
      { kind: "edge-local", location: "D:/unilabos_data/driver_package_catalog.json", ok: true, count: 2, error: undefined, missing: undefined },
    ]);
    expect(filterRows(rows, "pump").map((r) => r.name)).toEqual(["acme-devices"]);
    expect(filterRows(rows, "LOCK").map((r) => r.name)).toEqual(["lock-demo"]);
    expect(normalizePackageName("Lock-Demo")).toBe("lock_demo");
  });
});
