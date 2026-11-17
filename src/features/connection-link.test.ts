import { describe, expect, it } from "vitest";
import { ApiError } from "@openlab/protocol";
import { parseBackendParam, readConnectionLink } from "./connection-link";
import { describeError } from "./errors";

describe("连接链接导入（?backend=）", () => {
  it("只认 http / https 后端地址，并按统一口径归一", () => {
    expect(parseBackendParam(" http://192.168.1.10:8002/ ")).toBe("http://192.168.1.10:8002");
    expect(parseBackendParam("https://lab.example.com/unilab/")).toBe("https://lab.example.com/unilab");
    for (const bad of [
      "",
      "javascript:alert(1)",
      "ftp://lab.example.com",
      "file:///etc/passwd",
      "127.0.0.1:8002",
      "not a url",
      "http://user:pass@lab.example.com",
      "http://lab.example.com/?x=1",
    ]) {
      expect(parseBackendParam(bad), bad).toBeNull();
    }
  });

  it("没有 backend 参数时不处理", () => {
    expect(readConnectionLink({})).toBeNull();
    expect(readConnectionLink({ tab: "materials" })).toBeNull();
  });

  it("取出地址，其余 query 原样保留；重复参数取第一个", () => {
    expect(readConnectionLink({ backend: "http://127.0.0.1:8002/", tab: "materials" })).toEqual({
      backend: "http://127.0.0.1:8002",
      query: { tab: "materials" },
    });
    expect(readConnectionLink({ backend: ["https://a.example.com", "https://b.example.com"] })).toEqual({
      backend: "https://a.example.com",
      query: {},
    });
  });

  it("地址不合法或为空时不切换，但参数仍从地址里去掉", () => {
    expect(readConnectionLink({ backend: "javascript:alert(1)", view: "1" })).toEqual({ backend: null, query: { view: "1" } });
    expect(readConnectionLink({ backend: null })).toEqual({ backend: null, query: {} });
  });
});

describe("401 不再有令牌提示", () => {
  it("管理 API 不鉴权：401 / 403 按普通 HTTP 错误描述", () => {
    expect(describeError(new ApiError(401, "unauthorized", { code: 1002 }))).toBe("HTTP 401：unauthorized");
    expect(describeError(new ApiError(403, "forbidden", { code: 1002 }))).toBe("HTTP 403：forbidden");
  });
});
