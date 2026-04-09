'use client';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Suggestion {
  id: number;
  slug: string;
  title: string;
  thumb_url: string;
  year: number;
  movie_type: string;
}

export default function Navbar() {
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sticky scroll effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Click outside and touch outside to close suggestions
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        inputRef.current?.blur();
      }
    };
    
    // Listen for window scroll to aggressively close the popup when scrolling the page
    const handleScroll = () => {
      setShowSuggestions(false);
      inputRef.current?.blur();
    };

    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Debounced search suggestions
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/movies?search=${encodeURIComponent(q.trim())}&limit=6&page=1`);
      const data = await res.json();
      const items: Suggestion[] = (data.items || []).slice(0, 6);
      setSuggestions(items);
      setShowSuggestions(items.length > 0);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleSuggestionClick = (slug: string) => {
    setShowSuggestions(false);
    setQuery('');
    router.push(`/phim/${slug}`);
  };

  const TYPE_LABEL: Record<string, string> = {
    'phim-le': 'Phim Lẻ',
    'phim-bo': 'Phim Bộ',
    'hoathinh': 'Hoạt Hình',
    'tvshows': 'TV Shows',
  };

  return (
    <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
      <div className="navbar-inner">
        <Link href="/" className="logo">🎬 RapPhim</Link>

        <ul className="nav-links">
          <li className="dropdown">
            <a href="#" onClick={(e) => e.preventDefault()}>Thể Loại ▾</a>
            <ul className="dropdown-menu">
              <li><Link href="/danh-muc/hanh-dong">Hành Động</Link></li>
              <li><Link href="/danh-muc/hai-huoc">Hài Hước</Link></li>
              <li><Link href="/danh-muc/tinh-cam">Tình Cảm</Link></li>
              <li><Link href="/danh-muc/kinh-di">Kinh Dị</Link></li>
              <li><Link href="/danh-muc/co-trang">Cổ Trang</Link></li>
              <li><Link href="/danh-muc/vo-thuat">Võ Thuật</Link></li>
              <li><Link href="/danh-muc/khoa-hoc-vien-tuong">Viễn Tưởng</Link></li>
              <li><Link href="/danh-muc/phieu-luu">Phiêu Lưu</Link></li>
              <li><Link href="/danh-muc/anime">Anime</Link></li>
              <li><Link href="/danh-muc/than-thoai">Thần Thoại</Link></li>
              <li><Link href="/danh-muc/hoc-duong">Học Đường</Link></li>
              <li><Link href="/danh-muc/bi-an">Bí Ẩn</Link></li>
            </ul>
          </li>
          <li><Link href="/danh-muc/anime">Anime</Link></li>
          <li><Link href="/the-loai/phim-le">Phim Lẻ</Link></li>
          <li><Link href="/the-loai/phim-bo">Phim Bộ</Link></li>
          <li><Link href="/the-loai/hoathinh">Hoạt Hình</Link></li>
          <li><Link href="/danh-sach/phim-moi">Phim Mới</Link></li>
          <li><Link href="/quoc-gia/han-quoc">Hàn Quốc</Link></li>
        </ul>

        {/* Search với suggestions */}
        <div className="search-wrapper" ref={wrapperRef}>
          <form className="search-bar" onSubmit={handleSearch}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="Tìm phim, anime..."
              value={query}
              onChange={handleQueryChange}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              id="search-input"
              autoComplete="off"
            />
            {loadingSuggestions && (
              <span className="search-loading" />
            )}
          </form>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="search-suggestions">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="suggestion-item"
                  onMouseDown={() => handleSuggestionClick(s.slug)}
                >
                  {s.thumb_url ? (
                    <img
                      src={s.thumb_url}
                      alt={s.title}
                      className="suggestion-thumb"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="suggestion-thumb suggestion-thumb-placeholder">🎬</div>
                  )}
                  <div className="suggestion-info">
                    <span className="suggestion-title">{s.title}</span>
                    <span className="suggestion-meta">
                      {s.year && `${s.year} · `}{TYPE_LABEL[s.movie_type] || s.movie_type}
                    </span>
                  </div>
                </div>
              ))}
              <div
                className="suggestion-see-all"
                onMouseDown={handleSearch}
              >
                Xem tất cả kết quả cho &quot;{query}&quot; →
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
