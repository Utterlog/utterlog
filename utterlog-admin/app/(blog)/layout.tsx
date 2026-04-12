import type { Metadata } from 'next';
import { getThemeComponents } from '@/lib/theme';
import { getActiveTheme } from '@/lib/blog-api';

export const metadata: Metadata = {
  title: {
    default: 'Utterlog!',
    template: '%s | Utterlog!',
  },
  description: '一个简洁优雅的博客',
};

export default async function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let themeName = 'Utterlog2026';
  try {
    themeName = await getActiveTheme();
  } catch {}

  const theme = getThemeComponents(themeName);
  const ThemeLayout = theme.Layout;

  return <ThemeLayout>{children}</ThemeLayout>;
}
