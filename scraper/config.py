import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# Database
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
    'database': os.getenv('POSTGRES_DB', 'rapphim'),
    'user': os.getenv('POSTGRES_USER', 'rapphim'),
    'password': os.getenv('POSTGRES_PASSWORD', 'rapphim_secret_2024'),
}

# Scraper settings
CONCURRENT_LIMIT = int(os.getenv('SCRAPER_CONCURRENT_LIMIT', '5'))
RATE_LIMIT_MS = int(os.getenv('SCRAPER_RATE_LIMIT_MS', '500'))
REQUEST_TIMEOUT = 30
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

# Gemini API (dùng ADC hoặc API key)
GEMINI_MODEL = 'gemini-2.0-flash'
