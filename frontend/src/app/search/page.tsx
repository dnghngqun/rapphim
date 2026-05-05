'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import MovieCard from '@/components/MovieCard';
import FilterBar from '@/components/FilterBar';
import Link from 'next/link';
import { Movie } from '@/lib/api';

const API_BASE = '/api';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1');

  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
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
    if (!q) { setLoading(false); return; }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('q', q);
      params.set('page', page.toString());
      if (serverTypes.length > 0) params.set('server_types', serverTypes.join(','));

      fetch(`${API_BASE}/search?${params.toString()}`)
        .then(r => r.json())
        .then(data => {
          setMovies(data.items || []);
          setTotalPages(data.pagination?.totalPages || 0);
          setTotalItems(data.pagination?.totalItems || 0);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 400);

    setDebounceTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [q, page, serverTypes]);

  const handleFilterChange = (types: string[]) => {
    setServerTypes(types);
    localStorage.setItem('rapphim_filter_server_types', JSON.stringify(types));

    const params = new URLSearchParams();
    params.set('q', q);
    params.set('page', '1');
    if (types.length > 0) params.set('server_types', types.join(','));
    router.push(`${pathname}?${params.toString()}`);
  };

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set('q', q);
    params.set('page', p.toString());
    if (serverTypes.length > 0) params.set('server_types', serverTypes.join(','));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <section className="section" style={{ marginTop: 64, minHeight: '60vh' }}>
      <div className="section-header">
        <h1 className="section-title">
          {q ? `Kết quả cho "${q}" (${totalItems})` : 'Tìm kiếm phim'}
        </h1>
      </div>

      {q && <FilterBar selectedTypes={serverTypes} onFilterChange={handleFilterChange} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="loading-spinner" />
        </div>
      ) : movies.length > 0 ? (
        <>
          <div className="movie-grid">{movies.map(m => <MovieCard key={m.id} movie={m} />)}</div>

          {totalPages > 1 && (
            <div className="pagination">
              {page > 1 && <Link href={buildHref(page - 1)}>← Trước</Link>}
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
                <Link key={p} href={buildHref(p)} className={p === page ? 'active' : ''}>{p}</Link>
              ))}
              {page < totalPages && <Link href={buildHref(page + 1)}>Sau →</Link>}
            </div>
          )}
        </>
      ) : q ? (
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
          {serverTypes.length === 0 && <p>Hãy thử từ khóa khác</p>}
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
