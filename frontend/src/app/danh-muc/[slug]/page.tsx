'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import MovieCard from '@/components/MovieCard';
import FilterBar from '@/components/FilterBar';
import { Movie } from '@/lib/api';

const API_BASE = '/api';

export default function GenrePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const slug = params.slug as string;
  const page = parseInt(searchParams.get('page') || '1');

  const [selectedYear, setSelectedYear] = useState(searchParams.get('year') || '');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [serverTypes, setServerTypes] = useState<string[]>([]);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Generate last 20 years
  const currentYear = new Date().getFullYear();
  const years = Array.from({length: 20}, (_, i) => currentYear - i);

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
    setSelectedYear(searchParams.get('year') || '');
  }, [searchParams]);

  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('genre', slug);
      params.set('page', page.toString());
      params.set('limit', '24');
      params.set('sort', 'year');
      if (selectedYear) params.set('year', selectedYear);
      if (serverTypes.length > 0) params.set('server_types', serverTypes.join(','));

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
  }, [slug, page, selectedYear, serverTypes]);

  // Capitalize format
  const genreName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedYear(val);
    const params = new URLSearchParams();
    params.set('page', '1');
    if (val) params.set('year', val);
    if (serverTypes.length > 0) params.set('server_types', serverTypes.join(','));
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleFilterChange = (types: string[]) => {
    setServerTypes(types);
    localStorage.setItem('rapphim_filter_server_types', JSON.stringify(types));

    const params = new URLSearchParams();
    params.set('page', '1');
    if (selectedYear) params.set('year', selectedYear);
    if (types.length > 0) params.set('server_types', types.join(','));
    router.push(`${pathname}?${params.toString()}`);
  };

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set('page', p.toString());
    if (selectedYear) params.set('year', selectedYear);
    if (serverTypes.length > 0) params.set('server_types', serverTypes.join(','));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <section className="section" style={{ marginTop: 64, minHeight: '60vh' }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <h1 className="section-title">Thể Loại: {genreName} ({totalItems} phim)</h1>

        <div className="filter-group" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{color: 'var(--text-muted)'}}>Lọc theo năm:</span>
          <select
            value={selectedYear}
            onChange={handleYearChange}
            style={{ padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
          >
            <option value="">Tất cả các năm</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <FilterBar selectedTypes={serverTypes} onFilterChange={handleFilterChange} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
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
          <div className="movie-grid">{movies.map(m => <MovieCard key={m.id} movie={m} />)}</div>
          {totalPages > 1 && (
            <div className="pagination">
              {page > 1 && <Link href={buildHref(page - 1)}>← Trước</Link>}
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                let p = i + 1;
                if (totalPages > 10) {
                  p = Math.max(1, page - 4) + i;
                  if (p > totalPages) p = totalPages - 9 + i;
                }
                return (
                  <Link key={p} href={buildHref(p)} className={p === page ? 'active' : ''}>{p}</Link>
                );
              })}
              {page < totalPages && <Link href={buildHref(page + 1)}>Sau →</Link>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
