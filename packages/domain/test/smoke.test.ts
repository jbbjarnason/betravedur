import { describe, expect, it } from "vitest";
import { DOMAIN_VERSION } from "../src/index.js";

describe("domain smoke", () => {
  it("exports DOMAIN_VERSION 0.1.0", () => {
    expect(DOMAIN_VERSION).toBe("0.1.0");
  });
});
