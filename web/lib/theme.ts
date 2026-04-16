/**
 * Theme System — Dynamic theme loading and management
 *
 * Themes are stored in /themes/{ThemeName}/ with:
 * - theme.json: manifest (name, version, description, author, screenshot)
 * - components: React components that override default blog layout
 *
 * Active theme is stored in the database options table (key: "active_theme")
 */

export interface MenuPosition {
  key: string;
  label: string;
  description?: string;
}

export interface ThemeManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  screenshot?: string;
  colors?: {
    primary?: string;
    background?: string;
  };
  layout?: {
    maxWidth?: string;
    headerStyle?: string;
  };
  menuPositions?: MenuPosition[];
  features?: string[];
}

// Available themes (statically imported for Next.js SSR compatibility)
// Each theme registers its components here
export interface ThemeComponents {
  // Required components
  Header: React.ComponentType<any>;
  Footer: React.ComponentType<any>;
  HomePage: React.ComponentType<any>;
  PostPage: React.ComponentType<{ post: any }>;
  PostCard: React.ComponentType<{ post: any }>;
  CommentSection: React.ComponentType<{ postId: number }>;
  Layout: React.ComponentType<{ children: React.ReactNode }>;
  // Optional page components — defaults provided if not implemented by theme
  ArchivePage?: React.ComponentType<any>;
  CategoryPage?: React.ComponentType<{ category: any; posts: any[] }>;
  TagPage?: React.ComponentType<{ tag: any; posts: any[] }>;
  CategoriesPage?: React.ComponentType<{ categories: any[] }>;
  TagsPage?: React.ComponentType<{ tags: any[] }>;
  NotFoundPage?: React.ComponentType<any>;
}

// Theme registry — import all themes statically (components + styles)
import * as Theme2026 from '@/themes/2026';
import * as Azure from '@/themes/Azure';
import * as Chred from '@/themes/Chred';
import * as Westlife from '@/themes/Westlife';
import * as Flux from '@/themes/Flux';

// 主题 CSS 按需加载：public/themes/{name}/styles.css，由 blog layout 动态 <link> 引入

import Theme2026Manifest from '@/themes/2026/theme.json';
import AzureManifest from '@/themes/Azure/theme.json';
import ChredManifest from '@/themes/Chred/theme.json';
import WestlifeManifest from '@/themes/Westlife/theme.json';
import FluxManifest from '@/themes/Flux/theme.json';

const themeRegistry: Record<string, ThemeComponents> = {
  '2026': Theme2026 as unknown as ThemeComponents,
  Azure: Azure as unknown as ThemeComponents,
  Chred: Chred as unknown as ThemeComponents,
  Westlife: Westlife as unknown as ThemeComponents,
  Flux: Flux as unknown as ThemeComponents,
};

const manifestRegistry: Record<string, ThemeManifest> = {
  '2026': Theme2026Manifest as ThemeManifest,
  Azure: AzureManifest as ThemeManifest,
  Chred: ChredManifest as ThemeManifest,
  Westlife: WestlifeManifest as ThemeManifest,
  Flux: FluxManifest as ThemeManifest,
};

export function getThemeComponents(themeName: string): ThemeComponents {
  return themeRegistry[themeName] || themeRegistry['2026'];
}

export function getThemeManifest(themeName: string): ThemeManifest {
  return manifestRegistry[themeName] || manifestRegistry['2026'];
}

export function getAllManifests(): Record<string, ThemeManifest> {
  return manifestRegistry;
}

export function getAvailableThemes(): string[] {
  return Object.keys(themeRegistry);
}
