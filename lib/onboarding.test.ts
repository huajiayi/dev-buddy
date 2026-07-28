import { describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
  isAdvancedOnboardingReady,
  onboardingProgress,
  type OnboardingSignals,
} from "./onboarding";

const completeSignals: OnboardingSignals = {
  hasSecurityBaseline: true,
  hasEnabledServer: true,
  hasAnyResource: true,
  hasOperator: true,
  hasOperatorGrant: true,
  hasApiKey: true,
  hasAgentConnection: true,
  hasFirstCheck: true,
};

describe("onboarding", () => {
  it("builds an administrator setup path", () => {
    const steps = buildOnboardingSteps("admin", completeSignals);
    expect(steps.map((step) => step.key)).toEqual([
      "security",
      "server",
      "first-check",
      "operator",
      "agent",
    ]);
    expect(onboardingProgress(steps)).toEqual({ completed: 5, total: 5, percent: 100 });
  });

  it("builds an operator first-task path", () => {
    const steps = buildOnboardingSteps("operator", {
      ...completeSignals,
      hasApiKey: false,
      hasAgentConnection: false,
    });
    expect(steps.map((step) => step.key)).toEqual([
      "resource",
      "first-check",
      "api-key",
      "agent",
    ]);
    expect(onboardingProgress(steps)).toEqual({ completed: 2, total: 4, percent: 50 });
  });

  it("requires real Agent usage before advanced onboarding is ready", () => {
    expect(isAdvancedOnboardingReady({
      ...completeSignals,
      hasAgentConnection: false,
    })).toBe(false);
    expect(isAdvancedOnboardingReady(completeSignals)).toBe(true);
  });
});
