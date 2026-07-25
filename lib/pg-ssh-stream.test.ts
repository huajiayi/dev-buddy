import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createPgSshStream } from "./pg-ssh-stream";

describe("createPgSshStream", () => {
  it("adapts an already-connected SSH channel to the socket contract used by pg", async () => {
    const channel = new PassThrough();
    const socket = createPgSshStream(channel)();
    const connected = vi.fn();
    socket.once("connect", connected);

    expect(socket.setNoDelay(true)).toBe(socket);
    expect(socket.setKeepAlive(true, 1_000)).toBe(socket);
    expect(socket.ref()).toBe(socket);
    expect(socket.unref()).toBe(socket);
    expect(socket.connect(5432, "ignored-by-ssh-tunnel")).toBe(socket);

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(connected).toHaveBeenCalledOnce();
  });

  it("does not emit duplicate connect events when pg retries connect on the same channel", async () => {
    const socket = createPgSshStream(new PassThrough())();
    const connected = vi.fn();
    socket.on("connect", connected);

    socket.connect(5432, "first");
    socket.connect(5432, "second");
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(connected).toHaveBeenCalledOnce();
  });
});
