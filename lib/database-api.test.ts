import { describe, expect, it } from "vitest";
import { DatabaseApiInputError, parseDatabaseApiInput } from "./database-api";

const validInput = {
  name: "Development database",
  engine: "postgresql",
  host: "db.example.com",
  port: 5432,
  databaseName: "app",
  username: "app",
  password: "secret",
  connectionMode: "direct",
  sshServerId: null,
  tlsMode: "require",
  environment: "development",
};

describe("parseDatabaseApiInput", () => {
  it("accepts a direct PostgreSQL database", () => {
    expect(parseDatabaseApiInput(validInput, true)).toMatchObject({
      engine: "postgresql",
      connectionMode: "direct",
      sshServerId: null,
    });
  });

  it("requires a password only on create", () => {
    const withoutPassword = { ...validInput, password: undefined };
    expect(() => parseDatabaseApiInput(withoutPassword, true)).toThrow("必须提供密码");
    expect(parseDatabaseApiInput(withoutPassword, false).password).toBeUndefined();
  });

  it("requires a valid SSH server for tunnel mode", () => {
    expect(() => parseDatabaseApiInput({
      ...validInput,
      connectionMode: "sshTunnel",
      sshServerId: "bad-id",
    }, true)).toThrow(DatabaseApiInputError);
  });

  it("validates custom CA data", () => {
    expect(() => parseDatabaseApiInput({ ...validInput, tlsCa: "not a certificate" }, true))
      .toThrow("PEM");
  });
});
