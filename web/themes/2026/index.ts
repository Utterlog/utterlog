/**
 * 2026 — Default Theme
 * 简洁优雅的博客主题，2026年默认主题
 */

// Re-export existing blog components as the default theme
export { default as Header } from '@/components/blog/BlogHeader';
export { default as Footer } from '@/components/blog/BlogFooter';
export { default as PostCard } from '@/components/blog/PostCard';
export { default as CommentSection } from '@/components/blog/CommentList';

// Theme-specific components
export { default as HomePage } from './HomePage';
export { default as PostPage } from './PostPage';
export { default as Layout } from './Layout';
