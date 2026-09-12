import { describe, expect, it } from "vitest";
import {
  LOCAL_DEMO_EDGE_URL,
  migrateDemoEdgeUrl,
  PUBLIC_DEMO_EDGE_URL,
} from "./edge-endpoints";

describe("demo Edge endpoint migration", () => {
  it("migrates the previous public IP endpoint to trusted HTTPS", () => {
    expect(migrateDemoEdgeUrl("http://140.143.251.219:28005/"))
      .toBe(PUBLIC_DEMO_EDGE_URL);
  });

  it("moves the previous local demo port to 6005", () => {
    expect(migrateDemoEdgeUrl("http://127.0.0.1:28005"))
      .toBe(LOCAL_DEMO_EDGE_URL);
  });

  it("preserves a custom Edge endpoint while removing trailing slashes", () => {
    expect(migrateDemoEdgeUrl("https://edge.example.test///"))
      .toBe("https://edge.example.test");
  });
});
