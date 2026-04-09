'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import MovieCard from '@/components/MovieCard';
import Pagination from '@/components/Pagination';
import { Movie } from '@/lib/api';

const API_BASE = '/api';

const TYPE_NAMES: Record<string, string> = {
  'phim-le': 'Phim Lẻ',
  'phim-bo': 'Phim Bộ',
  'hoathinh': 'Hoạt Hình',
  'tvshows': 'TV Shows',
};

export default function TypePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const type = params.type as string;
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
    let url = `${API_BASE}/movies?type=${type}&page=${page}&limit=24&sort=year`;
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
  }, [type, page, selectedYear]);

  const typeName = TYPE_NAMES[type] || type;

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedYear(val);
    router.push(`/the-loai/${type}?page=1${val ? `&year=${val}` : ''}`);
  };

  const buildHref = (p: number) =>
    `/the-loai/${type}?page=${p}${selectedYear ? `&year=${selectedYear}` : ''}`;

  return (
    <section className="section" style={{ marginTop: 64, minHeight: '60vh' }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <h1 className="section-title">{typeName} ({totalItems} phim)</h1>
        
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

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="loading-spinner" />
        </div>
      ) : (
        <>
          <div className="movie-grid">{movies.map(m => <MovieCard key={m.id} movie={m} />)}</div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            buildHref={buildHref}
          />
        </>
      )}
    </section>
  );
}
