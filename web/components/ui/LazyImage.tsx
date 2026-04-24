'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useThemeContext } from '@/lib/theme-context';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  spinnerSize?: number;
}

// 10×10 mosaic overlay used by the "pixel" image-display effect.
// Mounts once the underlying <img> reports onLoad, then unmounts
// itself after a second so it isn't stuck blocking future hovers.
// Each tile gets a random `--delay` integer 0-9 so the reveal order
// looks scattered rather than left-to-right.
function PixelOverlay() {
  const [visible, setVisible] = useState(true);
  const delays = useMemo(
    () => Array.from({ length: 100 }, () => Math.floor(Math.random() * 10)),
    [],
  );
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1100);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="pixel-overlay">
      {delays.map((d, i) => (
        <div
          key={i}
          className="pixel-tile"
          style={{ ['--delay' as any]: d }}
        />
      ))}
    </div>
  );
}

/**
 * Site-wide lazy image (theme PostCards, HomePage heroes, PostNavigation
 * covers, etc.). Now driven entirely by admin options from
 * ThemeContext so the 后台 Settings → 图片处理 controls really do cover
 * every image:
 *
 *   image_lazy_load            — when 'false' we skip the IO entirely and
 *                                load immediately (honour the admin's
 *                                "off" toggle).
 *   image_lazy_load_placeholder — blur / color / skeleton / spinner / none
 *   image_display_effect       — fade / blur / blinds / pixel / slide-up /
 *                                scale / curtain / none (applied via the
 *                                global CSS keyframes in globals.css — we
 *                                opt in by stamping `data-blog-image` on
 *                                the rendered <img>).
 *   image_display_duration     — ms; also read by <ImageEffects/> into
 *                                --img-effect-duration.
 */
export default function LazyImage({ src, alt, spinnerSize = 28, style, className, ...props }: LazyImageProps) {
  const { options } = useThemeContext();
  const lazyEnabled = options?.image_lazy_load !== 'false';
  const placeholder = options?.image_lazy_load_placeholder || 'spinner';
  const effect = options?.image_display_effect || 'fade';

  // When lazy load is disabled in the admin, start already-visible so
  // the <img> renders on the first paint without waiting on IO.
  const [inView, setInView] = useState(!lazyEnabled);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lazyEnabled) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazyEnabled]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: placeholder === 'color' ? 'var(--color-bg-soft, #e5e5e5)' :
                    placeholder === 'blur'  ? 'linear-gradient(135deg,#ddd,#f5f5f5)' :
                    placeholder === 'skeleton' ? '#f0f0f0' :
                    placeholder === 'none' ? 'transparent' :
                    'var(--color-bg-soft, #f0f0f0)',
        ...style,
      }}
    >
      {/* Placeholder — shown until the <img> fires onLoad. Five modes mirror
          the admin option so switching in Settings → 图片处理 visibly
          changes the behaviour on every cover, not just article images. */}
      {!loaded && placeholder === 'spinner' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1,
        }}>
          <svg width={spinnerSize} height={spinnerSize} viewBox="0 0 2400 2400" xmlns="http://www.w3.org/2000/svg">
            <g strokeWidth="200" strokeLinecap="round" stroke="var(--color-primary, #999)" fill="none">
              <line x1="1200" y1="600" x2="1200" y2="100"/>
              <line opacity="0.5" x1="1200" y1="2300" x2="1200" y2="1800"/>
              <line opacity="0.917" x1="900" y1="680.4" x2="650" y2="247.4"/>
              <line opacity="0.417" x1="1750" y1="2152.6" x2="1500" y2="1719.6"/>
              <line opacity="0.833" x1="680.4" y1="900" x2="247.4" y2="650"/>
              <line opacity="0.333" x1="2152.6" y1="1750" x2="1719.6" y2="1500"/>
              <line opacity="0.75" x1="600" y1="1200" x2="100" y2="1200"/>
              <line opacity="0.25" x1="2300" y1="1200" x2="1800" y2="1200"/>
              <line opacity="0.667" x1="680.4" y1="1500" x2="247.4" y2="1750"/>
              <line opacity="0.167" x1="2152.6" y1="650" x2="1719.6" y2="900"/>
              <line opacity="0.583" x1="900" y1="1719.6" x2="650" y2="2152.6"/>
              <line opacity="0.083" x1="1750" y1="247.4" x2="1500" y2="680.4"/>
              <animateTransform attributeName="transform" attributeType="XML" type="rotate"
                keyTimes="0;0.08333;0.16667;0.25;0.33333;0.41667;0.5;0.58333;0.66667;0.75;0.83333;0.91667"
                values="0 1199 1199;30 1199 1199;60 1199 1199;90 1199 1199;120 1199 1199;150 1199 1199;180 1199 1199;210 1199 1199;240 1199 1199;270 1199 1199;300 1199 1199;330 1199 1199"
                dur="0.83333s" begin="0s" repeatCount="indefinite" calcMode="discrete"/>
            </g>
          </svg>
        </div>
      )}
      {!loaded && placeholder === 'skeleton' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, #f0f0f0 0%, #f8f8f8 50%, #f0f0f0 100%)',
          backgroundSize: '200% 100%',
          animation: 'lazy-skeleton-shimmer 1.6s linear infinite',
        }} />
      )}

      {/* Image — only mounted once inView. `data-blog-image` hooks it
          into the global effect keyframes so `image_display_effect`
          actually drives the animation. The onLoad handler fires to
          swap out whatever placeholder we're showing. */}
      {inView && (
        <img
          src={src}
          alt={alt || ''}
          loading={lazyEnabled ? 'lazy' : 'eager'}
          data-blog-image=""
          data-loaded={loaded ? '1' : '0'}
          onLoad={() => setLoaded(true)}
          {...props}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            // Fade effect hooks on `data-loaded` (see globals.css) so
            // the transition fires when pixels actually arrive, not
            // when the <img> element first mounts. Other admin effects
            // (blur / blinds / pixel / …) run keyframe animations off
            // the data-blog-image selector and are unaffected by this.
          }}
        />
      )}
      {effect === 'pixel' && loaded && <PixelOverlay />}
    </div>
  );
}
