'use client';

import { useEffect, useState } from 'react';

/**
 * 「回到顶部」按钮 —— 现在贴在 footer 右侧、.nebula-container 之外
 * （也就是页面最右侧），脱离主内容流，垂直居中于 footer。
 *
 * 注意：globals.css 给 .blog-main 加了 overflow-y: scroll !important，
 * 真正的滚动容器是 .blog-main 而非 window，因此监听 + 滚动目标都用它。
 *
 * 滚动距离 ≤ 400px：visibility:hidden 占位（避免按钮跳出/抖动）
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const main = document.querySelector('.blog-main') as HTMLElement | null;
    const update = () => {
      const scrollTop = main?.scrollTop ?? window.scrollY ?? 0;
      setVisible(scrollTop > 400);
    };
    update();
    main?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      main?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
    };
  }, []);

  const scrollToTop = () => {
    const main = document.querySelector('.blog-main') as HTMLElement | null;
    if (main) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <button
      type="button"
      className={`nebula-back-to-top${visible ? '' : ' is-hidden'}`}
      onClick={scrollToTop}
      title="回到顶部"
      aria-label="回到顶部"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <i className="fa-solid fa-arrow-up" aria-hidden="true" />
    </button>
  );
}
