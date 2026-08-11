from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from pgvector.sqlalchemy import Vector
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class PastIncident(Base):
    __tablename__ = "past_incidents"

    id = Column(Integer, primary_key=True)
    log_message = Column(Text, nullable=False)       # original raw log
    severity = Column(String, nullable=False)
    category = Column(String, nullable=False)
    resolution = Column(Text, nullable=False)         # how it was fixed — this is what we'll show as the "suggested fix"
    embedding = Column(Vector(384))                   # 384 dims — matches the embedding model we'll use


if __name__ == "__main__":
    Base.metadata.create_all(engine)
    print("Table created successfully.")