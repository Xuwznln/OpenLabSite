import { describe, expect, it } from "vitest";
import { DEFAULT_LAB_THEME_ID, LAB_THEME_IDS, LAB_THEMES, isLabThemeId } from "./domain-themes";

describe("领域主题完整性（四模式）", () => {
  it("包含通用模式与三个领域", () => {
    expect(LAB_THEME_IDS).toEqual(["general", "organic", "biology", "materials"]);
    expect(isLabThemeId("general")).toBe(true);
  });

  it("首次进入默认是通用，而不是某个学科", () => {
    expect(DEFAULT_LAB_THEME_ID).toBe("general");
    expect(LAB_THEMES[DEFAULT_LAB_THEME_ID].shortName).toBe("通用");
  });

  it("每个主题的导航词条完整且非空", () => {
    const navKeys = [
      "console",
      "lab",
      "workflows",
      "timeline",
      "monitor",
      "editor",
      "inventory",
      "devices",
      "toolkit",
      "entities",
      "history",
      "registry",
      "system",
      "logs",
      "error-decisions",
      "status-incidents",
    ] as const;
    for (const id of LAB_THEME_IDS) {
      const theme = LAB_THEMES[id];
      expect(theme.id).toBe(id);
      for (const key of navKeys) {
        expect(theme.nav[key], `${id}.nav.${key}`).toBeTruthy();
      }
      expect(theme.highlights).toHaveLength(3);
      expect(theme.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("workflows 词条各模式统一为「实验流程」", () => {
    for (const id of LAB_THEME_IDS) {
      expect(LAB_THEMES[id].nav.workflows).toBe("实验流程");
    }
  });
});
