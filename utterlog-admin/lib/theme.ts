/**
 * Theme System — Dynamic theme loading and management
 *
 * Themes are stored in /themes/{ThemeName}/ with:
 * - theme.json: manifest (name, version, description, author, screenshot)
 * - components: React components that override default blog layout
 *
 * Active theme is stored in the database options table (key: "active_theme")
 */

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
}

// Available themes (statically imported for Next.js SSR compatibility)
// Each theme registers its components here
export interface ThemeComponents {
  Header: React.ComponentType<any>;
  Footer: React.ComponentType<any>;
  HomePage: React.ComponentType<{ posts: any[]; page: number; totalPages: number }>;
  PostPage: React.ComponentType<{ post: any }>;
  PostCard: React.ComponentType<{ post: any }>;
  CommentSection: React.ComponentType<{ postId: number }>;
  Layout: React.ComponentType<{ children: React.ReactNode }>;
}

// Theme registry — import all themes statically
import * as Utterlog2026 from '@/themes/Utterlog2026';
import * as Lared from '@/themes/Lared';
import * as Westlife from '@/themes/Westlife';

const themeRegistry: Record<string, ThemeComponents> = {
  Utterlog2026: Utterlog2026 as unknown as ThemeComponents,
  Lared: Lared as unknown as ThemeComponents,
  Westlife: Westlife as unknown as ThemeComponents,
};

export function getThemeComponents(themeName: string): ThemeComponents {
  return themeRegistry[themeName] || themeRegistry['Utterlog2026'];
}

export function getAvailableThemes(): string[] {
  return Object.keys(themeRegistry);
}
