'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import MovieCard from '@/components/MovieCard';
import Link from 'next/link';
import { Movie } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1');

  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&page=${page}`)
      .then(r => r.json())
      .then(data => {
        setMovies(data.items || []);
        setTotalPages(data.pagination?.totalPages || 0);
        setTotalItems(data.pagination?.totalItems || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [q, page]);

  return (
    <section className="section" style={{ marginTop: 64, minHeight: '60vh' }}>
      <div className="section-header">
        <h1 className="section-title">
          {q ? `Kết quả cho "${q}" (${totalItems})` : 'Tìm kiếm phim'}
        </h1>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="loading-spinner" />
        </div>
      ) : movies.length > 0 ? (
        <>
          <div className="movie-grid">{movies.map(m => <MovieCard key={m.id} movie={m} />)}</div>

          {totalPages > 1 && (
            <div className="pagination">
              {page > 1 && <Link href={`/search?q=${q}&page=${page - 1}`}>← Trước</Link>}
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
                <Link key={p} href={`/search?q=${q}&page=${p}`} className={p === page ? 'active' : ''}>{p}</Link>
              ))}
              {page < totalPages && <Link href={`/search?q=${q}&page=${page + 1}`}>Sau →</Link>}
            </div>
          )}
        </>
      ) : q ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.2rem' }}>Không tìm thấy phim nào 😢</p>
          <p>Hãy thử từ khóa khác</p>
        </div>
      ) : null}
    </section>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 100, marginTop: 64 }}><div className="loading-spinner" /></div>}>
      <SearchContent />
    </Suspense>
  );
}
