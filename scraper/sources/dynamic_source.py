from sources.ophim_source import OPhimSource

class DynamicOPhimSource(OPhimSource):
    """
    A dynamic source that inherits the standard behavior of an OPhim-style CMS API 
    but has its name and base API URL injected at runtime from the AI-discovered database.
    """
    def __init__(self, name, base_url):
        super().__init__()
        self.name = name
        # Fix base URL to match what OPhimSource expects (standardize without trailing slashes or /api string sometimes detected)
        self.base_url = base_url.rstrip('/').replace('/api', '')
        self.source_type = 'api'
