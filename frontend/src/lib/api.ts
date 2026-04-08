const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface Movie {
  id: number;
  title: string;
  original_title: string;
  slug: string;
  description: string;
  poster_url: string;
  thumb_url: string;
  backdrop_url: string;
  movie_type: string;
  status: string;
  quality: string;
  language: string;
  year: number;
  duration: string;
  total_episodes: number;
  current_episode: string;
  episode_current: string;
  imdb_rating: string;
  tmdb_rating: string;
  director: string;
  actors: string;
  trailer_url: string;
  view_count: number;
  genres: string[];
  countries: string[];
  genre_slugs?: string[];
  country_slugs?: string[];
}

export interface Episode {
  id: number;
  movie_id: number;
  episode_number: number;
  name: string;
  slug: string;
  servers: EpisodeServer[];
}

export interface EpisodeServer {
  id: number;
  server_name: string;
  server_type: string;
  embed_url: string;
  m3u8_url: string;
  quality: string;
  is_working: boolean;
}

export interface Genre {
  id: number;
  name: string;
  slug: string;
  movie_count: number;
}

export interface Country {
  id: number;
  name: string;
  slug: string;
  movie_count: number;
}

export interface PaginatedResponse<T> {
  status: boolean;
  items: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export interface MovieDetailResponse {
  status: boolean;
  movie: Movie;
  episodes: Episode[];
}

async function fetchAPI<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getMovies(params?: {
  page?: number; limit?: number; type?: string;
  genre?: string; country?: string; year?: string; sort?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.set(key, String(value));
    });
  }
  const query = searchParams.toString();
  return fetchAPI<PaginatedResponse<Movie>>(`/movies${query ? '?' + query : ''}`);
}

export async function getFeaturedMovies() {
  return fetchAPI<{ status: boolean; items: Movie[] }>('/movies/featured');
}

export async function getMovieBySlug(slug: string) {
  return fetchAPI<MovieDetailResponse>(`/movies/${slug}`);
}

export async function searchMovies(q: string, page = 1) {
  return fetchAPI<PaginatedResponse<Movie>>(`/search?q=${encodeURIComponent(q)}&page=${page}`);
}

export async function getGenres() {
  return fetchAPI<{ status: boolean; items: Genre[] }>('/genres');
}

export async function getCountries() {
  return fetchAPI<{ status: boolean; items: Country[] }>('/countries');
}
