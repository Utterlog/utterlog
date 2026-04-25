import { coverProps } from '@/lib/blog-image';

/**
 * FadeCover — hero / banner cover wrapper used by HomePage hero,
 * PostPage banner, and PostNavigation prev/next thumbnails.
 *
 * Now a server-component thin wrapper. Hero / banner images are
 * always above the fold, so they default to `priority=true` →
 * `loading="eager" fetchPriority="high"`. Pass `priority={false}`
 * for the off-screen prev/next thumbnails in PostNavigation if
 * needed (currently they're below the article fold, so leave the
 * default if you're unsure — the size is small and `eager` doesn't
 * hurt much).
 *
 * The placeholder background and blur→sharp fade are owned by
 * globals.css ([data-blog-image][data-loaded]) and the load-state
 * tracking is owned by ImageEffects.tsx — this component only
 * provides the sized wrapper.
 */
interface FadeCoverProps {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  priority?: boolean;
}

export default function FadeCover({ src, alt, style, className, priority = true }: FadeCoverProps) {
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
      <img {...coverProps({ src, alt, priority })} />
    </div>
  );
}
