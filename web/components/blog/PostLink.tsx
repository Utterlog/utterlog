'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { useThemeContext } from '@/lib/theme-context';
import { buildPermalink } from '@/lib/permalink';

type LinkPropsNoHref = Omit<ComponentProps<typeof Link>, 'href'>;

interface PostLinkProps extends LinkPropsNoHref {
  post: {
    id?: number;
    slug?: string;
    published_at?: string | null;
    created_at?: string | number;
    categories?: { slug?: string }[];
  };
  children?: ReactNode;
}

/**
 * Renders a Next.js Link whose href is built from the admin-configured
 * permalink structure (read from ThemeContext). Swap any
 * `<Link href={`/posts/${slug}`}>` with `<PostLink post={post}>` and
 * the URL updates automatically when the site owner changes their
 * permalink settings — no more /posts/slug → 307 redirect dance.
 *
 * Lives outside the `(blog)` group so PostNavigation (shared with
 * admin previews) can import it without a circular path.
 */
export default function PostLink({ post, children, ...rest }: PostLinkProps) {
  const { options } = useThemeContext();
  const href = buildPermalink(post, options?.permalink_structure);
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}
