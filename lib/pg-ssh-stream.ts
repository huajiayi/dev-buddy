import type { Duplex } from "node:stream";

type PgSocketStream = Duplex & {
  connect: (port: number, host: string, listener?: () => void) => PgSocketStream;
  setNoDelay: (noDelay?: boolean) => PgSocketStream;
  setKeepAlive: (enable?: boolean, initialDelay?: number) => PgSocketStream;
  ref: () => PgSocketStream;
  unref: () => PgSocketStream;
};

/**
 * node-postgres expects a custom stream factory to return a net.Socket-like
 * object and calls connect() even when the transport is already connected.
 * ssh2 forwardOut() returns an already-connected Duplex channel, so expose the
 * small Socket surface pg needs and emit connect on the next microtask.
 */
export function createPgSshStream(stream: Duplex) {
  const socket = stream as PgSocketStream;
  let connectScheduled = false;

  socket.setNoDelay = () => socket;
  socket.setKeepAlive = () => socket;
  socket.ref = () => socket;
  socket.unref = () => socket;
  socket.connect = (_port, _host, listener) => {
    if (listener) socket.once("connect", listener);
    if (!connectScheduled) {
      connectScheduled = true;
      queueMicrotask(() => {
        if (!socket.destroyed) socket.emit("connect");
      });
    }
    return socket;
  };

  return () => socket;
}
