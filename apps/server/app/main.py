from fastapi import FastAPI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routers.devices import router as devices_router
from app.api.v1.routers.cats import router as cats_router
import os
from dotenv import load_dotenv

load_dotenv()
load_dotenv()
app = FastAPI(title=os.getenv("API_TITLE", "PixelPaws API"))

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices_router, prefix="/v1")
app.include_router(cats_router, prefix="/v1")

# Local run convenience
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
