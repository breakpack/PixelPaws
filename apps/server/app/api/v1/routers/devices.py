from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from app.core.db import SessionLocal
from app.core import models

router = APIRouter(prefix="/devices", tags=["devices"])

class DeviceState(BaseModel):
    visible: bool
    selectedCatId: Optional[str] = None

# Dependency

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/{device_id}/state", response_model=DeviceState)
def get_device_state(device_id: str, db: Session = Depends(get_db)):
    device = db.get(models.Device, device_id)
    if not device:
        return DeviceState(visible=False, selectedCatId=None)
    return DeviceState(visible=device.visible, selectedCatId=device.selected_cat_id)

@router.patch("/{device_id}/state", response_model=DeviceState)
def patch_device_state(device_id: str, body: DeviceState, db: Session = Depends(get_db)):
    device = db.get(models.Device, device_id)
    if not device:
        device = models.Device(id=device_id, visible=body.visible, selected_cat_id=body.selectedCatId)
        db.add(device)
    else:
        device.visible = body.visible
        device.selected_cat_id = body.selectedCatId
    db.commit()
    return DeviceState(visible=device.visible, selectedCatId=device.selected_cat_id)
