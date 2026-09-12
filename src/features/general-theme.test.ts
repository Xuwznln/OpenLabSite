import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDomainThemeStore } from "../stores/domain-theme";

afterEach(() => vi.unstubAllGlobals());
describe("通用版不继承旧学科偏好", () => {
  it.each(["organic", "biology", "materials"])("忽略 %s 的 URL 和存储", (theme) => {
    vi.stubGlobal("location", { href: `https://example.test/?theme=${theme}` });
    vi.stubGlobal("localStorage", { getItem: () => theme });
    setActivePinia(createPinia());
    expect(useDomainThemeStore().activeId).toBe("general");
    expect(useDomainThemeStore().config.shortName).toBe("通用");
  });
});
