'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import MovieCard from '@/components/MovieCard';
import Pagination from '@/components/Pagination';
import { Movie } from '@/lib/api';

const API_BASE = '/api';

function PhimMoiContent() {
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1');

  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/movies?page=${page}&limit=24&sort=updated_at`)
      .then(r => r.json())
      .then(data => {
        setMovies(data.items || []);
        setTotalPages(data.pagination?.totalPages || 0);
        setTotalItems(data.pagination?.totalItems || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page]);

  const buildHref = (p: number) => `/danh-sach/phim-moi?page=${p}`;

  return (
    <>
      <div className="section-header">
        <h1 className="section-title">
          🌟 Phim Mới Cập Nhật
          {totalItems > 0 && <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 10 }}>({totalItems.toLocaleString('vi-VN')} phim)</span>}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 6 }}>
          Danh sách phim mới được cập nhật gần đây nhất
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="loading-spinner" />
        </div>
      ) : movies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '2rem', marginBottom: 12 }}>🎬</p>
          <p>Chưa có phim nào được cập nhật.</p>
        </div>
      ) : (
        <>
          <div className="movie-grid">
            {movies.map(m => <MovieCard key={m.id} movie={m} />)}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            buildHref={buildHref}
          />
        </>
      )}
    </>
  );
}

export default function PhimMoiPage() {
  return (
    <section className="section" style={{ marginTop: 64, minHeight: '60vh' }}>
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="loading-spinner" />
        </div>
      }>
        <PhimMoiContent />
      </Suspense>
    </section>
  );
}

