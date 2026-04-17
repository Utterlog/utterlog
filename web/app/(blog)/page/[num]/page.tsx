import { getPosts, getOptions } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';

interface PageProps {
  params: Promise<{ num: string }>;
}

export default async function PaginatedPage({ params }: PageProps) {
  const { num } = await params;
  const page = Number(num) || 1;

  if (page === 1) {
    const { redirect } = await import('next/navigation');
    redirect('/');
  }

  let perPage = 10;
  let themeName = 'Azure';
  try {
    const opts = await getOptions();
    const data = opts.data || opts;
    perPage = Number(data.posts_per_page) || 10;
    themeName = data.active_theme || 'Azure';
  } catch {}

  let posts: any[] = [];
  let totalPages = 1;

  try {
    const response = await getPosts({ page, per_page: perPage, status: 'publish' });
    posts = (response.data || []).filter((p: any) => p.id != null && p.title);
    totalPages = response.meta?.total_pages || 1;
  } catch {}

  const theme = getThemeComponents(themeName);
  const ThemeHomePage = theme.HomePage;

  return <ThemeHomePage posts={posts} page={page} totalPages={totalPages} perPage={perPage} />;
}
