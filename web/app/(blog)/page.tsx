import { getPosts, getActiveTheme, getOptions, getCategories, getArchiveStats } from '@/lib/blog-api';
import { getThemeComponents } from '@/lib/theme';

interface HomePageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

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
  let categories: any[] = [];
  let archiveStats: any = {};

  try {
    const [postsRes, catsRes, statsRes] = await Promise.all([
      getPosts({ page, per_page: perPage, status: 'publish' }),
      getCategories(),
      getArchiveStats(),
    ]);
    posts = (postsRes.data || []).filter((p: any) => p.id != null && p.title);
    totalPages = postsRes.meta?.total_pages || 1;
    categories = catsRes.data || [];
    archiveStats = statsRes.data || {};
  } catch {}

  const theme = getThemeComponents(themeName);
  const ThemeHomePage = theme.HomePage;

  return <ThemeHomePage posts={posts} page={page} totalPages={totalPages} categories={categories} archiveStats={archiveStats} perPage={perPage} />;
}
