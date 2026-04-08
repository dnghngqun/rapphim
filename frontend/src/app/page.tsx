'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import MovieCard from '@/components/MovieCard';
import { Movie } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function stripHtml(html: string): string {
  return html?.replace(/<[^>]*>/g, '') || '';
}

export default function HomePage() {
  const [featured, setFeatured] = useState<Movie[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [animeMovies, setAnimeMovies] = useState<Movie[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [featuredRes, moviesRes, animeRes] = await Promise.all([
          fetch(`${API_BASE}/movies/featured`).then(r => r.json()),
          fetch(`${API_BASE}/movies?limit=18&sort=latest`).then(r => r.json()),
          fetch(`${API_BASE}/movies?limit=12&type=hoathinh`).then(r => r.json()),
        ]);
        setFeatured(featuredRes.items || []);
        setMovies(moviesRes.items || []);
        setAnimeMovies(animeRes.items || []);
      } catch (err) {
        console.error('Load error:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Auto-rotate hero
  useEffect(() => {
    if (featured.length === 0) return;
    const timer = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % Math.min(featured.length, 5));
    }, 6000);
    return () => clearInterval(timer);
  }, [featured]);

  const heroMovie = featured[heroIndex];

  return (
    <>
      {/* Hero Banner */}
      {heroMovie && (
        <section className="hero">
          <div className="hero-slide" key={heroMovie.slug}>
            <div
              className="hero-bg"
              style={{ backgroundImage: `url(${heroMovie.backdrop_url || heroMovie.poster_url})` }}
            />
            <div className="hero-gradient" />
            <div className="hero-content">
              <div className="hero-badge">
                ⭐ {heroMovie.quality || 'HD'} • {heroMovie.language || 'Vietsub'}
              </div>
              <h1 className="hero-title">{heroMovie.title}</h1>
              <div className="hero-meta">
                <span>📅 {heroMovie.year}</span>
                {heroMovie.duration && <span>⏱ {heroMovie.duration}</span>}
                {heroMovie.genres?.[0] && <span>🎭 {heroMovie.genres[0]}</span>}
                {heroMovie.tmdb_rating && parseFloat(heroMovie.tmdb_rating) > 0 && (
                  <span>⭐ {heroMovie.tmdb_rating}</span>
                )}
              </div>
              <p className="hero-desc">
                {stripHtml(heroMovie.description).slice(0, 200)}...
              </p>
              <div className="hero-actions">
                <Link href={`/phim/${heroMovie.slug}`} className="btn btn-primary">
                  ▶ Xem Ngay
                </Link>
                <Link href={`/phim/${heroMovie.slug}`} className="btn btn-secondary">
                  ℹ Chi Tiết
                </Link>
              </div>

              {/* Hero dots */}
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                {featured.slice(0, 5).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setHeroIndex(i)}
                    style={{
                      width: i === heroIndex ? 32 : 10,
                      height: 10,
                      borderRadius: 5,
                      background: i === heroIndex ? 'var(--accent)' : 'rgba(255,255,255,0.3)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Phim Mới Cập Nhật */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Phim Mới Cập Nhật</h2>
          <Link href="/danh-sach/phim-moi" className="view-all">Xem tất cả →</Link>
        </div>
        {loading ? (
          <div className="movie-grid">
            {Array(12).fill(0).map((_, i) => (
              <div key={i} className="movie-card">
                <div className="skeleton" style={{ aspectRatio: '2/3' }} />
                <div style={{ padding: 12 }}>
                  <div className="skeleton" style={{ height: 16, marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 12, width: '60%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="movie-grid">
            {movies.map(movie => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </section>

      {/* Anime / Hoạt Hình */}
      {animeMovies.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Anime / Hoạt Hình</h2>
            <Link href="/the-loai/hoathinh" className="view-all">Xem tất cả →</Link>
          </div>
          <div className="movie-grid">
            {animeMovies.map(movie => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
