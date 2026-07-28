import { describe, expect, it } from "vitest";
import {
  compareSemanticVersions,
  evaluateSkillCompatibility,
  getDevBuddyVersionInfo,
  parseSemanticVersion,
  readSkillClientVersion,
} from "./dev-buddy-version";

describe("Dev Buddy version compatibility", () => {
  it("parses and compares strict semantic versions", () => {
    expect(parseSemanticVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemanticVersion("v1.2.3")).toBeNull();
    expect(compareSemanticVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareSemanticVersions("1.1.0", "1.1.0")).toBe(0);
  });

  it("prefers the explicit Skill version header and falls back to the legacy user agent", () => {
    expect(readSkillClientVersion("1.1.0", "dev-buddy-skill/1.0.0")).toBe("1.1.0");
    expect(readSkillClientVersion(null, "dev-buddy-skill/1.0.0")).toBe("1.0.0");
    expect(readSkillClientVersion(null, "dev-buddy-skill/1.0")).toBe("1.0.0");
    expect(readSkillClientVersion(null, "curl/8.0")).toBeNull();
  });

  it("requires an update for the legacy Skill and accepts the manifest version", () => {
    const version = getDevBuddyVersionInfo();
    expect(evaluateSkillCompatibility("1.0.0").status).toBe("update-required");
    expect(evaluateSkillCompatibility(version.recommendedSkillVersion).status).toBe("current");
    expect(evaluateSkillCompatibility(null).status).toBe("unknown");
  });
});
