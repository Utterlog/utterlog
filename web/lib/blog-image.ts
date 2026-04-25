import type { CSSProperties, ImgHTMLAttributes } from 'react';

export interface CoverPropsInput {
  src: string;
  alt?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Theme-facing helper for cover / hero / list images.
 *
 * Themes write `<img {...coverProps({ src, alt, priority })} />` —
 * no React component, no client boundary. The returned object stamps
 * the system hooks (`data-blog-image`, `data-loaded="0"`) and the
 * loading hints; everything else (placeholder, fade-in, scale effect,
 * lazy-load on/off) is handled by the global CSS + ImageEffects
 * client enhancer.
 *
 *  - priority=true   ⇒ loading="eager"  fetchPriority="high"
 *                     (HomePage hero, PostPage banner, first cover above the fold)
 *  - priority=false  ⇒ loading="lazy"   fetchPriority="auto"
 *                     (everything else; native lazy is enough)
 */
export function coverProps(input: CoverPropsInput): ImgHTMLAttributes<HTMLImageElement> & {
  'data-blog-image': '';
  'data-loaded': '0';
} {
  const { src, alt = '', priority = false, className, style } = input;
  return {
    src,
    alt,
    loading: priority ? 'eager' : 'lazy',
    fetchPriority: priority ? 'high' : 'auto',
    decoding: 'async',
    'data-blog-image': '',
    'data-loaded': '0',
    className,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      ...style,
    },
  };
}
