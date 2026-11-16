import bebasLatin from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2';
import bebasLatinExt from '@fontsource/bebas-neue/files/bebas-neue-latin-ext-400-normal.woff2';
import caveatLatin from '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2';
import caveatLatinExt from '@fontsource-variable/caveat/files/caveat-latin-ext-wght-normal.woff2';
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';
import interLatinExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2';
import monoLatin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2';
import monoLatinExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2';
import montserratLatin from '@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2';
import montserratLatinExt from '@fontsource-variable/montserrat/files/montserrat-latin-ext-wght-normal.woff2';
import oswaldLatin from '@fontsource-variable/oswald/files/oswald-latin-wght-normal.woff2';
import oswaldLatinExt from '@fontsource-variable/oswald/files/oswald-latin-ext-wght-normal.woff2';
import playfairLatin from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2';
import playfairLatinExt from '@fontsource-variable/playfair-display/files/playfair-display-latin-ext-wght-normal.woff2';
import type { OverlayFont } from '@travel-route-animator/core';
import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

// The fonts of the overlay kit (M17), all under the SIL Open Font License (Fontsource). They
// are bundled with the scene, so every computer renders the same letters; system fonts would
// differ between machines. Each font comes in two parts: Latin (German, Portuguese …) and
// Latin Extended (Bosnian, Polish …); the browser loads a part only when a text needs it.

/** What `system` means: the overlays' look until M17. */
export const SYSTEM_FONT = '"Segoe UI", "Noto Sans", "Helvetica Neue", Arial, sans-serif';

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

interface BundledFont {
  family: string;
  /** Variable fonts cover a range of weights in one file. */
  weight: string;
  files: [latin: string, latinExt: string];
}

const BUNDLED: Record<Exclude<OverlayFont, 'system'>, BundledFont> = {
  inter: { family: 'TRA Inter', weight: '100 900', files: [interLatin, interLatinExt] },
  montserrat: {
    family: 'TRA Montserrat',
    weight: '100 900',
    files: [montserratLatin, montserratLatinExt],
  },
  oswald: { family: 'TRA Oswald', weight: '200 700', files: [oswaldLatin, oswaldLatinExt] },
  'bebas-neue': { family: 'TRA Bebas Neue', weight: '400', files: [bebasLatin, bebasLatinExt] },
  'playfair-display': {
    family: 'TRA Playfair Display',
    weight: '400 900',
    files: [playfairLatin, playfairLatinExt],
  },
  caveat: { family: 'TRA Caveat', weight: '400 700', files: [caveatLatin, caveatLatinExt] },
  'jetbrains-mono': {
    family: 'TRA JetBrains Mono',
    weight: '100 800',
    files: [monoLatin, monoLatinExt],
  },
};

/** The CSS font-family for a font, with the system font behind it for what it lacks (♥). */
export function fontFamilyOf(font: OverlayFont): string {
  return font === 'system' ? SYSTEM_FONT : `"${BUNDLED[font].family}", ${SYSTEM_FONT}`;
}

/** Loading or loaded, by font; each is fetched once per page. */
const loading = new Map<OverlayFont, Promise<void>>();

function load(font: Exclude<OverlayFont, 'system'>): Promise<void> {
  let promise = loading.get(font);
  if (!promise) {
    const { family, weight, files } = BUNDLED[font];
    const faces = files.map(
      (url, i) =>
        new FontFace(family, `url('${url}') format('woff2')`, {
          weight,
          unicodeRange: i === 0 ? LATIN : LATIN_EXT,
        }),
    );
    // Both parts are loaded up front: which one a frame needs depends on its text.
    promise = Promise.all(faces.map((face) => face.load())).then((loaded) => {
      for (const face of loaded) document.fonts.add(face);
    });
    loading.set(font, promise);
  }
  return promise;
}

/**
 * Loads the fonts the overlays use and holds the render until they are there, so no frame is
 * drawn with a stand-in font. Returns whether they are ready (the preview draws in the
 * meantime with the system font, which is fine for a moment).
 */
export function useOverlayFonts(fonts: readonly OverlayFont[]): boolean {
  const key = [...new Set(fonts)]
    .filter((font) => font !== 'system')
    .sort()
    .join('|');
  const [ready, setReady] = useState(key === '');
  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    const handle = delayRender(`Loading overlay fonts ${key}`);
    const wanted = key.split('|') as Exclude<OverlayFont, 'system'>[];
    Promise.all(wanted.map(load))
      .catch((error: unknown) => console.error('Overlay fonts failed to load', error))
      .finally(() => {
        if (!cancelled) setReady(true);
        continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return ready;
}
