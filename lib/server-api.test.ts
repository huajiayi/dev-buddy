import { describe, expect, it } from "vitest";
import { parseCreateServerApiInput, parseUpdateServerApiInput, ServerApiInputError } from "./server-api";

const validInput = {
  name: "Development server",
  host: "192.0.2.10",
  port: 22,
  username: "deploy",
  authType: "privateKey",
  credential: [
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "test-key-data",
    "-----END OPENSSH PRIVATE KEY-----",
  ].join("\n"),
  environment: "development",
} as const;

describe("parseCreateServerApiInput", () => {
  it("normalizes and accepts a valid private-key server", () => {
    const parsed = parseCreateServerApiInput({
      ...validInput,
      name: "  Development server  ",
      host: "  server.example.com  ",
    });
    expect(parsed.name).toBe("Development server");
    expect(parsed.host).toBe("server.example.com");
    expect(parsed.credential).toBe(validInput.credential);
  });

  it("accepts password authentication", () => {
    expect(parseCreateServerApiInput({
      ...validInput,
      authType: "password",
      credential: "secret",
    }).authType).toBe("password");
  });

  it("rejects invalid hosts and ports", () => {
    expect(() => parseCreateServerApiInput({ ...validInput, host: "https://example.com" }))
      .toThrow(ServerApiInputError);
    expect(() => parseCreateServerApiInput({ ...validInput, port: 70000 }))
      .toThrow("SSH 端口");
  });

  it("rejects malformed or mismatched private keys", () => {
    expect(() => parseCreateServerApiInput({ ...validInput, credential: "not a key" }))
      .toThrow("SSH 私钥格式");
    expect(() => parseCreateServerApiInput({
      ...validInput,
      credential: "-----BEGIN OPENSSH PRIVATE KEY-----\ndata\n-----END RSA PRIVATE KEY-----",
    })).toThrow("匹配的结束标记");
  });

  it("rejects credentials larger than 64 KB", () => {
    expect(() => parseCreateServerApiInput({
      ...validInput,
      authType: "password",
      credential: "x".repeat(64 * 1024 + 1),
    })).toThrow("64 KB");
  });

  it("allows an update without replacing the credential", () => {
    expect(parseUpdateServerApiInput({
      name: validInput.name,
      host: validInput.host,
      port: validInput.port,
      username: validInput.username,
      authType: validInput.authType,
      environment: validInput.environment,
    }).credential).toBeUndefined();
  });
});
