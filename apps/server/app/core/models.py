from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.db import Base

class Device(Base):
    __tablename__ = "devices"
    id = Column(String, primary_key=True, index=True)
    visible = Column(Boolean, default=False)
    selected_cat_id = Column(String, ForeignKey("cats.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    selected_cat = relationship("Cat", back_populates="devices")

class Cat(Base):
    __tablename__ = "cats"
    id = Column(String, primary_key=True, index=True)
    base_url = Column(String, nullable=False)
    version = Column(String, default="1")
    # files fields as simple string names for MVP
    idle = Column(String)
    walk = Column(String)
    run = Column(String)
    lifted = Column(String)
    attack = Column(String)
    sit = Column(String)
    liedown = Column(String)
    jump = Column(String)
    land = Column(String)

    devices = relationship("Device", back_populates="selected_cat")
