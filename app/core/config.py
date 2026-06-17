from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Multi-Modal Medical RAG API"
    API_V1_STR: str = "/api/v1"
    
    # Groq Settings
    GROQ_API_KEY: str = ""
    
    # OpenAI Settings (for Ragas Evaluation)
    OPENAI_API_KEY: str | None = None
    
    # Vector DB Settings
    CHROMA_PERSIST_DIRECTORY: str = "./chroma_db"
    
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
