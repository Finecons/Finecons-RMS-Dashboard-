from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
try:
    from .database import Base
except ImportError:
    from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False) # 'MD', 'SALES_HEAD', 'ACCOUNT_MANAGER', 'BILLING'
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    password_hash = Column(String, nullable=False, default="a6831dfb602a6b72efe1a7fd5c971c0f66ecae11933e34b5e5ef186bedb9de49") # default: finecons123
    is_active = Column(Boolean, default=True)
    
    # Hierarchy: if role is ACCOUNT_MANAGER, sales_head_id maps to the Sales Head User.id
    sales_head_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    sales_head = relationship("User", remote_side=[id], backref="account_managers")
    invoices = relationship("Invoice", back_populates="account_manager", foreign_keys="Invoice.account_manager_id")

class Invoice(Base):
    __tablename__ = "invoices"

    # PRIMARY KEY IS INVOICE NUMBER ALONE AS SPECIFIED BY USER
    invoice_number = Column(String, primary_key=True, index=True, nullable=False)
    
    party_name = Column(String, index=True, nullable=False) # Client name e.g. "LEVIM LIFETECH PVT LTD"
    account_manager_name = Column(String, index=True, nullable=True) # e.g. "Saravanan" or Sales Head name
    account_manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sales_head_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_direct_to_sh = Column(Boolean, default=False) # True if handled directly by Sales Head without AM

    invoice_date = Column(String, nullable=False) # e.g. "2025-09-05" or "05-Sep-25"
    opening_amount = Column(Float, default=0.0)
    pending_amount = Column(Float, default=0.0)
    amount_type = Column(String, default="Dr") # "Dr" or "Cr"

    # Aging attributes
    days_overdue = Column(Integer, default=0)
    aging_status = Column(String, default="GREEN") # "GREEN" (<=30), "ORANGE" (31-90), "RED" (>90)
    status = Column(String, default="PENDING") # "PENDING", "SETTLED"

    # Metadata & Sync tracking
    first_uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    settled_at = Column(DateTime, nullable=True)
    last_batch_id = Column(String, nullable=True)

    # Dual Remarks Tracking
    # 1. AM Remarks: Visible to all roles (AM update on ground status)
    am_remarks = Column(Text, nullable=True)
    am_remarks_date = Column(DateTime, nullable=True)
    am_remarks_by = Column(String, nullable=True)

    # 2. MD Private Remarks: Visible strictly to MD roles only (confidential reference)
    md_remarks = Column(Text, nullable=True)
    md_remarks_date = Column(DateTime, nullable=True)
    md_remarks_by = Column(String, nullable=True)

    account_manager = relationship("User", foreign_keys=[account_manager_id], back_populates="invoices")
    sales_head = relationship("User", foreign_keys=[sales_head_id])
    history = relationship("InvoiceHistory", back_populates="invoice", cascade="all, delete-orphan")

class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id = Column(String, primary_key=True, index=True) # UUID / Batch timestamp
    filename = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    uploaded_by = Column(String, nullable=False)
    account_manager_name = Column(String, nullable=True)
    period_range = Column(String, nullable=True) # e.g. "1-Apr-26 to 16-Oct-26"
    
    total_invoices_in_file = Column(Integer, default=0)
    new_invoices_count = Column(Integer, default=0)
    updated_invoices_count = Column(Integer, default=0)
    settled_invoices_count = Column(Integer, default=0)
    total_pending_amount = Column(Float, default=0.0)

class InvoiceHistory(Base):
    __tablename__ = "invoice_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    invoice_number = Column(String, ForeignKey("invoices.invoice_number"), nullable=False)
    batch_id = Column(String, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    action = Column(String, nullable=False) # "CREATED", "UPDATED", "SETTLED"
    previous_pending = Column(Float, default=0.0)
    new_pending = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)

    invoice = relationship("Invoice", back_populates="history")
