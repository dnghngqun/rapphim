'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MovieCard from '@/components/MovieCard';
import FilterBar from '@/components/FilterBar';
import { Movie } from '@/lib/api';

const API_BASE = '/api';

function stripHtml(html: string): string {
  return html?.replace(/<[^>]*>/g, '') || '';
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [featured, setFeatured] = useState<Movie[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [animeMovies, setAnimeMovies] = useState<Movie[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [serverTypes, setServerTypes] = useState<string[]>([]);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Initialize serverTypes from URL or localStorage
  useEffect(() => {
    const urlTypes = searchParams.get('server_types')?.split(',').filter(Boolean) || [];
    if (urlTypes.length > 0) {
      setServerTypes(urlTypes);
    } else {
      const saved = localStorage.getItem('rapphim_filter_server_types');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setServerTypes(parsed);
        } catch (e) {
          console.error('Failed to parse saved filter:', e);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      async function load() {
        try {
          const params = new URLSearchParams();
          if (serverTypes.length > 0) params.set('server_types', serverTypes.join(','));

          const [featuredRes, moviesRes, animeRes] = await Promise.all([
            fetch(`${API_BASE}/movies/featured`).then(r => r.json()),
            fetch(`${API_BASE}/movies?limit=18&sort=latest${serverTypes.length > 0 ? '&' + params.toString() : ''}`).then(r => r.json()),
            fetch(`${API_BASE}/movies?limit=12&type=hoathinh${serverTypes.length > 0 ? '&' + params.toString() : ''}`).then(r => r.json()),
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
    }, 400);

    setDebounceTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [serverTypes]);

  // Auto-rotate hero
  useEffect(() => {
    if (featured.length === 0) return;
    const timer = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % Math.min(featured.length, 5));
    }, 6000);
    return () => clearInterval(timer);
  }, [featured]);

  const handleFilterChange = (types: string[]) => {
    setServerTypes(types);
    localStorage.setItem('rapphim_filter_server_types', JSON.stringify(types));

    const params = new URLSearchParams();
    if (types.length > 0) params.set('server_types', types.join(','));
    router.push(`/?${params.toString()}`);
  };

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
        <FilterBar selectedTypes={serverTypes} onFilterChange={handleFilterChange} />
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
        ) : movies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '2rem', marginBottom: 12 }}>🔍</p>
            <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>Không tìm thấy phim nào</p>
            {serverTypes.length > 0 && (
              <>
                <p style={{ fontSize: '0.9rem', marginBottom: 16 }}>
                  Không có phim nào với bộ lọc hiện tại. Thử bỏ bớt điều kiện lọc để xem thêm phim.
                </p>
                <button
                  onClick={() => handleFilterChange([])}
                  style={{
                    padding: '10px 20px',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                  }}
                >
                  Xóa bộ lọc
                </button>
              </>
            )}
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

export default function HomePage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
        <div className="loading-spinner" />
      </div>
    }>
      <HomePageContent />
    </Suspense>
  );
}
