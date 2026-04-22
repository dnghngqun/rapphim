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

  const toggleFullscreen = async () => {
    const elem = wrapperRef.current as any;
    if (!elem) return;

    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      if (elem.requestFullscreen) await elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) await elem.webkitRequestFullscreen();
      else if (elem.msRequestFullscreen) await elem.msRequestFullscreen();
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
      else if ((document as any).msExitFullscreen) await (document as any).msExitFullscreen();
    }
  };

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
          controlsList="nofullscreen"
          poster={poster}
          onTimeUpdate={handleTimeUpdate}
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <div style={{ 
        padding: '16px', 
        background: 'rgba(18, 18, 26, 0.85)', 
        backdropFilter: 'blur(20px)', 
        borderTop: '1px solid rgba(255,255,255,0.08)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: '20px',
        borderRadius: '12px 12px 0 0'
      }}>
        <button 
          onClick={() => skip(-5)}
          className="skip-btn"
          style={{ 
            padding: '12px 20px', 
            background: 'rgba(255,255,255,0.1)', 
            backdropFilter: 'blur(10px)', 
            color: '#f0f0f5', 
            border: '1px solid rgba(255,255,255,0.15)', 
            borderRadius: '12px', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            fontSize: '0.9rem', 
            fontWeight: '500',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)'
          }}
          onMouseOver={e => { 
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; 
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
          }}
          onMouseOut={e => { 
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; 
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          title="Tua lùi 5s (Phím mũi tên trái)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          <span>Lùi 5s</span>
        </button>
        <button 
          onClick={() => skip(5)}
          className="skip-btn"
          style={{ 
            padding: '12px 20px', 
            background: 'rgba(255,255,255,0.1)', 
            backdropFilter: 'blur(10px)', 
            color: '#f0f0f5', 
            border: '1px solid rgba(255,255,255,0.15)', 
            borderRadius: '12px', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            fontSize: '0.9rem', 
            fontWeight: '500',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)'
          }}
          onMouseOver={e => { 
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; 
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
          }}
          onMouseOut={e => { 
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; 
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          title="Tua tiến 5s (Phím mũi tên phải)"
        >
          <span>Tiến 5s</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
        </button>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)' }}></div>

        <button 
          onClick={toggleFullscreen}
          className="fullscreen-btn"
          style={{ 
            padding: '12px 20px', 
            background: 'var(--accent, #7c5cfc)', 
            backdropFilter: 'blur(10px)', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '12px', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            fontSize: '0.9rem', 
            fontWeight: '600',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 4px 12px rgba(124, 92, 252, 0.3)'
          }}
          onMouseOver={e => { 
            e.currentTarget.style.background = 'var(--accent-light, #9d82ff)'; 
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(124, 92, 252, 0.4)';
          }}
          onMouseOut={e => { 
            e.currentTarget.style.background = 'var(--accent, #7c5cfc)'; 
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 92, 252, 0.3)';
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          title="Toàn màn hình"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          <span>Phóng to</span>
        </button>
      </div>
    </div>
  );
}
