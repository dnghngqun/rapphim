'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import MovieCard from '@/components/MovieCard';
import Pagination from '@/components/Pagination';
import FilterBar from '@/components/FilterBar';
import { Movie } from '@/lib/api';

const API_BASE = '/api';

function PhimMoiContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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

  // Fetch movies with debounce
  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '24');
      params.set('sort', 'updated_at');
      if (serverTypes.length > 0) {
        params.set('server_types', serverTypes.join(','));
      }

      fetch(`${API_BASE}/movies?${params.toString()}`)
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
  }, [page, serverTypes]);

  const handleFilterChange = (types: string[]) => {
    setServerTypes(types);
    localStorage.setItem('rapphim_filter_server_types', JSON.stringify(types));

    // Update URL
    const params = new URLSearchParams(searchParams);
    if (types.length > 0) {
      params.set('server_types', types.join(','));
    } else {
      params.delete('server_types');
    }
    params.set('page', '1'); // Reset to page 1 when filter changes
    router.push(`${pathname}?${params.toString()}`);
  };

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set('page', p.toString());
    if (serverTypes.length > 0) {
      params.set('server_types', serverTypes.join(','));
    }
    return `/danh-sach/phim-moi?${params.toString()}`;
  };

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

      <FilterBar selectedTypes={serverTypes} onFilterChange={handleFilterChange} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="loading-spinner" />
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

