import type { Metadata } from 'next';
import Script from 'next/script';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { ThemeProvider } from '@/lib/theme-context';
import { SlotHead, SlotFooter } from '@/lib/slots';
import PageViewTracker from '@/components/blog/PageViewTracker';
import ImageEffects from '@/components/blog/ImageEffects';

// Force runtime rendering for all blog routes. Utterlog is a CMS — content is
// created in the admin AFTER deploy, so there's nothing to pre-render at build
// time. Without this, Next.js 16 tries to statically generate pages like /feeds
// at build, calls the API (which isn't running yet), retries 3x, fails.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  let title = 'Utterlog!';
  let subtitle = '';
  let description = '一个简洁优雅的博客';
  let favicon = '';
  try {
    const ctx = await getThemeContextData();
    if (ctx.site.title) title = ctx.site.title;
    if (ctx.site.subtitle) subtitle = ctx.site.subtitle;
    if (ctx.site.description) description = ctx.site.description;
    if (ctx.site.favicon) favicon = ctx.site.favicon;
  } catch {}
  const fullTitle = subtitle ? `${title} - ${subtitle}` : title;
  const meta: Metadata = {
    title: { default: fullTitle, template: `%s | ${title}` },
    description,
  };
  if (favicon) {
    meta.icons = { icon: favicon };
  }
  return meta;
}

export default async function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getThemeContextData();
  const theme = getThemeComponents(ctx.theme.name);
  const ThemeLayout = theme.Layout;

  return (
    <>
      {/* Stamp <html data-theme="..."> before hydration so themed CSS
          rules ([data-theme="Chred"] .post-related-card-cover { ... })
          actually match. The root <html> is owned by app/layout.tsx
          and can't be re-rendered from a nested layout, so we inject
          a tiny synchronous script that runs before any paint. Without
          this, structural rules scoped under [data-theme="..."] (e.g.
          aspect-ratio, position: relative) silently fail and absolute-
          positioned descendants escape upward to the viewport — which
          is what caused related-card images to fill the entire page
          on cover-less posts. Only Flux happened to work because its
          Layout already had a client useEffect doing the same stamp. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.dataset.theme=${JSON.stringify(ctx.theme.name)};`,
        }}
      />
      <link rel="stylesheet" href={`/themes/${ctx.theme.name}/styles.css`} />
      <SlotHead options={ctx.options} />
      <Script src="https://id.utterlog.com/static/passport.js" strategy="lazyOnload" />
      <ThemeProvider value={ctx}>
        <ThemeLayout>
          <PageViewTracker />
          <ImageEffects
            effect={ctx.options.image_display_effect}
            durationMs={ctx.options.image_display_duration}
          />
          {children}
        </ThemeLayout>
        <SlotFooter options={ctx.options} />
      </ThemeProvider>
    </>
  );
}
