'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * FadeCover — hard-coded "blur → sharp" fade for hero / banner images
 * that should NOT follow the admin's global image_display_effect
 * setting. A spinner shows while the browser is downloading; on
 * `onLoad` we flip state and let CSS transitions (0.5s ease-in-out
 * opacity, 0.5s linear filter) cross-fade the image in. Keep
 * `transform` in the transition list so hover zooms attached by
 * parent CSS still animate smoothly.
 *
 * Callsites: PostPage cover banners (Azure / Flux / Chred),
 * HomePage hero cards, and PostNavigation prev/next covers share
 * this component so their fade behaviour stays identical.
 */
interface FadeCoverProps {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  spinnerSize?: number;
}

export default function FadeCover({ src, alt, style, className, spinnerSize = 28 }: FadeCoverProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Hydration race guard: the browser can finish downloading the image
  // between SSR paint and React hydration, firing its `load` event
  // before we attach our onLoad handler. Without this we'd be stuck on
  // the spinner forever, because the onLoad listener only fires for
  // loads that happen AFTER it's attached. On mount, peek at the
  // img's `complete` flag; if it's already done, flip state directly.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-bg-soft, #f0f0f0)',
        ...style,
      }}
    >
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={spinnerSize} height={spinnerSize} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-text-dim, #999)" strokeOpacity="0.15" strokeWidth="2"/>
            <path d="M22,12a10,10,0,0,1-10,10" fill="none" stroke="var(--color-text-dim, #999)" strokeWidth="2" strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
            </path>
          </svg>
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt || ''}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          opacity: loaded ? 1 : 0,
          filter: loaded ? 'blur(0)' : 'blur(20px)',
          transition: 'opacity 0.5s ease-in-out, filter 0.5s linear, transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  );
}
