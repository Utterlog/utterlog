'use client';

import { usePlayer } from './hooks/usePlayer';
import FullscreenSkin from './skins/FullscreenSkin';
import VinylCardSkin from './skins/VinylCardSkin';
import MiniBarSkin from './skins/MiniBarSkin';
import FloatingCardSkin from './skins/FloatingCardSkin';

export default function MusicPage() {
  const player = usePlayer();

  if (player.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d', color: '#666' }}>
        加载中...
      </div>
    );
  }

  return (
    <>
      <audio
        ref={player.audioRef}
        src={player.song?.url || undefined}
        onTimeUpdate={player.onTimeUpdate}
        onLoadedMetadata={player.onLoadedMetadata}
        onEnded={player.onEnded}
      />
      {player.skin === 'fullscreen' && <FullscreenSkin {...player} />}
      {player.skin === 'vinyl-card' && <VinylCardSkin {...player} />}
      {player.skin === 'mini-bar' && <MiniBarSkin {...player} />}
      {player.skin === 'floating' && <FloatingCardSkin {...player} />}
    </>
  );
}
