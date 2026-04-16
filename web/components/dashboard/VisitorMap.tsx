'use client';

import { useEffect, useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import api from '@/lib/api';

interface MapPoint {
  lat: number;
  lon: number;
  country: string;
  city: string;
  code: string;
  count: number;
}

// Mapbox access token — set via NEXT_PUBLIC_MAPBOX_TOKEN in .env.
// Fall back to empty string; the map will fail to load but the rest of the
// dashboard won't crash. Get a free token at https://account.mapbox.com/
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
(mapboxgl as any).config.API_URL = process.env.NEXT_PUBLIC_MAPBOX_API_URL || 'https://api.mapbox.com';

export default function VisitorMap({ period }: { period: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  useEffect(() => {
    api.get(`/analytics/map?period=${period}`).then((r: any) => {
      setPoints(r.data?.points || []);
    }).catch(() => {});
  }, [period]);

  useEffect(() => {
    const fetchOnline = () => api.get('/analytics/online').then((r: any) => setOnlineUsers(r.data?.online || [])).catch(() => {});
    fetchOnline();
    const timer = setInterval(fetchOnline, 30000);
    return () => clearInterval(timer);
  }, []);

  // 初始化地图
  useEffect(() => {
    if (!mapRef.current) return;
    // 清理旧实例（HMR 热更新时）
    if (mapObjRef.current) {
      mapObjRef.current.remove();
      mapObjRef.current = null;
    }

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [105, 20],
      zoom: 1.2,
      minZoom: 1,
      maxZoom: 10,
      attributionControl: false,
      logoPosition: 'bottom-left',
      projection: 'mercator',
      renderWorldCopies: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapObjRef.current = map;

    map.on('load', () => {
      // 国家填充层（用 Mapbox 内置的 country boundaries）
      map.addSource('country-boundaries', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      });
      map.addLayer({
        id: 'country-fills',
        type: 'fill',
        source: 'country-boundaries',
        'source-layer': 'country_boundaries',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0,
        },
      }, 'country-label');
    });

    return () => {
      map.remove();
      mapObjRef.current = null;
    };
  }, []);

  // 数据变化时更新标记
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map) return;

    const update = () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];

      // 高亮有访客的国家 — 按访问量渐变
      const countryMap = new Map<string, number>();
      for (const p of points) {
        if (!p.code) continue;
        const code = p.code.toUpperCase();
        countryMap.set(code, (countryMap.get(code) || 0) + p.count);
      }
      const maxCountryCount = Math.max(...countryMap.values(), 1);

      if (map.getLayer('country-fills') && countryMap.size > 0) {
        // 构建 match 表达式：国家代码 → 透明度
        const matchExpr: any[] = ['match', ['get', 'iso_3166_1']];
        for (const [code, count] of countryMap) {
          const t = count / maxCountryCount;
          matchExpr.push(code, 0.08 + t * 0.25);
        }
        matchExpr.push(0); // 默认值

        map.setPaintProperty('country-fills', 'fill-opacity', matchExpr as any);
      }

      // 只显示在线用户绿点
      for (const u of onlineUsers) {
        if (!u.country_code) continue;
        const matched = points.find(p => p.code === u.country_code);
        if (!matched) continue;
        const el = document.createElement('div');
        el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 0 8px rgba(34,197,94,0.6);';
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([matched.lon, matched.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    };

    // 确保地图 style 加载完再更新
    const tryUpdate = () => {
      if (map.isStyleLoaded()) {
        update();
      } else {
        map.once('styledata', tryUpdate);
      }
    };
    tryUpdate();
  }, [points, onlineUsers]);

  return (
    <div style={{ border: '1px solid var(--color-border)', marginBottom: '20px', position: 'relative' }}>
      <style>{`.mapboxgl-ctrl-logo { display: none !important; }`}</style>
      <div ref={mapRef} style={{ width: '100%', height: '480px' }} />
    </div>
  );
}
