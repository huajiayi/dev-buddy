import { describe, expect, it } from "vitest";
import { confirmationRequired, CONFIRMATION_HEADER } from "./api-confirmation";

describe("confirmationRequired", () => {
  it("accepts only the exact action", () => {
    const request = { headers: new Headers({ [CONFIRMATION_HEADER]: "delete-server" }) };
    expect(confirmationRequired(request, "delete-server")).toBeNull();
    expect(confirmationRequired(request, "delete-database")?.status).toBe(428);
  });

  it("requires a confirmation header", async () => {
    const response = confirmationRequired({ headers: new Headers() }, "start-managed-session");
    expect(response?.status).toBe(428);
    expect(await response?.json()).toMatchObject({
      error: "confirmation_required",
      confirmationAction: "start-managed-session",
    });
  });
});
