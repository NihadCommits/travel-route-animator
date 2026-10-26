import type { FastifyReply } from 'fastify';

/**
 * Fires when the browser gives up on the request (typing on cancels the previous search, a
 * moved point cancels the previous route). reply.raw, not request.raw: the request side
 * closes as soon as its body is read.
 */
export function abortOnDisconnect(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.on('close', () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}
