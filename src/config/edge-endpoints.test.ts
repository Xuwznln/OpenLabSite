import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_EDGE_URL, initialBackendUrl } from "./edge-endpoints";

describe("local-first backend selection", () => {
  it("defaults to local port 8002", () => {
    expect(initialBackendUrl(null, DEFAULT_LOCAL_EDGE_URL, false)).toBe("http://127.0.0.1:8002");
    expect(initialBackendUrl(" ", DEFAULT_LOCAL_EDGE_URL, true)).toBe(DEFAULT_LOCAL_EDGE_URL);
  });

  it("migrates public demo selections once", () => {
    for (const url of ["https://edge.whalent.com/", "http://140.143.251.219:28005"]) {
      expect(initialBackendUrl(url, DEFAULT_LOCAL_EDGE_URL, false)).toBe(DEFAULT_LOCAL_EDGE_URL);
    }
    expect(initialBackendUrl("https://edge.whalent.com/", DEFAULT_LOCAL_EDGE_URL, true))
      .toBe("https://edge.whalent.com");
  });

  it("preserves a custom Edge endpoint while removing trailing slashes", () => {
    expect(initialBackendUrl("https://edge.example.test///", DEFAULT_LOCAL_EDGE_URL, false))
      .toBe("https://edge.example.test");
    expect(initialBackendUrl("http://127.0.0.1:6005", DEFAULT_LOCAL_EDGE_URL, false))
      .toBe("http://127.0.0.1:6005");
    expect(initialBackendUrl(null, "https://custom.test", false)).toBe("https://custom.test");
  });
});
