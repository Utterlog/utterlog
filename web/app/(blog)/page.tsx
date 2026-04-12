import { getPosts, getActiveTheme } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';

interface HomePageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const perPage = 10;

  let posts: any[] = [];
  let totalPages = 1;

  try {
    const response = await getPosts({ page, per_page: perPage, status: 'publish' });
    posts = (response.data || []).filter((p: any) => p.id != null && p.title);
    totalPages = response.meta?.total_pages || 1;
  } catch {}

  let themeName = 'Utterlog2026';
  try { themeName = await getActiveTheme(); } catch {}

  const theme = getThemeComponents(themeName);
  const ThemeHomePage = theme.HomePage;

  return <ThemeHomePage posts={posts} page={page} totalPages={totalPages} />;
}
