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
      {/* data-theme="<name>" is set on <html> by app/layout.tsx
          (server-rendered attribute). No inline script needed — the
          previous dangerouslySetInnerHTML approach tripped Next.js
          16's "Encountered a script tag while rendering React
          component" warning during hydration. */}
      {/* dev 模式给 styles.css 追加 ?v=<timestamp> 强制 cache bust。
          themes/<T>/styles.css 是 public 静态资源，浏览器会激进
          缓存；symlink 替换或源文件改动后，没 query 的话用户即使
          硬刷新也可能命中旧缓存。生产模式不加 query，让 CDN /
          浏览器正常缓存（生产是 docker build 出新镜像，URL 路径
          也跟版本号挂钩）。 */}
      <link
        rel="stylesheet"
        href={`/themes/${ctx.theme.name}/styles.css${
          process.env.NODE_ENV === 'development' ? `?v=${Date.now()}` : ''
        }`}
      />
      <SlotHead options={ctx.options} />
      <Script src="https://id.utterlog.com/static/passport.js" strategy="lazyOnload" />
      <ThemeProvider value={ctx}>
        <ThemeLayout>
          <PageViewTracker />
          <ImageEffects
            effect={ctx.options.image_display_effect}
            durationMs={ctx.options.image_display_duration}
            lazyLoad={ctx.options.image_lazy_load}
            lightbox={ctx.options.image_lightbox}
          />
          {children}
        </ThemeLayout>
        <SlotFooter options={ctx.options} />
      </ThemeProvider>
    </>
  );
}
