import Link from 'next/link';
import type { Metadata } from 'next';
import { getCategories } from '@/lib/blog-api';
import { Folder } from '@/components/icons';

export const metadata: Metadata = {
  title: '分类',
};

export default async function CategoriesPage() {
  let categories: any[] = [];
  try {
    const response = await getCategories();
    categories = response.data || [];
  } catch {}

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold text-main mb-2">分类</h1>
      <p className="text-sub mb-10">按主题浏览文章</p>

      {categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/categories/${cat.slug}`}
              className="group flex items-center gap-4 p-5 bg-card rounded-md border border-line hover:border-line hover:shadow-card transition-all"
            >
              <div className="w-10 h-10 flex items-center justify-center bg-soft rounded-md text-primary-themed">
                {cat.icon ? (
                  <span className="text-lg">{cat.icon}</span>
                ) : (
                  <Folder className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1">
                <h2 className="font-medium text-main group-hover:text-primary-themed transition-colors">
                  {cat.name}
                </h2>
                {cat.description && (
                  <p className="text-sm text-dim mt-0.5 line-clamp-1">
                    {cat.description}
                  </p>
                )}
              </div>
              <span className="text-sm text-dim">{cat.count || 0} 篇</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-center py-16 text-dim">暂无分类</p>
      )}
    </div>
  );
}
