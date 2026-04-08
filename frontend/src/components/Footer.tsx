import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="logo" style={{ fontSize: '1.3rem' }}>🎬 RapPhim</span>
          <p>
            RapPhim - Nền tảng xem phim online miễn phí hàng đầu.
            Phim mới cập nhật liên tục, chất lượng HD, Vietsub đầy đủ.
          </p>
        </div>

        <div className="footer-col">
          <h4>Thể Loại</h4>
          <ul>
            <li><Link href="/the-loai/phim-le">Phim Lẻ</Link></li>
            <li><Link href="/the-loai/phim-bo">Phim Bộ</Link></li>
            <li><Link href="/the-loai/hoathinh">Hoạt Hình</Link></li>
            <li><Link href="/the-loai/tvshows">TV Shows</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Quốc Gia</h4>
          <ul>
            <li><Link href="/quoc-gia/han-quoc">Hàn Quốc</Link></li>
            <li><Link href="/quoc-gia/trung-quoc">Trung Quốc</Link></li>
            <li><Link href="/quoc-gia/au-my">Âu Mỹ</Link></li>
            <li><Link href="/quoc-gia/nhat-ban">Nhật Bản</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Liên Hệ</h4>
          <ul>
            <li><a href="#">Giới thiệu</a></li>
            <li><a href="#">Điều khoản</a></li>
            <li><a href="#">Chính sách</a></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© 2026 RapPhim. Dự án học tập và nghiên cứu cá nhân.</p>
      </div>
    </footer>
  );
}
