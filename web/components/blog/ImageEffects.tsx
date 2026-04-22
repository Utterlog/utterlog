'use client';

import { useEffect } from 'react';

// Applies the admin-configured image display effect to every blog
// article image. Reads `image_display_effect` + `image_display_duration`
// from theme options and sets them as data-attribute + CSS variables
// on <html>, so a small global stylesheet (app/globals.css) can key
// one of the eight @keyframes off the attribute selector.
//
// We also run an IntersectionObserver for the effects that should
// fire on-scroll (slide-up, scale) rather than on-load — those look
// wrong without a clear entry moment. For the rest, the browser
// decides; they all animate once per img element.
//
// Selector scope: `.blog-prose img` (markdown body) and any element
// carrying `data-blog-image`. Chrome extensions / social widgets
// outside the prose are untouched.

interface Props {
  effect: string | undefined;
  durationMs: string | number | undefined;
}

export default function ImageEffects({ effect, durationMs }: Props) {
  useEffect(() => {
    const root = document.documentElement;
    const value = (effect || 'fade').toString().trim() || 'fade';
    root.dataset.imgEffect = value;

    const raw = (durationMs ?? '').toString().trim();
    const d = parseInt(raw, 10);
    root.style.setProperty('--img-effect-duration', `${Number.isFinite(d) && d > 0 ? d : 400}ms`);

    if (value === 'none') return;

    // Scroll-triggered reveal — for effects where an on-load
    // animation is meaningless once the user has scrolled past.
    const scrollTriggered = new Set(['slide-up', 'scale', 'blinds', 'curtain']);
    if (!scrollTriggered.has(value)) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.imgEffectVisible = '1';
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -40px 0px' }
    );

    const attach = () => {
      document
        .querySelectorAll<HTMLElement>('.blog-prose img, .blog-image img, [data-blog-image] img, img[data-blog-image]')
        .forEach((el) => {
          if (el.dataset.imgEffectWatched) return;
          el.dataset.imgEffectWatched = '1';
          io.observe(el);
        });
    };
    attach();
    // Re-scan when new images get appended (dynamic comment renders etc.)
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, [effect, durationMs]);

  return null;
}
