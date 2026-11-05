import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@openlab/protocol";
import {
  CONTROL_TOKEN_REJECTED_MESSAGE,
  controlTokenStorageKey,
  isValidControlToken,
  maskControlToken,
  onControlTokenRejected,
  parseBackendParam,
  readConnectionLink,
  readControlToken,
  writeControlToken,
  type TokenStorage,
} from "./control-token";
import { describeError } from "./errors";

function memoryStorage(): TokenStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const rejected = () =>
  new ApiError(401, "control token missing or invalid", {
    code: 4001,
    detail: "control token missing or invalid",
  });

describe("控制令牌：按后端地址分开保存", () => {
  it("存储键沿用后端地址的归一化口径", () => {
    expect(controlTokenStorageKey(" http://127.0.0.1:8002/ ")).toBe("openlab.controlToken:http://127.0.0.1:8002");
    expect(controlTokenStorageKey("https://lab.example.com/unilab//")).toBe(
      "openlab.controlToken:https://lab.example.com/unilab",
    );
  });

  it("令牌只属于保存它的那个后端；空串即清除", () => {
    const storage = memoryStorage();
    writeControlToken(storage, "http://127.0.0.1:8002/", "  tok-local  ");
    writeControlToken(storage, "http://10.0.0.5:8002", "tok-remote");
    expect(readControlToken(storage, "http://127.0.0.1:8002")).toBe("tok-local");
    expect(readControlToken(storage, "http://10.0.0.5:8002/")).toBe("tok-remote");
    expect(readControlToken(storage, "http://127.0.0.1:8003")).toBe("");

    writeControlToken(storage, "http://127.0.0.1:8002", "");
    expect(readControlToken(storage, "http://127.0.0.1:8002")).toBe("");
    expect([...storage.data.keys()]).toEqual(["openlab.controlToken:http://10.0.0.5:8002"]);
  });

  it("存储里的非法值视为未设置；存储不可用时不抛错", () => {
    const storage = memoryStorage();
    storage.data.set(controlTokenStorageKey("http://127.0.0.1:8002"), "有 空格");
    expect(readControlToken(storage, "http://127.0.0.1:8002")).toBe("");

    const broken: TokenStorage = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    };
    expect(readControlToken(broken, "http://127.0.0.1:8002")).toBe("");
    expect(() => writeControlToken(broken, "http://127.0.0.1:8002", "tok")).not.toThrow();
    expect(() => writeControlToken(broken, "http://127.0.0.1:8002", "")).not.toThrow();
  });

  it("只接受能放进 HTTP 头的令牌", () => {
    expect(isValidControlToken("Zx9_-AbC.~+/=")).toBe(true);
    for (const bad of ["", "has space", "tab\there", "中文令牌", "x".repeat(1025)]) {
      expect(isValidControlToken(bad), bad).toBe(false);
    }
  });

  it("展示只露末 4 位，过短的令牌一位都不露", () => {
    expect(maskControlToken("abcdefghijkl1234")).toBe("••••1234");
    expect(maskControlToken("abcd1234")).toBe("••••");
  });
});

describe("控制令牌：链接导入（?backend=&token=）", () => {
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

  it("两个参数都没有时不处理", () => {
    expect(readConnectionLink({})).toBeNull();
    expect(readConnectionLink({ tab: "materials" })).toBeNull();
  });

  it("取出地址与令牌，其余 query 原样保留", () => {
    expect(
      readConnectionLink({
        backend: "http://127.0.0.1:8002/",
        token: " tok-123 ",
        tab: "materials",
      }),
    ).toEqual({ backend: "http://127.0.0.1:8002", token: "tok-123", query: { tab: "materials" } });
  });

  it("只给令牌时存到当前后端；重复参数取第一个", () => {
    expect(readConnectionLink({ token: ["tok-a", "tok-b"] })).toEqual({ backend: null, token: "tok-a", query: {} });
    expect(readConnectionLink({ backend: ["https://a.example.com", "https://b.example.com"] })).toEqual({
      backend: "https://a.example.com",
      token: null,
      query: {},
    });
  });

  it("后端地址不合法时连令牌一起丢弃，但两个参数仍从地址里去掉", () => {
    expect(readConnectionLink({ backend: "javascript:alert(1)", token: "tok-123", view: "1" })).toEqual({
      backend: null,
      token: null,
      query: { view: "1" },
    });
  });

  it("令牌不合法或为空时不保存，地址照常切换", () => {
    expect(readConnectionLink({ backend: "http://10.0.0.5:8002", token: "带 空格" })).toEqual({
      backend: "http://10.0.0.5:8002",
      token: null,
      query: {},
    });
    expect(readConnectionLink({ token: null })).toEqual({ backend: null, token: null, query: {} });
  });
});

describe("控制令牌：写请求被拒的统一提示", () => {
  it("describeError 给出填写令牌的文案，并对同一个错误只上报一次", () => {
    const listener = vi.fn();
    const stop = onControlTokenRejected(listener);
    try {
      const error = rejected();
      expect(describeError(error)).toBe(CONTROL_TOKEN_REJECTED_MESSAGE);
      expect(describeError(error)).toBe(CONTROL_TOKEN_REJECTED_MESSAGE);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(error);

      describeError(rejected());
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
    describeError(rejected());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("其他 401 与旧后端错误不触发令牌提示", () => {
    const listener = vi.fn();
    const stop = onControlTokenRejected(listener);
    try {
      expect(describeError(new ApiError(401, "unauthorized", { detail: "unauthorized" }))).toBe("HTTP 401：unauthorized");
      expect(describeError(new ApiError(403, "forbidden", { code: 4001 }))).toBe("HTTP 403：forbidden");
      expect(listener).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
