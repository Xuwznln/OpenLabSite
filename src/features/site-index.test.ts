import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_INDEX_URL,
  fetchSiteIndex,
  isSameDeployment,
  parseSiteIndex,
  siteDeploymentKey,
  siteEntryHref,
  siteEntryTheme,
  siteIndexRepoUrl,
} from "./site-index";

const INDEX_URL = "https://raw.githubusercontent.com/Xuwznln/awesome-lab-sites/main/index.json";
const SITE = "https://xuwznln.github.io/OpenLab-site/";

describe("site-index", () => {
  it("默认地址指向 awesome-lab-sites，raw 地址能还原成仓库页", () => {
    expect(DEFAULT_SITE_INDEX_URL).toBe(INDEX_URL);
    expect(siteIndexRepoUrl(INDEX_URL)).toBe("https://github.com/Xuwznln/awesome-lab-sites");
  });

  it("解析索引：官方缺省 official=true，非 https / 缺 id / 重复 id 的条目丢弃，schema 不认识则拒绝", () => {
    const index = parseSiteIndex(INDEX_URL, {
      schema: "awesome-lab-sites/v1",
      name: "awesome-lab-sites",
      updated_at: "2026-09-04",
      sites: [
        { id: "openlab", name: "OpenLab", url: SITE, description: "通用", theme: "general", tags: ["general"] },
        { id: "openlab-organic", name: "OpenLab · 有机合成", url: `${SITE}?theme=organic`, description: "有机", theme: "organic" },
        { id: "openlab", name: "dup", url: "https://dup.example/", description: "重复 id" },
        { id: "community", name: "Community", url: "https://lab.example/ui/", description: "社区", official: false },
        { id: "plain-http", name: "x", url: "http://insecure.example/", description: "不是 https" },
        { name: "no-id", url: "https://noid.example/", description: "缺 id" },
      ],
    });
    expect(index.updatedAt).toBe("2026-09-04");
    expect(index.sites.map((s) => [s.id, s.official, s.protocol])).toEqual([
      ["openlab", true, "runtime.v1"],
      ["openlab-organic", true, "runtime.v1"],
      ["community", false, "runtime.v1"],
    ]);
    expect(parseSiteIndex(INDEX_URL, [{ id: "bare", url: "https://bare.example/" }]).sites).toHaveLength(1);
    expect(() => parseSiteIndex(INDEX_URL, { schema: "awesome-lab-devices/v1", sites: [] })).toThrow(/schema/);
    expect(() => parseSiteIndex(INDEX_URL, { hello: 1 })).toThrow(/sites/);
  });

  it("fetch 失败给出 HTTP 状态", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchSiteIndex(INDEX_URL, fetchImpl)).rejects.toThrow("HTTP 404");
  });

  it("同一部署的多个主题入口共享部署身份，靠 ?theme 区分", () => {
    expect(siteEntryTheme(`${SITE}?theme=organic`)).toBe("organic");
    expect(siteEntryTheme(SITE)).toBe("");
    expect(siteEntryTheme("not a url")).toBe("");
    expect(siteDeploymentKey(`${SITE}?theme=organic#/devices`)).toBe(SITE.toLowerCase());
    expect(siteDeploymentKey("https://XUWZNLN.github.io/OpenLab-site/index.html#/")).toBe(SITE.toLowerCase());
    expect(siteDeploymentKey("https://lab.example/ui")).toBe("https://lab.example/ui/");
    expect(isSameDeployment(`${SITE}?theme=biology`, `${SITE}#/inventory`)).toBe(true);
    expect(isSameDeployment("https://lab.example/ui/", `${SITE}#/inventory`)).toBe(false);
  });

  it("打开站点时带上当前 hash 路由，条目自带 hash 则不覆盖", () => {
    expect(siteEntryHref(`${SITE}?theme=organic`, `${SITE}#/devices`)).toBe(`${SITE}?theme=organic#/devices`);
    expect(siteEntryHref(`${SITE}#/console`, `${SITE}#/devices`)).toBe(`${SITE}#/console`);
    expect(siteEntryHref(SITE, SITE)).toBe(SITE);
    expect(siteEntryHref("not a url", SITE)).toBe("not a url");
  });
});
