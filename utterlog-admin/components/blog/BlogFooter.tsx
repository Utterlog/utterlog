import Link from 'next/link';

export default function BlogFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-line mt-16">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-dim">
          <p>&copy; {currentYear} Utterlog. All rights reserved.</p>
          <nav className="flex items-center gap-4">
            <Link href="/about" className="hover:text-main transition-colors">
              关于
            </Link>
            <Link href="/archives" className="hover:text-main transition-colors">
              归档
            </Link>
            <a
              href="/dashboard"
              className="hover:text-main transition-colors"
            >
              管理
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
