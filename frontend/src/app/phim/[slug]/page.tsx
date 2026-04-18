'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Movie, Episode } from '@/lib/api';
import VideoPlayer from '@/components/VideoPlayer';

const API_BASE = '/api';

function stripHtml(html: string): string {
  return html?.replace(/<[^>]*>/g, '') || '';
}

export default function MovieDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [movie, setMovie] = useState<Movie | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedServer, setSelectedServer] = useState(0);
  const [selectedEp, setSelectedEp] = useState<Episode | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE}/movies/${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.status) {
          setMovie(data.movie);
          setEpisodes(data.episodes || []);
          // Only pre-select the episode (highlight it), do NOT auto-load the player
          if (data.episodes?.length > 0) {
            let epToSelect = data.episodes[0];

            try {
              const historyContext = JSON.parse(localStorage.getItem('movie_history') || '{}');
              if (historyContext[slug] && historyContext[slug].episodeId) {
                const epId = historyContext[slug].episodeId;
                const foundEp = data.episodes.find((e: Episode) => e.id === epId);
                if (foundEp) epToSelect = foundEp;
              }
            } catch (e) { }

            setSelectedEp(epToSelect);
            // Don't set embedUrl here — wait for user to click play
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const handleEpisodeClick = (ep: Episode) => {
    setSelectedEp(ep);
    if (ep.servers?.length > 0) {
      const server = ep.servers[selectedServer] || ep.servers[0];
      setEmbedUrl(server.m3u8_url || server.embed_url);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', marginTop: 64 }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div style={{ textAlign: 'center', padding: 100, marginTop: 64 }}>
        <h2>Phim không tồn tại</h2>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 20 }}>← Về trang chủ</Link>
      </div>
    );
  }

  // Get unique server names
  const serverNames = Array.from(new Set(
    episodes.flatMap(ep => ep.servers?.map(s => s.server_name) || [])
  ));

  return (
    <>
      {/* Player */}
      {embedUrl && (
        <div className="player-section" style={{ marginTop: 80 }}>
          <div className="player-container">
            {embedUrl.includes('.m3u8') ? (
              <VideoPlayer
                url={embedUrl}
                movieSlug={movie.slug}
                episodeId={selectedEp?.id || 0}
                poster={movie.backdrop_url || movie.poster_url}
              />
            ) : (
              <iframe
                src={embedUrl}
                allowFullScreen={true}
                // @ts-ignore
                webkitallowfullscreen="true"
                // @ts-ignore
                mozallowfullscreen="true"
                allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-forms"
                title={`${movie.title} - ${selectedEp?.name || ''}`}
              />
            )}
          </div>
        </div>
      )}

      {/* Movie Info Banner */}
      <section className="detail-banner" style={embedUrl ? { minHeight: 'auto', marginTop: 0 } : {}}>
        {!embedUrl && (
          <>
            <div className="detail-banner-bg" style={{ backgroundImage: `url(${movie.backdrop_url || movie.poster_url})` }} />
            <div className="detail-banner-gradient" />
          </>
        )}

        <div className="detail-content" style={embedUrl ? { padding: '24px' } : {}}>
          <div className="detail-poster">
            <img src={movie.poster_url || movie.thumb_url} alt={movie.title} />
          </div>

          <div className="detail-info">
            <h1>{movie.title}</h1>
            {movie.original_title && (
              <p className="detail-original-title">{movie.original_title}</p>
            )}

            <div className="detail-meta">
              {movie.quality && <span className="badge badge-quality">{movie.quality}</span>}
              {movie.language && <span className="badge badge-lang">{movie.language}</span>}
              {movie.episode_current && <span className="badge badge-ep">{movie.episode_current}</span>}
              {movie.year && <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{movie.year}</span>}
              {movie.duration && <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{movie.duration}</span>}
            </div>

            <div className="detail-stats">
              {movie.tmdb_rating && parseFloat(movie.tmdb_rating) > 0 && (
                <div className="detail-stat">
                  <div className="detail-stat-value">⭐ {movie.tmdb_rating}</div>
                  <div className="detail-stat-label">TMDB</div>
                </div>
              )}
              {movie.imdb_rating && parseFloat(movie.imdb_rating) > 0 && (
                <div className="detail-stat">
                  <div className="detail-stat-value">🎬 {movie.imdb_rating}</div>
                  <div className="detail-stat-label">IMDb</div>
                </div>
              )}
              <div className="detail-stat">
                <div className="detail-stat-value">👁 {movie.view_count}</div>
                <div className="detail-stat-label">Lượt xem</div>
              </div>
            </div>

            <div className="detail-desc">
              {stripHtml(movie.description)}
            </div>

            {movie.director && (
              <p style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <strong>Đạo diễn:</strong> {movie.director}
              </p>
            )}
            {movie.actors && (
              <p style={{ marginTop: 6, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <strong>Diễn viên:</strong> {movie.actors}
              </p>
            )}

            <div className="detail-genre-tags">
              {movie.genres?.map((g, i) => (
                <span key={i} className="genre-tag">{typeof g === 'string' ? g : (g as any).name}</span>
              ))}
            </div>

            {!embedUrl && episodes.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleEpisodeClick(selectedEp || episodes[0])}
                >
                  ▶ {selectedEp && selectedEp.id !== episodes[0].id ? 'Tiếp Tục Xem' : 'Xem Phim'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Episode List */}
      {episodes.length > 0 && (
        <section className="episodes-section">
          <h2 className="episodes-title">Danh Sách Tập ({episodes.length} tập)</h2>

          {serverNames.length > 1 && (
            <div className="server-tabs">
              {serverNames.map((name, i) => (
                <button
                  key={name}
                  className={`server-tab ${selectedServer === i ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedServer(i);
                    if (selectedEp?.servers?.[i]) {
                      setEmbedUrl(selectedEp.servers[i].embed_url || selectedEp.servers[i].m3u8_url);
                    }
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <div className="episode-grid">
            {episodes.map(ep => (
              <button
                key={ep.id}
                className={`episode-btn ${selectedEp?.id === ep.id ? 'active' : ''}`}
                onClick={() => handleEpisodeClick(ep)}
              >
                {ep.name || `Tập ${ep.episode_number}`}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
