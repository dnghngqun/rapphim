'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MovieCard from '@/components/MovieCard';
import { Movie } from '@/lib/api';

const API_BASE = '/api';

export default function GenrePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const page = parseInt(searchParams.get('page') || '1');

  const [selectedYear, setSelectedYear] = useState(searchParams.get('year') || '');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  // Generate last 20 years
  const currentYear = new Date().getFullYear();
  const years = Array.from({length: 20}, (_, i) => currentYear - i);

  useEffect(() => {
    setSelectedYear(searchParams.get('year') || '');
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    let url = `${API_BASE}/movies?genre=${slug}&page=${page}&limit=24&sort=year`;
    if (selectedYear) url += `&year=${selectedYear}`;
    
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setMovies(data.items || []);
        setTotalPages(data.pagination?.totalPages || 0);
        setTotalItems(data.pagination?.totalItems || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug, page, selectedYear]);

  // Capitalize format
  const genreName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedYear(val);
    router.push(`/danh-muc/${slug}?page=1${val ? `&year=${val}` : ''}`);
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
            style={{ padding: '8px 12px', borderRadius: '4px', background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            <option value="">Tất cả các năm</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="loading-spinner" />
        </div>
      ) : (
        <>
          <div className="movie-grid">{movies.map(m => <MovieCard key={m.id} movie={m} />)}</div>
          {totalPages > 1 && (
            <div className="pagination">
              {page > 1 && <Link href={`/danh-muc/${slug}?page=${page - 1}${selectedYear ? `&year=${selectedYear}` : ''}`}>← Trước</Link>}
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                let p = i + 1;
                if (totalPages > 10) {
                  p = Math.max(1, page - 4) + i;
                  if (p > totalPages) p = totalPages - 9 + i;
                }
                return (
                  <Link key={p} href={`/danh-muc/${slug}?page=${p}${selectedYear ? `&year=${selectedYear}` : ''}`} className={p === page ? 'active' : ''}>{p}</Link>
                );
              })}
              {page < totalPages && <Link href={`/danh-muc/${slug}?page=${page + 1}${selectedYear ? `&year=${selectedYear}` : ''}`}>Sau →</Link>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
