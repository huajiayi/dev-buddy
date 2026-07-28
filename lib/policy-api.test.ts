import { describe, expect, it } from "vitest";
import { parsePolicyApiInput, PolicyApiInputError } from "./policy-api";

describe("parsePolicyApiInput", () => {
  it("accepts a bounded policy", () => {
    expect(parsePolicyApiInput({
      name: "Allow uptime",
      pattern: "^uptime$",
      action: "allow",
      priority: 50,
    })).toEqual({
      name: "Allow uptime",
      pattern: "^uptime$",
      action: "allow",
      priority: 50,
      enabled: true,
    });
  });

  it("rejects invalid regex and priority", () => {
    expect(() => parsePolicyApiInput({
      name: "bad", pattern: "[", action: "deny", priority: 10,
    })).toThrow(PolicyApiInputError);
    expect(() => parsePolicyApiInput({
      name: "bad", pattern: "^x$", action: "deny", priority: 0,
    })).toThrow("priority");
  });
});
