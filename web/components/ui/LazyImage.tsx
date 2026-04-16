'use client';

import { useState, useRef, useEffect } from 'react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  spinnerSize?: number;
}

/**
 * 通用懒加载图片组件
 * - IntersectionObserver 检测是否进入视口（提前 300px 预加载）
 * - 未加载时显示条形旋转 spinner（主题色）
 * - 加载完成后淡入显示
 */
export default function LazyImage({ src, alt, spinnerSize = 28, style, className, ...props }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-bg-soft, #f0f0f0)',
        ...style,
      }}
    >
      {/* Bar spinner */}
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1,
        }}>
          <svg width={spinnerSize} height={spinnerSize} viewBox="0 0 2400 2400" xmlns="http://www.w3.org/2000/svg">
            <g strokeWidth="200" strokeLinecap="round" stroke="var(--color-primary, #999)" fill="none">
              <line x1="1200" y1="600" x2="1200" y2="100"/>
              <line opacity="0.5" x1="1200" y1="2300" x2="1200" y2="1800"/>
              <line opacity="0.917" x1="900" y1="680.4" x2="650" y2="247.4"/>
              <line opacity="0.417" x1="1750" y1="2152.6" x2="1500" y2="1719.6"/>
              <line opacity="0.833" x1="680.4" y1="900" x2="247.4" y2="650"/>
              <line opacity="0.333" x1="2152.6" y1="1750" x2="1719.6" y2="1500"/>
              <line opacity="0.75" x1="600" y1="1200" x2="100" y2="1200"/>
              <line opacity="0.25" x1="2300" y1="1200" x2="1800" y2="1200"/>
              <line opacity="0.667" x1="680.4" y1="1500" x2="247.4" y2="1750"/>
              <line opacity="0.167" x1="2152.6" y1="650" x2="1719.6" y2="900"/>
              <line opacity="0.583" x1="900" y1="1719.6" x2="650" y2="2152.6"/>
              <line opacity="0.083" x1="1750" y1="247.4" x2="1500" y2="680.4"/>
              <animateTransform attributeName="transform" attributeType="XML" type="rotate"
                keyTimes="0;0.08333;0.16667;0.25;0.33333;0.41667;0.5;0.58333;0.66667;0.75;0.83333;0.91667"
                values="0 1199 1199;30 1199 1199;60 1199 1199;90 1199 1199;120 1199 1199;150 1199 1199;180 1199 1199;210 1199 1199;240 1199 1199;270 1199 1199;300 1199 1199;330 1199 1199"
                dur="0.83333s" begin="0s" repeatCount="indefinite" calcMode="discrete"/>
            </g>
          </svg>
        </div>
      )}

      {/* Image */}
      {inView && (
        <img
          src={src}
          alt={alt || ''}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          {...props}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: loaded ? 1 : 0,
            filter: loaded ? 'blur(0)' : 'blur(20px)',
            transition: 'opacity 0.5s ease-in-out, filter 0.5s linear',
          }}
        />
      )}
    </div>
  );
}
