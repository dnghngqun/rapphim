'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface VideoPlayerProps {
  url: string;
  movieSlug: string;
  episodeId: number;
  poster?: string;
}

export default function VideoPlayer({ url, movieSlug, episodeId, poster }: VideoPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSavedRef = useRef<number>(0);
  const lastTapRef = useRef<number>(0);



  const skip = (amount: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(
        videoRef.current.duration || Infinity,
        Math.max(0, videoRef.current.currentTime + amount)
      );
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') skip(-5);
      if (e.key === 'ArrowRight') skip(5);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let savedTime = 0;
    try {
      const historyContext = JSON.parse(localStorage.getItem('movie_history') || '{}');
      if (historyContext[movieSlug]?.episodeId === episodeId) {
        savedTime = historyContext[movieSlug].time || 0;
      }
    } catch (e) {
      console.error('Lỗi đọc lịch sử', e);
    }
    
    lastSavedRef.current = savedTime;

    const initPlayer = () => {
      // Hls.js supported browsers
      if (Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }
        
        const hls = new Hls({ 
          startPosition: savedTime > 0 ? savedTime : -1 
        });
        hlsRef.current = hls;
        
        hls.loadSource(url);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(e => console.log('Chưa thể tự động phát, cần tương tác:', e));
        });
        
      } 
      // Safari / iOS Safari that has native HLS support
      else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          if (savedTime > 0) {
            video.currentTime = savedTime;
          }
          video.play().catch(e => console.log('Chưa thể tự động phát:', e));
        }, { once: true });
      }
    };

    initPlayer();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [url, movieSlug, episodeId]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const current = Math.floor(video.currentTime);
    
    // Cứ 5 giây ghi vào localStorage 1 lần để tránh giật lag do lưu quá nhanh
    if (Math.abs(current - lastSavedRef.current) >= 5) {
      lastSavedRef.current = current;
      try {
        const historyContext = JSON.parse(localStorage.getItem('movie_history') || '{}');
        historyContext[movieSlug] = {
          episodeId,
          time: current,
          updatedAt: Date.now()
        };
        localStorage.setItem('movie_history', JSON.stringify(historyContext));
      } catch (e) {
        console.error('Lỗi khi lưu tiến độ', e);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width / 2) skip(-5);
    else skip(5);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!videoRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const touchX = e.changedTouches[0].clientX - rect.left;
      if (touchX < rect.width / 2) skip(-5);
      else skip(5);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', flexDirection: 'column' }}>
      <div 
        style={{ flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', minHeight: 0 }}
        onDoubleClick={handleDoubleClick}
        onTouchEnd={handleTouchEnd}
      >
        <video
          ref={videoRef}
          controls
          poster={poster}
          onTimeUpdate={handleTimeUpdate}
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        
        <button
          onClick={(e) => { e.stopPropagation(); skip(-5); }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '20px',
            transform: 'translateY(-50%)',
            background: 'rgba(0, 0, 0, 0.5)',
            border: 'none',
            borderRadius: '50%',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer',
            opacity: 0.6,
            transition: 'opacity 0.2s',
            zIndex: 10
          }}
          onMouseOver={e => e.currentTarget.style.opacity = '1'}
          onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
          title="Tua lùi 5s"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); skip(5); }}
          style={{
            position: 'absolute',
            top: '50%',
            right: '20px',
            transform: 'translateY(-50%)',
            background: 'rgba(0, 0, 0, 0.5)',
            border: 'none',
            borderRadius: '50%',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer',
            opacity: 0.6,
            transition: 'opacity 0.2s',
            zIndex: 10
          }}
          onMouseOver={e => e.currentTarget.style.opacity = '1'}
          onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
          title="Tua tiến 5s"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
        </button>
      </div>
    </div>
  );
}
