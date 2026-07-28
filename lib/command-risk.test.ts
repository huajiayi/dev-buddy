import { describe, expect, it } from "vitest";
import { isHighRiskCommand } from "./command-risk";

describe("isHighRiskCommand", () => {
  it.each([
    "systemctl restart nginx",
    "docker rm web",
    "rm /tmp/file",
    "chmod 600 /etc/app.conf",
    "apt-get install curl",
  ])("flags high-risk command: %s", (command) => {
    expect(isHighRiskCommand(command)).toBe(true);
  });

  it.each([
    "uptime",
    "systemctl status nginx --no-pager",
    "docker ps",
    "journalctl -u nginx -n 50 --no-pager",
  ])("allows diagnostic command without confirmation: %s", (command) => {
    expect(isHighRiskCommand(command)).toBe(false);
  });
});
