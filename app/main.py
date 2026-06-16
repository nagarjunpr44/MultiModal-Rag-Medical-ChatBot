from fastapi import FastAPI
from app.core.config import settings
import uvicorn

from app.api.endpoints import chat, upload

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Register API Routers
app.include_router(chat.router, prefix="/api")
app.include_router(upload.router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "project": settings.PROJECT_NAME}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
