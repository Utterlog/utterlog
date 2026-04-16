import type { Metadata } from 'next';
import Script from 'next/script';
import { getThemeComponents } from '@/lib/theme';
import { getThemeContextData } from '@/lib/theme-data';
import { ThemeProvider } from '@/lib/theme-context';
import { SlotHead, SlotFooter } from '@/lib/slots';
import PageViewTracker from '@/components/blog/PageViewTracker';

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
      <link rel="stylesheet" href={`/themes/${ctx.theme.name}/styles.css`} />
      <SlotHead options={ctx.options} />
      <Script src="https://id.utterlog.com/static/passport.js" strategy="lazyOnload" />
      <ThemeProvider value={ctx}>
        <ThemeLayout>
          <PageViewTracker />
          {children}
        </ThemeLayout>
        <SlotFooter options={ctx.options} />
      </ThemeProvider>
    </>
  );
}
