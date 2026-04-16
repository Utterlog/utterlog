const fallbackIcons: Record<string, string> = {
  '全部': 'fa-sharp fa-light fa-grid-2',
};

export function getCategoryIcon(cat: { name: string; icon?: string }): string {
  if (cat.icon && cat.icon.startsWith('fa')) return cat.icon;
  return fallbackIcons[cat.name] || 'fa-sharp fa-light fa-folder';
}

export const categoryIcons = new Proxy({} as Record<string, string>, {
  get: (_, name: string) => fallbackIcons[name] || 'fa-sharp fa-light fa-folder',
});
