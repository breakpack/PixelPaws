from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.db import SessionLocal, Base, engine
from app.core import models

router = APIRouter(prefix="/cats", tags=["cats"])

# Ensure tables
Base.metadata.create_all(bind=engine)

# Seed sample data if not exists (MVP)
def seed(db: Session):
    if not db.get(models.Cat, "cat01"):
        db.add(models.Cat(
            id="cat01",
            base_url="https://cdn.example.com/cats/cat01/v1",
            version="1",
            idle="cat01_idle_8fps.gif",
            walk="cat01_walk_8fps.gif",
            run="cat01_run_12fps.gif",
            lifted="cat01_fright_12fps.gif",
            attack="cat01_attack_12fps.gif",
            sit="cat01_sit_8fps.gif",
            liedown="cat01_liedown_8fps.gif",
            jump="cat01_jump_12fps.gif",
            land="cat01_land_12fps.gif",
        ))
        db.commit()

# Dependency

def get_db():
    db = SessionLocal()
    try:
        seed(db)
        yield db
    finally:
        db.close()

@router.get("")
def list_cats(db: Session = Depends(get_db)):
    cats = db.query(models.Cat).all()
    return [{"id": c.id, "version": c.version} for c in cats]

@router.get("/{cat_id}/manifest")
def get_manifest(cat_id: str, db: Session = Depends(get_db)):
    c = db.get(models.Cat, cat_id)
    if not c:
        raise HTTPException(status_code=404, detail="cat not found")
    return {
        "baseUrl": c.base_url,
        "version": c.version,
        "files": {
            "idle": c.idle,
            "walk": c.walk,
            "run": c.run,
            "lifted": c.lifted,
            "attack": c.attack,
            "sit": c.sit,
            "liedown": c.liedown,
            "jump": c.jump,
            "land": c.land,
        }
    }
