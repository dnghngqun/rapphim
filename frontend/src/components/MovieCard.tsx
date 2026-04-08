import Link from 'next/link';
import { Movie } from '@/lib/api';

function stripHtml(html: string): string {
  return html?.replace(/<[^>]*>/g, '') || '';
}

export default function MovieCard({ movie }: { movie: Movie }) {
  const thumb = movie.thumb_url || movie.poster_url;
  const year = movie.year;
  const quality = movie.quality;
  const lang = movie.language;
  const episode = movie.episode_current || movie.current_episode;

  return (
    <Link href={`/phim/${movie.slug}`} className="movie-card" id={`movie-${movie.slug}`}>
      <div className="movie-poster">
        <img
          src={thumb || '/placeholder.jpg'}
          alt={movie.title}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" fill="%231a1a28"><rect width="200" height="300"/><text x="100" y="150" text-anchor="middle" fill="%23666" font-size="14">No Image</text></svg>'
            );
          }}
        />
        <div className="movie-poster-overlay">
          <div className="play-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        <div className="movie-badges">
          {quality && <span className="badge badge-quality">{quality}</span>}
          {lang && <span className="badge badge-lang">{lang}</span>}
        </div>

        {episode && (
          <div style={{ position: 'absolute', bottom: 8, left: 8 }}>
            <span className="badge badge-ep">{episode}</span>
          </div>
        )}
      </div>

      <div className="movie-info">
        <h3 className="movie-title">{movie.title}</h3>
        <div className="movie-meta">
          {year && <span>{year}</span>}
          {movie.genres && movie.genres.length > 0 && (
            <span>• {movie.genres[0]}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
