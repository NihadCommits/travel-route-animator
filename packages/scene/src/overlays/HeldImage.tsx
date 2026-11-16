import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { continueRender, delayRender } from 'remotion';

/**
 * An image that holds the frame until it has loaded, so a render never shows it half there.
 * Like Remotion's <Img>, but without needing a composition around it: the overlays also render
 * on their own (tests, the inspector). The hold starts in a layout effect, before Remotion
 * looks at the frame, and ends when the image has loaded or failed.
 */
export function HeldImage({ src, style }: { src: string; style?: CSSProperties }) {
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const image = ref.current;
    if (!image || image.complete) return;
    const handle = delayRender(`Loading image ${src}`);
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      continueRender(handle);
    };
    image.addEventListener('load', release);
    image.addEventListener('error', release);
    return () => {
      image.removeEventListener('load', release);
      image.removeEventListener('error', release);
      release();
    };
  }, [src]);
  return <img ref={ref} src={src} alt="" style={style} />;
}
