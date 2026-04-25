'use client';

import { useEffect } from 'react';

// Applies the admin-configured image display effect to every blog
// image and tracks load state for the global fade-in. Reads
// `image_display_effect` + `image_display_duration` from theme
// options and sets them as data-attribute + CSS variables on <html>,
// so a small global stylesheet (app/globals.css) can key one of the
// effect rules off the attribute selector.
//
// Three responsibilities:
//   1. Stamp <html data-img-effect=...> + --img-effect-duration so
//      globals.css selectors fire.
//   2. Track load state on every <img data-blog-image> via event
//      delegation: flip `data-loaded` to "1" on `load`, and on mount
//      sweep already-`complete` images so the hydration race doesn't
//      strand them on the placeholder forever.
//   3. For the `scale` effect (which needs a scroll trigger to feel
//      right), run an IntersectionObserver that flips
//      `data-img-effect-visible="1"` when the image enters the
//      viewport.
//
// Selector scope: any element carrying `data-blog-image`. Themes
// stamp this via `coverProps()` (lib/blog-image.ts); article-body
// images stamp it directly in components/blog/LazyImage.tsx.

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
    // Fallback 500ms matches both globals.css `:root { --img-effect-duration: 500ms }`
    // and the historical hard-coded LazyImage fade. Admin form pre-fills 300 when
    // the field is empty, but if the user never visits Settings → 图片处理 the
    // DB key stays unset and we land here.
    root.style.setProperty('--img-effect-duration', `${Number.isFinite(d) && d > 0 ? d : 500}ms`);

    // ── (2) load tracking ──────────────────────────────────────────
    // Mark already-loaded images (browser finished the download
    // before React attached). Without this they stay on
    // `data-loaded="0"` forever and the placeholder never lifts.
    const sweep = () => {
      document
        .querySelectorAll<HTMLImageElement>('img[data-blog-image][data-loaded="0"]')
        .forEach((img) => {
          if (img.complete && img.naturalWidth > 0) {
            img.dataset.loaded = '1';
          }
        });
    };
    sweep();

    // Capture-phase listener so we hear `load` events that don't
    // bubble. One listener for the whole page covers every theme
    // cover, hero, and article body image.
    const onLoad = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === 'IMG' && (t as HTMLImageElement).dataset.blogImage !== undefined) {
        (t as HTMLImageElement).dataset.loaded = '1';
      }
    };
    document.addEventListener('load', onLoad, true);

    // New images may stream in (PJAX page swap, comment renders, etc).
    // Re-sweep on DOM mutation so they don't get stuck.
    const mo = new MutationObserver(sweep);
    mo.observe(document.body, { childList: true, subtree: true });

    // ── (3) scroll-triggered effects ──────────────────────────────
    // Only `scale` still needs IO; fade is pure CSS keyed on
    // `data-loaded`, and the rest were retired.
    let io: IntersectionObserver | null = null;
    if (value === 'scale') {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              (e.target as HTMLElement).dataset.imgEffectVisible = '1';
              io!.unobserve(e.target);
            }
          }
        },
        { rootMargin: '0px 0px -40px 0px' }
      );
      const attachIo = () => {
        document
          .querySelectorAll<HTMLElement>('img[data-blog-image]')
          .forEach((el) => {
            if (el.dataset.imgEffectWatched) return;
            el.dataset.imgEffectWatched = '1';
            io!.observe(el);
          });
      };
      attachIo();
      // Reuse the same MutationObserver — re-attach on DOM changes.
      const moIo = new MutationObserver(attachIo);
      moIo.observe(document.body, { childList: true, subtree: true });

      return () => {
        document.removeEventListener('load', onLoad, true);
        mo.disconnect();
        moIo.disconnect();
        io!.disconnect();
      };
    }

    return () => {
      document.removeEventListener('load', onLoad, true);
      mo.disconnect();
    };
  }, [effect, durationMs]);

  return null;
}
