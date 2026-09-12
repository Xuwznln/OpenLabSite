import { describe, expect, it } from "vitest";
import { ApiError } from "@openlab/protocol";
import { isUnsupportedCapability } from "./optional-edge-capability";

describe("optional Edge capability", () => {
  it.each([404, 405, 501])("treats HTTP %s as unsupported", (status) => {
    expect(isUnsupportedCapability(new ApiError(status, "unsupported"))).toBe(true);
  });

  it.each([0, 408, 500, 503])("keeps retrying transient HTTP %s", (status) => {
    expect(isUnsupportedCapability(new ApiError(status, "temporary"))).toBe(false);
  });

  it("does not classify arbitrary errors as missing routes", () => {
    expect(isUnsupportedCapability(new Error("offline"))).toBe(false);
  });
});
