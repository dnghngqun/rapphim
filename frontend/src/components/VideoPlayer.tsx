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
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSavedRef = useRef<number>(0);

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

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        controls
        poster={poster}
        onTimeUpdate={handleTimeUpdate}
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}
