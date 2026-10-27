/**
 * Plain-text credits for routes, by ComputedRoute.provider. Routes core computes itself need
 * none. Used by the video's attribution corner and later by "Credits kopieren".
 */
const ROUTING_CREDITS: Record<string, string> = {
  ors: 'Routen © openrouteservice.org by HeiGIT',
  osrm: 'Routen: OSRM, FOSSGIS',
};

/** The credits for the routes of a stage, each once, in a stable order. */
export function routingCredits(providers: Iterable<string | undefined>): string[] {
  const used = new Set(providers);
  return Object.keys(ROUTING_CREDITS)
    .filter((provider) => used.has(provider))
    .map((provider) => ROUTING_CREDITS[provider]!);
}
