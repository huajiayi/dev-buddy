import packageJson from "../package.json";
import skillManifest from "../.agents/skills/dev-buddy/skill-manifest.json";

export type DevBuddyVersionInfo = {
  serverVersion: string;
  apiVersion: string;
  recommendedSkillVersion: string;
  minSkillVersion: string;
  skillSourceUrl: string;
  buildCommit: string | null;
};

export type SkillCompatibility =
  | { status: "unknown"; clientVersion: null }
  | { status: "invalid"; clientVersion: string }
  | { status: "update-required"; clientVersion: string }
  | { status: "update-available"; clientVersion: string }
  | { status: "current"; clientVersion: string }
  | { status: "server-older"; clientVersion: string };

const SEMANTIC_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemanticVersion(value: string): [number, number, number] | null {
  const match = SEMANTIC_VERSION.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareSemanticVersions(left: string, right: string) {
  const leftParts = parseSemanticVersion(left);
  const rightParts = parseSemanticVersion(right);
  if (!leftParts || !rightParts) throw new Error(`无效的语义化版本：${!leftParts ? left : right}`);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;
  }
  return 0;
}

export function readSkillClientVersion(explicitVersion: string | null, userAgent: string | null) {
  const explicit = explicitVersion?.trim();
  if (explicit) return explicit;
  const match = /(?:^|\s)dev-buddy-skill\/([0-9]+\.[0-9]+(?:\.[0-9]+)?)(?:\s|$)/i.exec(userAgent || "");
  if (!match) return null;
  return match[1].split(".").length === 2 ? `${match[1]}.0` : match[1];
}

export function getDevBuddyVersionInfo(): DevBuddyVersionInfo {
  const rawCommit = (
    process.env.DEV_BUDDY_BUILD_COMMIT
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GITHUB_SHA
    || ""
  ).trim();
  return {
    serverVersion: packageJson.version,
    apiVersion: skillManifest.apiVersion,
    recommendedSkillVersion: skillManifest.version,
    minSkillVersion: skillManifest.minCompatibleVersion,
    skillSourceUrl: skillManifest.sourceUrl,
    buildCommit: rawCommit ? rawCommit.slice(0, 12) : null,
  };
}

export function evaluateSkillCompatibility(clientVersion: string | null): SkillCompatibility {
  if (!clientVersion) return { status: "unknown", clientVersion: null };
  if (!parseSemanticVersion(clientVersion)) return { status: "invalid", clientVersion };
  const version = getDevBuddyVersionInfo();
  if (compareSemanticVersions(clientVersion, version.minSkillVersion) < 0) {
    return { status: "update-required", clientVersion };
  }
  const latestComparison = compareSemanticVersions(clientVersion, version.recommendedSkillVersion);
  if (latestComparison < 0) return { status: "update-available", clientVersion };
  if (latestComparison > 0) return { status: "server-older", clientVersion };
  return { status: "current", clientVersion };
}
