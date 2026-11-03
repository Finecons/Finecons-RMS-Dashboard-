import hashlib
from sqlalchemy.orm import Session
try:
    from .database import SessionLocal, engine, Base
    from .models import User, Invoice, UploadBatch, InvoiceHistory
except ImportError:
    from database import SessionLocal, engine, Base
    from models import User, Invoice, UploadBatch, InvoiceHistory

def hash_password(pwd: str) -> str:
    return hashlib.sha256(pwd.encode()).hexdigest()

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    # If any users exist, do not overwrite
    if db.query(User).count() > 0:
        db.close()
        return

    print("Seeding initial Managing Director (Tyagi P)...")

    tyagi_md = User(
        username="tyagi_md",
        full_name="Tyagi P",
        role="MD",
        email="tyagi.p@finecons.com",
        designation="Managing Director",
        password_hash=hash_password("finecons@123"),
        is_active=True
    )
    db.add(tyagi_md)
    db.commit()
    db.close()
    print("Database initialized with single Managing Director: Tyagi P.")

if __name__ == "__main__":
    seed_database()
