
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, func
from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(100), unique=True, nullable=False, index=True)

    description = Column(Text, nullable=True)

    image_url = Column(String(500), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)

    # Homepage display controls
    show_on_home = Column(Boolean, default=True, nullable=False)

    display_order = Column(Integer, default=0, nullable=False)

    # Popular Categories section
    show_in_popular = Column(Boolean, default=False, nullable=False)

    popular_display_order = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
