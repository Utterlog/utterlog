'use client';

import { useState, useEffect } from 'react';

interface Album {
  id: number;
  title: string;
  slug: string;
  description: string;
  cover_url: string;
  photo_count: number;
  created_at: number;
}

interface Photo {
  id: number;
  name: string;
  url: string;
  created_at: number;
}

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const apiBase = typeof window !== 'undefined'
    ? (window.location.port === '3000' ? 'http://localhost:8080' : '')
    : '';

  useEffect(() => {
    fetch(`${apiBase}/api/v1/public/albums?per_page=50`)
      .then(r => r.json())
      .then(r => {
        setAlbums(r.data?.albums || r.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const openAlbum = async (album: Album) => {
    setSelectedAlbum(album);
    setPhotos([]);
    try {
      const r = await fetch(`${apiBase}/api/v1/public/albums/${album.slug || album.id}?per_page=200`);
      const data = await r.json();
      setPhotos(data.data?.photos || []);
    } catch {}
  };

  const closeLightbox = () => setLightbox(null);
  const prevPhoto = () => setLightbox(i => i !== null && i > 0 ? i - 1 : i);
  const nextPhoto = () => setLightbox(i => i !== null && i < photos.length - 1 ? i + 1 : i);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevPhoto();
      if (e.key === 'ArrowRight') nextPhoto();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, photos.length]);

  if (loading) return <div style={{ padding: '60px 0', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>;

  // Album detail view
  if (selectedAlbum) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        <button onClick={() => { setSelectedAlbum(null); setPhotos([]); }} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary, #0052D9)',
          fontSize: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <i className="fa-solid fa-arrow-left" /> All Albums
        </button>

        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>{selectedAlbum.title}</h1>
        {selectedAlbum.description && (
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>{selectedAlbum.description}</p>
        )}

        {photos.length === 0 ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>This album is empty</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
          }}>
            {photos.map((photo, idx) => (
              <div key={photo.id} onClick={() => setLightbox(idx)} style={{
                aspectRatio: '4/3', overflow: 'hidden', cursor: 'pointer',
                background: '#f3f4f6', position: 'relative',
              }}>
                <img
                  src={photo.url}
                  alt={photo.name}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s' }}
                  onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
                />
              </div>
            ))}
          </div>
        )}

        {/* Lightbox */}
        {lightbox !== null && photos[lightbox] && (
          <div onClick={closeLightbox} style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <button onClick={e => { e.stopPropagation(); prevPhoto(); }} disabled={lightbox === 0} style={{
              position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '44px', height: '44px',
              cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fa-solid fa-chevron-left" />
            </button>

            <img
              src={photos[lightbox].url}
              alt=""
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
            />

            <button onClick={e => { e.stopPropagation(); nextPhoto(); }} disabled={lightbox === photos.length - 1} style={{
              position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '44px', height: '44px',
              cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fa-solid fa-chevron-right" />
            </button>

            <button onClick={closeLightbox} style={{
              position: 'absolute', top: '20px', right: '20px',
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '36px', height: '36px',
              cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fa-solid fa-xmark" />
            </button>

            <div style={{ position: 'absolute', bottom: '20px', color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
              {lightbox + 1} / {photos.length}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Albums grid
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Albums</h1>

      {albums.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '60px 0' }}>No albums yet</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
        }}>
          {albums.map(album => (
            <div key={album.id} onClick={() => openAlbum(album)} style={{
              cursor: 'pointer', overflow: 'hidden', background: '#fff',
              border: '1px solid #e5e7eb', transition: 'box-shadow 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
            onMouseOut={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ height: '200px', background: '#f3f4f6', overflow: 'hidden' }}>
                {album.cover_url ? (
                  <img src={album.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-light fa-images" style={{ fontSize: '40px', color: '#d1d5db' }} />
                  </div>
                )}
              </div>
              <div style={{ padding: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{album.title}</h2>
                {album.description && (
                  <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album.description}</p>
                )}
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>{album.photo_count} photos</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
