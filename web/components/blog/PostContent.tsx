'use client';

import './code-highlight-styles.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypePrism from 'rehype-prism-plus';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import 'prismjs/themes/prism-tomorrow.css';

import { AnnotationProvider } from './AnnotationProvider';
import BlockAnnotation from './BlockAnnotation';
import LazyImage from './LazyImage';
import ImageGrid from './ImageGrid';

interface PostContentProps {
  content: string;
  postId?: number;
}

// Code block with copy button + collapse for >20 lines
function CodeBlock({ children, className, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [lineCount, setLineCount] = useState(0);
  const codeRef = useRef<HTMLPreElement>(null);

  // Count lines from rendered DOM
  useEffect(() => {
    if (!codeRef.current) return;
    const lines = codeRef.current.querySelectorAll('.code-line');
    setLineCount(lines.length > 0 ? lines.length : (codeRef.current.textContent?.split('\n').length || 1));
  }, [children]);

  const showLineNumbers = lineCount > 1;
  const isLong = lineCount > 20;

  const handleCopy = async () => {
    // Extract only actual code text, skipping line numbers
    const pre = codeRef.current;
    if (!pre) return;
    const codeElement = pre.querySelector('code');
    let text = '';
    if (codeElement) {
      // Get text from each .code-line span, ignoring ::before pseudo-elements
      const lines = codeElement.querySelectorAll('.code-line');
      if (lines.length > 0) {
        text = Array.from(lines).map(line => {
          // Clone, remove any line-number elements if they exist as real nodes
          const clone = line.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('.line-number-style').forEach(n => n.remove());
          return clone.textContent || '';
        }).join('\n');
      } else {
        text = codeElement.textContent || '';
      }
    } else {
      text = pre.textContent || '';
    }
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className={`code-block-wrapper${isLong && collapsed ? ' collapsed' : ''}${showLineNumbers ? ' with-line-numbers' : ''}`}>
      {/* Copy button */}
      <button className="code-copy-btn" onClick={handleCopy} title="复制代码">
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        )}
      </button>
      <pre ref={codeRef} className={className} {...props}>
        {children}
      </pre>
      {/* Expand/collapse for long code */}
      {isLong && (
        <button className="code-expand-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? `展开全部 (${lineCount} 行)` : '收起'}
        </button>
      )}
    </div>
  );
}

// Lightbox
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);

    // Lock scroll on ALL possible scroll containers:
    //   - document.body (plain pages, tag/category/archive)
    //   - .blog-main    (Azure theme Layout.tsx uses this as the scroller)
    // Without locking .blog-main, wheel events bubble up and scroll the article
    // behind the lightbox; clicking to zoom causes visible layout shift.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPadding = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;

    const blogMain = document.querySelector('.blog-main') as HTMLElement | null;
    const prevMainOverflow = blogMain?.style.overflow || '';
    if (blogMain) blogMain.style.overflow = 'hidden';

    // Also block wheel/touchmove reaching ancestors (defense-in-depth when the
    // overlay itself uses preventDefault in a passive listener context).
    const blockScroll = (e: Event) => { e.preventDefault(); };
    document.addEventListener('wheel', blockScroll, { passive: false, capture: false });
    document.addEventListener('touchmove', blockScroll, { passive: false, capture: false });

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('wheel', blockScroll);
      document.removeEventListener('touchmove', blockScroll);
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.paddingRight = prevBodyPadding;
      if (blogMain) blogMain.style.overflow = prevMainOverflow;
    };
  }, [onClose]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Don't preventDefault here — the document-level non-passive listener in
    // useEffect already cancels all wheel scrolling while the lightbox is open.
    // React synthetic wheel is passive by default in React 17+, so calling
    // preventDefault here produces a noisy console warning with no effect.
    setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPosition({ x: e.clientX - lastPos.current.x, y: e.clientY - lastPos.current.y });
  }, []);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div
      className="lightbox-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <button className="lightbox-close" onClick={onClose} title="关闭 (Esc)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <img
        src={src}
        alt={alt}
        className="lightbox-image"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          cursor: scale > 1 ? 'grab' : 'zoom-in',
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (scale <= 1) setScale(2);
          else { setScale(1); setPosition({ x: 0, y: 0 }); }
        }}
        draggable={false}
      />
    </div>
  );
}

// External link with icon + mshots preview bubble tooltip
function ExternalLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [hover, setHover] = useState(false);
  const siteHost = process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '') || '';
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://')) && (!siteHost || !href.includes(siteHost));

  if (!isExternal) {
    return <a href={href} {...props}>{children}</a>;
  }

  // Skip preview for file downloads (zip, pdf, exe, etc.)
  const fileExts = /\.(zip|rar|7z|tar|gz|pdf|exe|dmg|apk|deb|rpm|msi|iso|mp3|mp4|avi|mov|mkv)(\?|$)/i;
  const showPreview = !fileExts.test(href!);
  const mshotsUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(href!)}?w=400&h=300`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="blog-external-link"
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => { if (e.button !== 0) e.preventDefault(); }}
      {...props}
    >
      <img
        src={`https://ico.bluecdn.com/${(() => { try { return new URL(href!).hostname; } catch { return ''; } })()}`}
        alt=""
        width={16}
        height={16}
        style={{ width: '16px', height: '16px', minWidth: '16px', minHeight: '16px', verticalAlign: 'middle', display: 'inline-block', marginRight: '4px', marginTop: '-2px' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {children}
      <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '10px', marginLeft: '3px', opacity: 0.5, verticalAlign: 'middle' }} />
      {hover && showPreview && (
        <span style={{
          position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)',
          marginBottom: '6px', zIndex: 99999, width: '300px', borderRadius: '1px',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden', pointerEvents: 'none',
        }}>
          <span style={{ display: 'block', width: '100%', height: '170px', background: '#f5f5f5' }}>
            <img src={mshotsUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', fontSize: '11px', color: '#888', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            <i className="fa-regular fa-globe" style={{ fontSize: '12px', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(() => { try { const u = new URL(href!); return u.origin + '/'; } catch { return href; } })()}
            </span>
          </span>
        </span>
      )}
    </a>
  );
}

// Detect consecutive markdown images and wrap in grid container
function processImageGrids(text: string): string {
  const imgPattern = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;
  const lines = text.split('\n');
  const result: string[] = [];
  let group: { alt: string; src: string }[] = [];

  const flushGroup = () => {
    if (group.length >= 2) {
      const imgs = group.map(g =>
        `<img data-grid-src="${g.src}" data-grid-alt="${g.alt.replace(/"/g, '&quot;')}" />`
      ).join('');
      result.push(`<div data-image-grid data-count="${group.length}">${imgs}</div>`);
    } else if (group.length === 1) {
      // Single image — keep as markdown
      result.push(`![${group[0].alt}](${group[0].src})`);
    }
    group = [];
  };

  for (const line of lines) {
    const match = line.match(imgPattern);
    if (match) {
      group.push({ alt: match[1], src: match[2] });
    } else if (line.trim() === '' && group.length > 0) {
      // Allow blank lines between consecutive images
      continue;
    } else {
      flushGroup();
      result.push(line);
    }
  }
  flushGroup();
  return result.join('\n');
}

// Process shortcodes in content
function processShortcodes(text: string): string {
  // [music platform="netease" id="xxx" title="xxx" artist="xxx" cover="xxx"][/music]
  text = text.replace(
    /\[music\s+platform="([^"]*)"\s+id="([^"]*)"\s+title="([^"]*)"\s+artist="([^"]*)"\s+cover="([^"]*)"\]\[\/music\]/g,
    (_, platform, id, title, artist, cover) => {
      const streamUrl = id ? `https://meting.yite.net/api/v1/${platform}/songs/${id}/stream` : '';
      const coverUrl = cover || (id ? `https://meting.yite.net/api/v1/${platform}/songs/${id}/cover` : '');
      return `<div data-music-player data-platform="${platform}" data-id="${id}" data-title="${title}" data-artist="${artist}" data-cover="${coverUrl}" data-url="${streamUrl}"></div>`;
    }
  );
  // [video]url[/video]
  text = text.replace(/\[video\]([\s\S]*?)\[\/video\]/g, (_, url) => {
    const u = url.trim();
    const ytMatch = u.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="width:100%;height:400px;border:none" allowfullscreen></iframe>`;
    const bvMatch = u.match(/(BV[a-zA-Z0-9]+)/);
    if (bvMatch) return `<iframe src="https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0" style="width:100%;height:400px;border:none" allowfullscreen></iframe>`;
    return `<video controls style="width:100%;max-height:400px"><source src="${u}" /></video>`;
  });
  // [collapse title="xxx"]content[/collapse]
  text = text.replace(/\[collapse\s+title="([^"]*)"\]\n?([\s\S]*?)\[\/collapse\]/g, (_, title, body) => {
    return `<details style="margin:16px 0;border:1px solid #e5e5e5"><summary style="padding:12px 16px;cursor:pointer;font-weight:500">${title}</summary><div style="padding:12px 16px;border-top:1px dashed #e5e5e5">${body}</div></details>`;
  });
  // [download title="xxx" desc="xxx" url="xxx"]
  text = text.replace(/\[download\s+title="([^"]*)"\s+desc="([^"]*)"\s+url="([^"]*)"\]/g, (_, title, desc, url) => {
    return `<div style="margin:16px 0;padding:16px 20px;background:#1a1a1a;color:#fff;display:flex;align-items:center;gap:16px"><div style="width:44px;height:44px;background:#f5a623;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-download" style="font-size:18px;color:#1a1a1a"></i></div><div style="flex:1"><div style="font-size:15px;font-weight:600">${title}</div><div style="font-size:12px;opacity:0.7;margin-top:2px">${desc}</div></div><a href="${url}" target="_blank" rel="noopener noreferrer" style="padding:8px 20px;background:#f5a623;color:#1a1a1a;font-weight:600;font-size:13px;text-decoration:none;flex-shrink:0">立即下载</a></div>`;
  });
  // [color=#hex]text[/color]
  text = text.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/g, (_, color, t) => {
    return `<span style="color:${color}">${t}</span>`;
  });
  // [grid cols=N]images[/grid]
  text = text.replace(/\[grid(?:\s+cols=(\d+))?\]([\s\S]*?)\[\/grid\]/g, (_, cols, body) => {
    const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images: { alt: string; src: string }[] = [];
    let m;
    while ((m = imgRe.exec(body)) !== null) {
      images.push({ alt: m[1], src: m[2] });
    }
    if (images.length === 0) return '';
    const colsAttr = cols ? ` data-cols="${cols}"` : '';
    const imgs = images.map(g =>
      `<img data-grid-src="${g.src}" data-grid-alt="${g.alt.replace(/"/g, '&quot;')}" />`
    ).join('');
    return `<div data-image-grid data-count="${images.length}"${colsAttr}>${imgs}</div>`;
  });
  return text;
}

export default function PostContent({ content, postId }: PostContentProps) {
  // Block counters for annotation block_ids
  const blockCounters = useRef({ p: 0, pre: 0, img: 0 });
  // Reset counters on content change
  useEffect(() => { blockCounters.current = { p: 0, pre: 0, img: 0 }; }, [content]);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [exifMap, setExifMap] = useState<Record<string, Record<string, string>>>({});

  // Attach click handler to all images inside blog-prose
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest('.blog-image img') as HTMLImageElement;
      if (img) {
        setLightbox({ src: img.src, alt: img.alt || '' });
      }
    };
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, []);

  // Fetch EXIF data for all images in the post
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const imgs = el.querySelectorAll('.blog-image img');
      const urls = Array.from(imgs).map(img => (img as HTMLImageElement).src).filter(Boolean);
      if (urls.length === 0) return;
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
      fetch(`${apiBase}/media/exif?urls=${urls.map(encodeURIComponent).join(',')}`)
        .then(r => r.json())
        .then(r => { if (r.data) setExifMap(r.data); })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [content]);

  const inner = (
    <>
      <div className="blog-prose" ref={containerRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            rehypeRaw,
            [rehypePrism, { showLineNumbers: true, ignoreMissing: true }] as any,
            rehypeSlug,
          ]}
          components={{
            p: ({ node, children, ...props }) => {
              const id = `p-${blockCounters.current.p++}`;
              const el = <p {...props}>{children}</p>;
              return postId ? <BlockAnnotation blockId={id}>{el}</BlockAnnotation> : el;
            },
            img: ({ node, ...props }) => <LazyImage {...props} exifData={typeof props.src === 'string' ? exifMap[props.src] : undefined} />,
            pre: ({ node, ...props }) => {
              const id = `code-${blockCounters.current.pre++}`;
              const el = <CodeBlock {...props} />;
              return postId ? <BlockAnnotation blockId={id}>{el}</BlockAnnotation> : el;
            },
            a: ({ node, ...props }) => <ExternalLink {...props} />,
            div: ({ node, ...props }) => {
              const el = props as any;
              // Image grid
              if (el['data-image-grid'] !== undefined) {
                const images: { src: string; alt: string }[] = [];
                // Extract images from child <img> elements with data-grid-src
                if (node?.children) {
                  for (const child of node.children) {
                    if (child.type === 'element' && child.tagName === 'img') {
                      const p = child.properties as any;
                      if (p?.['dataGridSrc']) {
                        images.push({ src: String(p['dataGridSrc']), alt: String(p['dataGridAlt'] || '') });
                      }
                    }
                  }
                }
                if (images.length > 0) {
                  const cols = el['data-cols'] ? parseInt(el['data-cols']) : undefined;
                  return <ImageGrid images={images} cols={cols} exifMap={exifMap} />;
                }
              }
              // Music player shortcode
              if (el['data-music-player'] !== undefined) {
                const MusicPlayer = require('@/components/blog/MusicPlayer').default;
                return <MusicPlayer
                  title={el['data-title'] || ''}
                  artist={el['data-artist'] || ''}
                  cover={el['data-cover'] || ''}
                  url={el['data-url'] || ''}
                  platform={el['data-platform'] || 'netease'}
                  id={el['data-id'] || ''}
                />;
              }
              return <div {...props} />;
            },
          }}
        >
          {processShortcodes(processImageGrids(content))}
        </ReactMarkdown>
      </div>
      {lightbox && (
        <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </>
  );

  if (postId) {
    return <AnnotationProvider postId={postId}>{inner}</AnnotationProvider>;
  }
  return inner;
}
