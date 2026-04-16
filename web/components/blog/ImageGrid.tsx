'use client';

import LazyImage from './LazyImage';

interface ImageGridProps {
  images: { src: string; alt: string }[];
  cols?: number;
  exifMap?: Record<string, Record<string, string>>;
}

function getGridClass(count: number, cols?: number): string {
  if (cols) return `image-grid image-grid-cols-${cols}`;
  if (count === 1) return 'image-grid image-grid-1';
  if (count === 2) return 'image-grid image-grid-2';
  if (count === 3) return 'image-grid image-grid-3';
  if (count === 4) return 'image-grid image-grid-4';
  if (count === 5) return 'image-grid image-grid-5';
  if (count === 6) return 'image-grid image-grid-6';
  return 'image-grid image-grid-overflow';
}

export default function ImageGrid({ images, cols, exifMap }: ImageGridProps) {
  const gridStyle: React.CSSProperties = cols ? {
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
  } : {};

  return (
    <div className={getGridClass(images.length, cols)} style={gridStyle}>
      {images.map((img, i) => (
        <LazyImage
          key={i}
          src={img.src}
          alt={img.alt}
          exifData={exifMap?.[img.src]}
        />
      ))}
    </div>
  );
}
