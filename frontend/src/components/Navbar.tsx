'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <nav className="navbar" style={scrolled ? { background: 'rgba(10,10,15,0.95)' } : {}}>
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
          <li><Link href="/quoc-gia/han-quoc">Hàn Quốc</Link></li>
        </ul>

        <form className="search-bar" onSubmit={handleSearch}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Tìm phim, anime..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            id="search-input"
          />
        </form>
      </div>
    </nav>
  );
}
