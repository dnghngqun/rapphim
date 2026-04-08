-- =============================================
-- RapPhim Database Schema
-- =============================================

-- Bảng nguồn crawl
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    source_type VARCHAR(20) DEFAULT 'api' CHECK (source_type IN ('api', 'web', 'ai-discovered')),
    is_active BOOLEAN DEFAULT TRUE,
    crawl_config JSONB DEFAULT '{}',
    last_crawled_at TIMESTAMP,
    total_movies INTEGER DEFAULT 0,
    total_working_links INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng thể loại
CREATE TABLE IF NOT EXISTS genres (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng quốc gia
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng phim chính
CREATE TABLE IF NOT EXISTS movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    original_title VARCHAR(500),
    slug VARCHAR(500) NOT NULL UNIQUE,
    description TEXT,
    poster_url TEXT,
    thumb_url TEXT,
    backdrop_url TEXT,
    movie_type VARCHAR(30) DEFAULT 'phim-le'
        CHECK (movie_type IN ('phim-le','phim-bo','hoathinh','tvshows','anime','short-drama')),
    status VARCHAR(50),
    quality VARCHAR(20),
    language VARCHAR(100),
    year INTEGER,
    duration VARCHAR(50),
    total_episodes INTEGER DEFAULT 1,
    current_episode VARCHAR(100),
    episode_current VARCHAR(100),
    imdb_id VARCHAR(20),
    tmdb_id VARCHAR(20),
    imdb_rating DECIMAL(3,1),
    tmdb_rating DECIMAL(3,1),
    director TEXT,
    actors TEXT,
    trailer_url TEXT,
    view_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    is_copyright BOOLEAN DEFAULT FALSE,
    chieurap BOOLEAN DEFAULT FALSE,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    source_name VARCHAR(100),
    source_url TEXT,
    external_id VARCHAR(255),
    last_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng liên kết phim - thể loại
CREATE TABLE IF NOT EXISTS movie_genres (
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
    genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (movie_id, genre_id)
);

-- Bảng liên kết phim - quốc gia
CREATE TABLE IF NOT EXISTS movie_countries (
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
    country_id INTEGER REFERENCES countries(id) ON DELETE CASCADE,
    PRIMARY KEY (movie_id, country_id)
);

-- Bảng tập phim
CREATE TABLE IF NOT EXISTS episodes (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL DEFAULT 1,
    name VARCHAR(200),
    slug VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(movie_id, episode_number)
);

-- Bảng server/nguồn phát cho mỗi tập
CREATE TABLE IF NOT EXISTS episode_servers (
    id SERIAL PRIMARY KEY,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
    server_name VARCHAR(200) NOT NULL,
    server_type VARCHAR(50) DEFAULT 'vietsub',
    embed_url TEXT,
    m3u8_url TEXT,
    quality VARCHAR(20),
    is_working BOOLEAN DEFAULT TRUE,
    last_checked TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng crawl history
CREATE TABLE IF NOT EXISTS crawl_logs (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    source_name VARCHAR(100),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','success','failed','cancelled')),
    mode VARCHAR(20) DEFAULT 'incremental',
    total_found INTEGER DEFAULT 0,
    total_new INTEGER DEFAULT 0,
    total_updated INTEGER DEFAULT 0,
    total_verified INTEGER DEFAULT 0,
    total_broken INTEGER DEFAULT 0,
    error_message TEXT,
    details JSONB DEFAULT '{}'
);

-- Bảng AI-discovered sites
CREATE TABLE IF NOT EXISTS discovered_sites (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    domain VARCHAR(255),
    site_name VARCHAR(200),
    discovered_by VARCHAR(50),
    analysis JSONB DEFAULT '{}',
    scraper_config JSONB DEFAULT '{}',
    movie_types TEXT[], 
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_movies_slug ON movies(slug);
CREATE INDEX IF NOT EXISTS idx_movies_type ON movies(movie_type);
CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(year);
CREATE INDEX IF NOT EXISTS idx_movies_source ON movies(source_name);
CREATE INDEX IF NOT EXISTS idx_movies_featured ON movies(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_movies_updated ON movies(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_movies_created ON movies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movies_fulltext ON movies USING gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(original_title,'')));
CREATE INDEX IF NOT EXISTS idx_episodes_movie ON episodes(movie_id);
CREATE INDEX IF NOT EXISTS idx_episode_servers_episode ON episode_servers(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_servers_working ON episode_servers(is_working) WHERE is_working = TRUE;
CREATE INDEX IF NOT EXISTS idx_crawl_logs_source ON crawl_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_genres_slug ON genres(slug);
CREATE INDEX IF NOT EXISTS idx_countries_slug ON countries(slug);

-- =============================================
-- Seed Data: Genres
-- =============================================
INSERT INTO genres (name, slug) VALUES
    ('Hành Động', 'hanh-dong'),
    ('Phiêu Lưu', 'phieu-luu'),
    ('Hoạt Hình', 'hoat-hinh'),
    ('Hài Hước', 'hai-huoc'),
    ('Hình Sự', 'hinh-su'),
    ('Tài Liệu', 'tai-lieu'),
    ('Chính Kịch', 'chinh-kich'),
    ('Gia Đình', 'gia-dinh'),
    ('Giả Tưởng', 'gia-tuong'),
    ('Lịch Sử', 'lich-su'),
    ('Kinh Dị', 'kinh-di'),
    ('Nhạc', 'nhac'),
    ('Bí Ẩn', 'bi-an'),
    ('Lãng Mạn', 'lang-man'),
    ('Khoa Học Viễn Tưởng', 'khoa-hoc-vien-tuong'),
    ('Phim Truyền Hình', 'phim-truyen-hinh'),
    ('Gay Cấn', 'gay-can'),
    ('Chiến Tranh', 'chien-tranh'),
    ('Miền Tây', 'mien-tay'),
    ('Tâm Lý', 'tam-ly'),
    ('Tình Cảm', 'tinh-cam'),
    ('Cổ Trang', 'co-trang'),
    ('Viễn Tưởng', 'vien-tuong'),
    ('Thể Thao', 'the-thao'),
    ('Võ Thuật', 'vo-thuat'),
    ('Học Đường', 'hoc-duong'),
    ('Kiếm Hiệp', 'kiem-hiep'),
    ('Thần Thoại', 'than-thoai'),
    ('Anime', 'anime'),
    ('Short Drama', 'short-drama')
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- Seed Data: Countries
-- =============================================
INSERT INTO countries (name, slug) VALUES
    ('Việt Nam', 'viet-nam'),
    ('Hàn Quốc', 'han-quoc'),
    ('Trung Quốc', 'trung-quoc'),
    ('Nhật Bản', 'nhat-ban'),
    ('Thái Lan', 'thai-lan'),
    ('Âu Mỹ', 'au-my'),
    ('Đài Loan', 'dai-loan'),
    ('Hồng Kông', 'hong-kong'),
    ('Ấn Độ', 'an-do'),
    ('Anh', 'anh'),
    ('Pháp', 'phap'),
    ('Canada', 'canada'),
    ('Đức', 'duc'),
    ('Tây Ban Nha', 'tay-ban-nha'),
    ('Thổ Nhĩ Kỳ', 'tho-nhi-ky'),
    ('Hà Lan', 'ha-lan'),
    ('Indonesia', 'indonesia'),
    ('Nga', 'nga'),
    ('Mexico', 'mexico'),
    ('Ba Lan', 'ba-lan'),
    ('Úc', 'uc'),
    ('Thụy Điển', 'thuy-dien'),
    ('Malaysia', 'malaysia'),
    ('Brazil', 'brazil'),
    ('Philippines', 'philippines'),
    ('Bồ Đào Nha', 'bo-dao-nha'),
    ('Ý', 'y'),
    ('Quốc Gia Khác', 'quoc-gia-khac')
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- Seed Data: Default Sources
-- =============================================
INSERT INTO sources (name, base_url, source_type, priority, crawl_config) VALUES
    ('ophim', 'https://ophim1.com', 'api', 1, '{"list_endpoint": "/danh-sach/phim-moi-cap-nhat", "detail_endpoint": "/phim/", "items_per_page": 24, "image_base": "https://img.ophim.live/uploads/movies/"}'),
    ('kkphim', 'https://phimapi.com', 'api', 2, '{"list_endpoint": "/danh-sach/phim-moi-cap-nhat", "detail_endpoint": "/phim/", "items_per_page": 10}'),
    ('nguonphim', 'https://phim.nguonc.com/api', 'api', 3, '{"list_endpoint": "/films/phim-moi-cap-nhat", "detail_endpoint": "/film/", "items_per_page": 24}')
ON CONFLICT (name) DO NOTHING;
