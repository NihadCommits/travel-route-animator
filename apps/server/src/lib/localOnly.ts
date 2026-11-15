import type { FastifyInstance } from 'fastify';

// The server only listens on localhost, but every web page open in the user's browser can
// still send requests to it. Two checks keep other sites out (ADR 0016):
// - Host must name this computer. A site that points its own domain at 127.0.0.1 (DNS
//   rebinding) would otherwise talk to us as if it were the editor; it still sends its domain.
// - Origin, when the browser sends one, must be a page on this computer: the editor, the
//   Windows app or Remotion's render page. Forms and fetches from other sites carry theirs.

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Whether a Host header ("127.0.0.1:5174", "localhost", "[::1]:5174") names this computer. */
export function isLocalHost(host: string | undefined): boolean {
  if (host === undefined) return false;
  return URL.canParse(`http://${host}`) && LOCAL_HOSTNAMES.has(new URL(`http://${host}`).hostname);
}

/** Whether an Origin header is a page served from this computer, on any port. */
export function isLocalOrigin(origin: string): boolean {
  if (!URL.canParse(origin)) return false;
  const url = new URL(origin);
  return url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname);
}

const FORBIDDEN = {
  error: 'Forbidden',
  message: 'This server only answers the editor on this computer',
};

/** Turns away requests that do not come from this computer, before any route sees them. */
export function rejectOtherSites(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const { host, origin } = request.headers;
    if (!isLocalHost(host) || (origin !== undefined && !isLocalOrigin(origin))) {
      return reply.code(403).send(FORBIDDEN);
    }
  });
}
