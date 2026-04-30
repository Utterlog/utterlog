/**
 * Theme System — Dynamic theme loading and management
 *
 * Built-in theme source lives in web/themes/{ThemeName}/ and is statically
 * imported for Next.js SSR. Runtime-uploaded theme packages live in the API
 * container under content/themes/{ThemeName}/; their public assets are served
 * from /themes/{ThemeName}/...
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
  PostPage: React.ComponentType<{ post: any; options?: Record<string, string> }>;
  PostCard: React.ComponentType<{ post: any }>;
  CommentSection: React.ComponentType<{ postId: number }>;
  Layout: React.ComponentType<{ children: React.ReactNode }>;
  // Optional page components — defaults provided if not implemented by theme
  ArchivePage?: React.ComponentType<any>;
  CategoryPage?: React.ComponentType<{ category: any; posts: any[]; timeZone?: string }>;
  TagPage?: React.ComponentType<{ tag: any; posts: any[]; timeZone?: string }>;
  CategoriesPage?: React.ComponentType<{ categories: any[] }>;
  TagsPage?: React.ComponentType<{ tags: any[] }>;
  NotFoundPage?: React.ComponentType<any>;
}

// Theme registry — import all themes statically (components + styles)
import * as Utterlog from '@/themes/Utterlog';
import * as Azure from '@/themes/Azure';
import * as Renascent from '@/themes/Renascent';
import * as Chred from '@/themes/Chred';
import * as Flux from '@/themes/Flux';

// 主题 CSS 按需加载：/themes/{name}/styles.css，由 blog layout 动态 <link> 引入。
// 后端会先查 content/themes，再查内置 public/themes，最后回退到 web 容器。

import UtterlogManifest from '@/themes/Utterlog/theme.json';
import AzureManifest from '@/themes/Azure/theme.json';
import RenascentManifest from '@/themes/Renascent/theme.json';
import ChredManifest from '@/themes/Chred/theme.json';
import FluxManifest from '@/themes/Flux/theme.json';

const themeRegistry: Record<string, ThemeComponents> = {
  Utterlog: Utterlog as unknown as ThemeComponents,
  Azure: Azure as unknown as ThemeComponents,
  Renascent: Renascent as unknown as ThemeComponents,
  Chred: Chred as unknown as ThemeComponents,
  Flux: Flux as unknown as ThemeComponents,
};

const manifestRegistry: Record<string, ThemeManifest> = {
  Utterlog: UtterlogManifest as ThemeManifest,
  Azure: AzureManifest as ThemeManifest,
  Renascent: RenascentManifest as ThemeManifest,
  Chred: ChredManifest as ThemeManifest,
  Flux: FluxManifest as ThemeManifest,
};

// Utterlog (renamed from Westlife in 2026-04) is the official default
// theme — served when no active_theme is set in the DB or when an
// unknown theme name is requested. The previous default Azure now
// stays available but is no longer the fallback.
export const DEFAULT_THEME = 'Utterlog';

export function getThemeComponents(themeName: string): ThemeComponents {
  return themeRegistry[themeName] || themeRegistry[DEFAULT_THEME];
}

export function getThemeManifest(themeName: string): ThemeManifest {
  return manifestRegistry[themeName] || manifestRegistry[DEFAULT_THEME];
}

export function getAllManifests(): Record<string, ThemeManifest> {
  return manifestRegistry;
}

export function getAvailableThemes(): string[] {
  return Object.keys(themeRegistry);
}
