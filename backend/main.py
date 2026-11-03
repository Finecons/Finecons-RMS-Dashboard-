import os
import uuid
import re
import difflib
from datetime import datetime, date, timezone
from typing import Optional, List
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from io import BytesIO
import openpyxl

try:
    from .database import get_db, engine, Base
    from .models import User, Invoice, UploadBatch, InvoiceHistory
    from .schemas import (
        UserOut, InvoiceOut, MDDashboardResponse, SalesHeadDashboardResponse,
        AMDashboardResponse, UploadSummaryResponse, SalesHeadSummary,
        AccountManagerSummary, ClientSummary, UpdateRemarksRequest, UserUpdateRequest
    )
    from .parser import parse_tally_workbook, calculate_aging, parse_tally_date
    from .seed_data import seed_database
except ImportError:
    from database import get_db, engine, Base
    from models import User, Invoice, UploadBatch, InvoiceHistory
    from schemas import (
        UserOut, InvoiceOut, MDDashboardResponse, SalesHeadDashboardResponse,
        AMDashboardResponse, UploadSummaryResponse, SalesHeadSummary,
        AccountManagerSummary, ClientSummary, UpdateRemarksRequest, UserUpdateRequest
    )
    from parser import parse_tally_workbook, calculate_aging, parse_tally_date
    from seed_data import seed_database

# Create tables
Base.metadata.create_all(bind=engine)

def ensure_database_columns():
    """Ensure newly added columns exist in existing SQLite database."""
    try:
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info(invoices)"))
            existing_cols = [row[1] for row in res.fetchall()]
            new_cols = [
                ("am_remarks", "TEXT"),
                ("am_remarks_date", "DATETIME"),
                ("am_remarks_by", "VARCHAR"),
                ("md_remarks", "TEXT"),
                ("md_remarks_date", "DATETIME"),
                ("md_remarks_by", "VARCHAR")
            ]
            for col_name, col_type in new_cols:
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE invoices ADD COLUMN {col_name} {col_type}"))

            # Automatic invoice reassignment fix for Rekhal (guarantees strict separation)
            rekhal_user = conn.execute(text("SELECT id, full_name FROM users WHERE full_name LIKE '%Rekhal%' OR username = 'rekhal'")).fetchone()
            if rekhal_user:
                r_id, r_name = rekhal_user[0], rekhal_user[1]
                target_invoices = ['FINE/2832/24-25', 'FINE/1429/25-26', 'FINE/2632/24-25']
                for inv_no in target_invoices:
                    conn.execute(
                        text("UPDATE invoices SET account_manager_id = :aid, account_manager_name = :aname WHERE invoice_number = :inv_no"),
                        {"aid": r_id, "aname": r_name, "inv_no": inv_no}
                    )

            conn.commit()
    except Exception as e:
        print("Column migration check:", e)

ensure_database_columns()

def refresh_invoice_aging_live(inv: Invoice, today: Optional[date] = None) -> Invoice:
    """
    Computes days overdue and aging bucket dynamically against the real-time live date.
    e.g. Invoice on 22-Oct-2026 viewed on 30-Oct-2026 computes to exactly 8 days overdue.
    """
    if not today:
        today = date.today()
    if inv.invoice_date:
        dt, _ = parse_tally_date(inv.invoice_date)
        if dt:
            diff = (today - dt).days
            inv.days_overdue = max(0, diff)
            if inv.days_overdue <= 30:
                inv.aging_status = "GREEN"
            elif inv.days_overdue <= 90:
                inv.aging_status = "ORANGE"
            else:
                inv.aging_status = "RED"
    
    # Unified remarks aliases
    inv.remarks = inv.am_remarks
    inv.remarks_date = inv.am_remarks_date
    inv.remarks_by = inv.am_remarks_by
    return inv

# Auto-seed if database is empty
try:
    seed_database()
except Exception as e:
    print("Seed check:", e)

app = FastAPI(
    title="RMS - Receivables Management System",
    description="Finecons Private Limited - Receivables Management System",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "Finecons RMS", "time": datetime.now(timezone.utc).isoformat()}

import hashlib

def hash_password(pwd: str) -> str:
    return hashlib.sha256(pwd.encode()).hexdigest()

# ==========================================
# AUTHENTICATION & MASTER ADMIN USER MANAGEMENT
# ==========================================

try:
    from .schemas import LoginRequest, LoginResponse, CreateUserRequest, ResetPasswordRequest
except ImportError:
    from schemas import LoginRequest, LoginResponse, CreateUserRequest, ResetPasswordRequest

@app.post("/api/auth/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    input_uname = req.username.strip().lower()
    user = db.query(User).filter(User.username == input_uname).first()
    if not user:
        # Also try matching by exact username
        user = db.query(User).filter(User.username == req.username.strip()).first()
    if not user and "tyagi" in input_uname:
        # Support any variation of Tyagi (tyagi, tyagi_md, tyagi.p, Tyagi P)
        user = db.query(User).filter(User.role == "MD").first()
    
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    pwd_hash = hash_password(req.password)
    # Check password hash or match finecons@123
    if user.password_hash != pwd_hash and req.password != "finecons@123":
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    user_out = UserOut.from_orm(user)
    if user.sales_head_id:
        sh = db.query(User).filter(User.id == user.sales_head_id).first()
        if sh:
            user_out.sales_head_name = sh.full_name

    token = f"TOKEN-{user.id}-{uuid.uuid4().hex[:12]}"
    return LoginResponse(
        user=user_out,
        token=token,
        message=f"Welcome back, {user.full_name}!"
    )

@app.post("/api/admin/users", response_model=UserOut)
def create_user(req: CreateUserRequest, db: Session = Depends(get_db)):
    uname = req.username.strip().lower()
    existing = db.query(User).filter(User.username == uname).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists. Please choose a different username.")

    new_user = User(
        username=uname,
        full_name=req.full_name.strip(),
        role=req.role,
        password_hash=hash_password(req.password),
        sales_head_id=req.sales_head_id if req.role == "ACCOUNT_MANAGER" and req.sales_head_id else None,
        email=req.email,
        phone=req.phone,
        designation=req.designation,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    user_out = UserOut.from_orm(new_user)
    if new_user.sales_head_id:
        sh = db.query(User).filter(User.id == new_user.sales_head_id).first()
        if sh:
            user_out.sales_head_name = sh.full_name
    return user_out

@app.post("/api/admin/users/{user_id}/reset-password")
def reset_password(user_id: int, req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": f"Password for {user.full_name} reset successfully.", "user_id": user.id}

@app.put("/api/admin/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, req: UserUpdateRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.username and req.username.strip() != user.username:
        existing = db.query(User).filter(User.username == req.username.strip(), User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = req.username.strip()

    if req.full_name is not None and req.full_name.strip():
        user.full_name = req.full_name.strip()

    if req.role is not None:
        user.role = req.role

    if req.sales_head_id is not None:
        user.sales_head_id = req.sales_head_id if user.role == "ACCOUNT_MANAGER" else None
    elif user.role != "ACCOUNT_MANAGER":
        user.sales_head_id = None

    if req.email is not None:
        user.email = req.email.strip() if req.email else None

    if req.phone is not None:
        user.phone = req.phone.strip() if req.phone else None

    if req.designation is not None:
        user.designation = req.designation.strip() if req.designation else None

    if req.is_active is not None:
        user.is_active = req.is_active

    if req.new_password and req.new_password.strip():
        user.password_hash = hash_password(req.new_password.strip())

    db.commit()
    db.refresh(user)

    user_out = UserOut.from_orm(user)
    if user.sales_head_id:
        sh = db.query(User).filter(User.id == user.sales_head_id).first()
        if sh:
            user_out.sales_head_name = sh.full_name
    return user_out

@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "MD":
        raise HTTPException(status_code=400, detail="Cannot delete Managing Director.")

    db.delete(user)
    db.commit()
    return {"message": f"User {user.full_name} removed successfully."}

# ==========================================
# USERS & RBAC ENDPOINTS
# ==========================================

@app.get("/api/users", response_model=List[UserOut])
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    sh_map = {u.id: u.full_name for u in users if u.role == "SALES_HEAD"}
    res = []
    for u in users:
        uo = UserOut.from_orm(u)
        if u.sales_head_id and u.sales_head_id in sh_map:
            uo.sales_head_name = sh_map[u.sales_head_id]
        res.append(uo)
    return res

@app.get("/api/sales-heads", response_model=List[UserOut])
def get_sales_heads(db: Session = Depends(get_db)):
    return db.query(User).filter(User.role == "SALES_HEAD").all()

@app.get("/api/account-managers", response_model=List[UserOut])
def get_account_managers(sales_head_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(User).filter(User.role == "ACCOUNT_MANAGER")
    if sales_head_id:
        query = query.filter(User.sales_head_id == sales_head_id)
    return query.all()

# ==========================================
# MD / DIRECTORS DASHBOARD (COMPANY-WIDE)
# ==========================================

@app.get("/api/dashboard/md", response_model=MDDashboardResponse)
def get_md_dashboard(db: Session = Depends(get_db)):
    # Total pending invoices
    pending_query = db.query(Invoice).filter(Invoice.status == "PENDING")
    settled_query = db.query(Invoice).filter(Invoice.status == "SETTLED")

    all_pending = pending_query.all()
    today = date.today()
    for i in all_pending:
        refresh_invoice_aging_live(i, today)

    total_company_pending = sum(i.pending_amount if i.amount_type != "Cr" else -i.pending_amount for i in all_pending)
    total_invoices_count = len(all_pending)
    unique_clients = set(i.party_name for i in all_pending)
    total_clients_count = len(unique_clients)

    green_invoices = [i for i in all_pending if i.aging_status == "GREEN" and i.amount_type != "Cr"]
    orange_invoices = [i for i in all_pending if i.aging_status == "ORANGE" and i.amount_type != "Cr"]
    red_invoices = [i for i in all_pending if i.aging_status == "RED" and i.amount_type != "Cr"]
    credit_invoices = [i for i in all_pending if i.amount_type == "Cr"]

    green_amount = sum(i.pending_amount for i in green_invoices)
    orange_amount = sum(i.pending_amount for i in orange_invoices)
    red_amount = sum(i.pending_amount for i in red_invoices)
    credit_amount = sum(i.pending_amount for i in credit_invoices)

    all_settled = settled_query.all()
    settled_amount = sum(i.opening_amount for i in all_settled)
    settled_count = len(all_settled)

    # Segregate by Sales Heads
    sales_heads = db.query(User).filter(User.role == "SALES_HEAD").all()
    sh_summaries = []

    for sh in sales_heads:
        sh_invoices = [i for i in all_pending if i.sales_head_id == sh.id]
        sh_ams = db.query(User).filter(User.role == "ACCOUNT_MANAGER", User.sales_head_id == sh.id).all()
        sh_clients = set(i.party_name for i in sh_invoices)

        sh_green = sum(i.pending_amount for i in sh_invoices if i.aging_status == "GREEN" and i.amount_type != "Cr")
        sh_orange = sum(i.pending_amount for i in sh_invoices if i.aging_status == "ORANGE" and i.amount_type != "Cr")
        sh_red = sum(i.pending_amount for i in sh_invoices if i.aging_status == "RED" and i.amount_type != "Cr")
        sh_credit = sum(i.pending_amount for i in sh_invoices if i.amount_type == "Cr")
        sh_credit_count = len([i for i in sh_invoices if i.amount_type == "Cr"])

        # Direct clients handled by Sales Head without AM
        direct_sh_invs = [i for i in sh_invoices if i.is_direct_to_sh or i.account_manager_id == sh.id or not i.account_manager_id or (i.account_manager_name and sh.full_name.lower() in i.account_manager_name.lower())]
        direct_clients = set(i.party_name for i in direct_sh_invs)
        direct_pending = sum(i.pending_amount if i.amount_type != "Cr" else -i.pending_amount for i in direct_sh_invs)

        sh_summaries.append(SalesHeadSummary(
            id=sh.id,
            name=sh.full_name,
            designation=sh.designation or "Sales Head",
            total_pending=sum(i.pending_amount if i.amount_type != "Cr" else -i.pending_amount for i in sh_invoices),
            green_pending=sh_green,
            orange_pending=sh_orange,
            red_pending=sh_red,
            credit_pending=sh_credit,
            credit_count=sh_credit_count,
            am_count=len(sh_ams),
            invoice_count=len(sh_invoices),
            client_count=len(sh_clients),
            direct_clients_count=len(direct_clients),
            direct_pending_amount=direct_pending
        ))

    return MDDashboardResponse(
        total_company_pending=total_company_pending,
        total_invoices_count=total_invoices_count,
        total_clients_count=total_clients_count,
        green_amount=green_amount,
        green_count=len(green_invoices),
        orange_amount=orange_amount,
        orange_count=len(orange_invoices),
        red_amount=red_amount,
        red_count=len(red_invoices),
        credit_amount=credit_amount,
        credit_count=len(credit_invoices),
        settled_amount=settled_amount,
        settled_count=settled_count,
        sales_heads=sh_summaries
    )

# ==========================================
# SALES HEAD DASHBOARD (SCOPED TO THEIR TEAM + DIRECT CLIENTS)
# ==========================================

@app.get("/api/dashboard/sales-head/{sales_head_id}", response_model=SalesHeadDashboardResponse)
def get_sales_head_dashboard(sales_head_id: int, db: Session = Depends(get_db)):
    sales_head = db.query(User).filter(User.id == sales_head_id, User.role == "SALES_HEAD").first()
    if not sales_head:
        raise HTTPException(status_code=404, detail="Sales Head not found")

    # Invoices under this Sales Head
    team_invoices = db.query(Invoice).filter(
        Invoice.sales_head_id == sales_head_id,
        Invoice.status == "PENDING"
    ).all()

    today = date.today()
    for i in team_invoices:
        refresh_invoice_aging_live(i, today)

    total_team_pending = sum(i.pending_amount if i.amount_type != "Cr" else -i.pending_amount for i in team_invoices)
    green_amount = sum(i.pending_amount for i in team_invoices if i.aging_status == "GREEN" and i.amount_type != "Cr")
    orange_amount = sum(i.pending_amount for i in team_invoices if i.aging_status == "ORANGE" and i.amount_type != "Cr")
    red_amount = sum(i.pending_amount for i in team_invoices if i.aging_status == "RED" and i.amount_type != "Cr")
    credit_amount = sum(i.pending_amount for i in team_invoices if i.amount_type == "Cr")
    credit_count = len([i for i in team_invoices if i.amount_type == "Cr"])

    # 1. Direct Invoices handled by Sales Head without AM
    direct_invoices = [
        i for i in team_invoices 
        if i.is_direct_to_sh or 
           i.account_manager_id == sales_head_id or 
           not i.account_manager_id or 
           (i.account_manager_name and sales_head.full_name.lower() in i.account_manager_name.lower())
    ]
    direct_inv_numbers = set(i.invoice_number for i in direct_invoices)

    direct_pending_amount = sum(i.pending_amount if i.amount_type != "Cr" else -i.pending_amount for i in direct_invoices)
    direct_green_amount = sum(i.pending_amount for i in direct_invoices if i.aging_status == "GREEN" and i.amount_type != "Cr")
    direct_orange_amount = sum(i.pending_amount for i in direct_invoices if i.aging_status == "ORANGE" and i.amount_type != "Cr")
    direct_red_amount = sum(i.pending_amount for i in direct_invoices if i.aging_status == "RED" and i.amount_type != "Cr")
    direct_credit_amount = sum(i.pending_amount for i in direct_invoices if i.amount_type == "Cr")
    direct_credit_count = len([i for i in direct_invoices if i.amount_type == "Cr"])

    direct_clients_map = {}
    for inv in direct_invoices:
        pname = inv.party_name
        if pname not in direct_clients_map:
            direct_clients_map[pname] = {
                "party_name": pname,
                "total_pending": 0.0,
                "invoice_count": 0,
                "oldest_invoice_date": inv.invoice_date,
                "highest_aging_status": inv.aging_status
            }
        direct_clients_map[pname]["total_pending"] += (inv.pending_amount if inv.amount_type != "Cr" else -inv.pending_amount)
        direct_clients_map[pname]["invoice_count"] += 1
        if inv.amount_type != "Cr":
            cur_status = direct_clients_map[pname]["highest_aging_status"]
            if inv.aging_status == "RED" or (inv.aging_status == "ORANGE" and cur_status == "GREEN"):
                direct_clients_map[pname]["highest_aging_status"] = inv.aging_status

    direct_clients_list = [ClientSummary(**val) for val in direct_clients_map.values()]
    direct_clients_list.sort(key=lambda x: x.total_pending, reverse=True)

    # 2. Account Managers under this Sales Head
    ams = db.query(User).filter(User.role == "ACCOUNT_MANAGER", User.sales_head_id == sales_head_id).all()
    am_summaries = []

    for am in ams:
        # Match by am.id or strict am.full_name (excluding direct invoices and guarding Rekha vs Rekhal)
        am_name_clean = am.full_name.strip().lower()
        def matches_am(inv):
            if inv.invoice_number in direct_inv_numbers:
                return False
            if inv.account_manager_id == am.id:
                return True
            if not inv.account_manager_name:
                return False
            inv_am_clean = inv.account_manager_name.strip().lower()
            # Guard: Rekha vs Rekhal strict separation
            if (am_name_clean == "rekha" or am_name_clean.startswith("rekha ")) and ("rekhal" in inv_am_clean or "rehal" in inv_am_clean):
                return False
            if ("rekhal" in am_name_clean or "rehal" in am_name_clean) and inv_am_clean == "rekha":
                return False
            tokens = [re.sub(r"[^a-zA-Z0-9]", "", t) for t in am_name_clean.split() if len(t) >= 3]
            return any(re.search(r'\b' + re.escape(t) + r'\b', inv_am_clean) for t in tokens)

        am_invs = [i for i in team_invoices if matches_am(i)]
        am_clients = set(i.party_name for i in am_invs)
        
        am_green = sum(i.pending_amount for i in am_invs if i.aging_status == "GREEN" and i.amount_type != "Cr")
        am_orange = sum(i.pending_amount for i in am_invs if i.aging_status == "ORANGE" and i.amount_type != "Cr")
        am_red = sum(i.pending_amount for i in am_invs if i.aging_status == "RED" and i.amount_type != "Cr")
        am_credit = sum(i.pending_amount for i in am_invs if i.amount_type == "Cr")
        am_credit_count = len([i for i in am_invs if i.amount_type == "Cr"])

        am_summaries.append(AccountManagerSummary(
            id=am.id,
            name=am.full_name,
            total_pending=sum(i.pending_amount if i.amount_type != "Cr" else -i.pending_amount for i in am_invs),
            green_pending=am_green,
            orange_pending=am_orange,
            red_pending=am_red,
            credit_pending=am_credit,
            credit_count=am_credit_count,
            invoice_count=len(am_invs),
            client_count=len(am_clients)
        ))

    # Sort AMs by total pending descending
    am_summaries.sort(key=lambda x: x.total_pending, reverse=True)

    return SalesHeadDashboardResponse(
        sales_head_id=sales_head.id,
        sales_head_name=sales_head.full_name,
        total_team_pending=total_team_pending,
        green_amount=green_amount,
        orange_amount=orange_amount,
        red_amount=red_amount,
        credit_amount=credit_amount,
        credit_count=credit_count,
        account_managers=am_summaries,
        direct_pending_amount=direct_pending_amount,
        direct_green_amount=direct_green_amount,
        direct_orange_amount=direct_orange_amount,
        direct_red_amount=direct_red_amount,
        direct_credit_amount=direct_credit_amount,
        direct_credit_count=direct_credit_count,
        direct_clients=direct_clients_list,
        direct_invoices=direct_invoices
    )

# ==========================================
# ACCOUNT MANAGER DASHBOARD (SCOPED TO THEIR CLIENTS)
# ==========================================

@app.get("/api/dashboard/am/{am_identifier}", response_model=AMDashboardResponse)
def get_am_dashboard(am_identifier: str, db: Session = Depends(get_db)):
    # am_identifier can be user.id (int) or user.username or name
    am_user = None
    if am_identifier.isdigit():
        am_user = db.query(User).filter(User.id == int(am_identifier)).first()
    else:
        am_user = db.query(User).filter(
            (User.username == am_identifier) | 
            (User.full_name.ilike(f"%{am_identifier}%"))
        ).first()

    am_name = am_user.full_name if am_user else am_identifier
    am_id = am_user.id if am_user else None

    # Fetch pending invoices (with strict AM matching and Rekha vs Rekhal isolation)
    query = db.query(Invoice).filter(Invoice.status == "PENDING")
    am_clean = am_name.strip().lower()
    first_token = am_name.split()[0].strip()

    if am_id:
        query = query.filter(
            (Invoice.account_manager_id == am_id) | 
            (Invoice.account_manager_name == am_name) |
            (Invoice.account_manager_name.ilike(f"{first_token}")) |
            (Invoice.account_manager_name.ilike(f"{first_token} %"))
        )
    else:
        query = query.filter(
            (Invoice.account_manager_name == am_identifier) |
            (Invoice.account_manager_name.ilike(f"{first_token}")) |
            (Invoice.account_manager_name.ilike(f"{first_token} %"))
        )

    # Strict isolation: if this AM is Rekha, never grab Rekhal / Rehal invoices
    if am_clean == "rekha" or am_clean.startswith("rekha "):
        query = query.filter(
            ~Invoice.account_manager_name.ilike("rekhal%"),
            ~Invoice.account_manager_name.ilike("rehal%")
        )
    # If this AM is Rekhal, never grab exact Rekha
    if "rekhal" in am_clean or "rehal" in am_clean:
        query = query.filter(
            Invoice.account_manager_name != "Rekha"
        )

    invoices = query.all()
    today = date.today()
    for i in invoices:
        refresh_invoice_aging_live(i, today)
    invoices.sort(key=lambda x: x.days_overdue, reverse=True)

    total_pending = sum(i.pending_amount if i.amount_type != "Cr" else -i.pending_amount for i in invoices)
    green_invoices = [i for i in invoices if i.aging_status == "GREEN" and i.amount_type != "Cr"]
    orange_invoices = [i for i in invoices if i.aging_status == "ORANGE" and i.amount_type != "Cr"]
    red_invoices = [i for i in invoices if i.aging_status == "RED" and i.amount_type != "Cr"]
    credit_invoices = [i for i in invoices if i.amount_type == "Cr"]

    green_amount = sum(i.pending_amount for i in green_invoices)
    orange_amount = sum(i.pending_amount for i in orange_invoices)
    red_amount = sum(i.pending_amount for i in red_invoices)
    credit_amount = sum(i.pending_amount for i in credit_invoices)

    # Group by clients
    clients_map = {}
    for inv in invoices:
        pname = inv.party_name
        if pname not in clients_map:
            clients_map[pname] = {
                "party_name": pname,
                "total_pending": 0.0,
                "invoice_count": 0,
                "oldest_invoice_date": inv.invoice_date,
                "highest_aging_status": inv.aging_status
            }
        clients_map[pname]["total_pending"] += (inv.pending_amount if inv.amount_type != "Cr" else -inv.pending_amount)
        clients_map[pname]["invoice_count"] += 1
        # Track worst aging status
        if inv.amount_type != "Cr":
            cur_status = clients_map[pname]["highest_aging_status"]
            if inv.aging_status == "RED" or (inv.aging_status == "ORANGE" and cur_status == "GREEN"):
                clients_map[pname]["highest_aging_status"] = inv.aging_status

    client_summaries = [ClientSummary(**val) for val in clients_map.values()]
    client_summaries.sort(key=lambda x: x.total_pending, reverse=True)

    # AMDashboard is for Account Managers - strictly mask MD private notes!
    for inv in invoices:
        inv.md_remarks = None
        inv.md_remarks_date = None
        inv.md_remarks_by = None

    return AMDashboardResponse(
        am_id=am_id,
        am_name=am_name,
        total_pending=total_pending,
        green_amount=green_amount,
        green_count=len(green_invoices),
        orange_amount=orange_amount,
        orange_count=len(orange_invoices),
        red_amount=red_amount,
        red_count=len(red_invoices),
        credit_amount=credit_amount,
        credit_count=len(credit_invoices),
        clients=client_summaries,
        invoices=invoices
    )

# ==========================================
# INVOICE QUERY, DETAILS & REMARKS MANAGEMENT
# ==========================================

@app.get("/api/invoices", response_model=List[InvoiceOut])
def get_invoices(
    sales_head_id: Optional[int] = None,
    am_id: Optional[int] = None,
    am_name: Optional[str] = None,
    party_name: Optional[str] = None,
    aging_status: Optional[str] = None,
    status: Optional[str] = Query("PENDING"),
    search: Optional[str] = None,
    user_role: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Invoice)

    if status and status != "ALL":
        query = query.filter(Invoice.status == status)

    if sales_head_id:
        query = query.filter(Invoice.sales_head_id == sales_head_id)

    if am_id:
        query = query.filter(Invoice.account_manager_id == am_id)

    if am_name:
        query = query.filter(Invoice.account_manager_name.ilike(f"%{am_name}%"))

    if party_name:
        query = query.filter(Invoice.party_name.ilike(f"%{party_name}%"))

    if aging_status and aging_status != "ALL":
        if aging_status == "CREDIT":
            query = query.filter(Invoice.amount_type == "Cr")
        else:
            query = query.filter(Invoice.aging_status == aging_status, Invoice.amount_type != "Cr")

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            (Invoice.invoice_number.ilike(search_pattern)) |
            (Invoice.party_name.ilike(search_pattern)) |
            (Invoice.account_manager_name.ilike(search_pattern))
        )

    invoices = query.all()
    today = date.today()
    for i in invoices:
        refresh_invoice_aging_live(i, today)
    invoices.sort(key=lambda x: x.days_overdue, reverse=True)

    # Security: If requester is NOT an MD, strictly mask confidential MD remarks!
    if user_role != "MD":
        for inv in invoices:
            inv.md_remarks = None
            inv.md_remarks_date = None
            inv.md_remarks_by = None

    return invoices

@app.get("/api/invoices/{invoice_number:path}")
def get_invoice_detail(
    invoice_number: str, 
    user_role: Optional[str] = None, 
    db: Session = Depends(get_db)
):
    inv = db.query(Invoice).filter(Invoice.invoice_number == invoice_number).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    refresh_invoice_aging_live(inv, date.today())
    history_query = db.query(InvoiceHistory).filter(InvoiceHistory.invoice_number == invoice_number)
    
    # If not MD, mask MD private notes from invoice and audit trail
    if user_role != "MD":
        history_query = history_query.filter(InvoiceHistory.action != "MD_NOTE")
        inv.md_remarks = None
        inv.md_remarks_date = None
        inv.md_remarks_by = None

    history = history_query.order_by(InvoiceHistory.timestamp.desc()).all()
    return {
        "invoice": inv,
        "history": history
    }

@app.put("/api/invoices/{invoice_number:path}/remarks")
def update_invoice_remarks(
    invoice_number: str,
    payload: UpdateRemarksRequest,
    db: Session = Depends(get_db)
):
    """
    Updates remarks for an invoice:
    - Unified remark editable by both AM and MD
    - Logs author, role, and timestamp in invoice history
    """
    inv = db.query(Invoice).filter(Invoice.invoice_number == invoice_number).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    now_utc = datetime.now(timezone.utc)

    # 1. Update Remarks if provided (Unified remarks, editable by AM and MD)
    remark_text = payload.remarks if payload.remarks is not None else payload.am_remarks
    if remark_text is not None:
        inv.am_remarks = remark_text.strip()
        inv.am_remarks_date = now_utc
        inv.am_remarks_by = payload.updated_by

        history_entry = InvoiceHistory(
            invoice_number=inv.invoice_number,
            action="REMARK_UPDATE",
            notes=f"Remark by {payload.updated_by} ({payload.user_role}): {inv.am_remarks}"
        )
        db.add(history_entry)

    # 2. Update MD Private Remarks if provided (Restricted strictly to MD role)
    if payload.md_remarks is not None and payload.user_role == "MD":
        inv.md_remarks = payload.md_remarks.strip()
        inv.md_remarks_date = now_utc
        inv.md_remarks_by = payload.updated_by

        history_entry = InvoiceHistory(
            invoice_number=inv.invoice_number,
            action="MD_NOTE",
            notes=f"MD Private Note by {payload.updated_by}: {inv.md_remarks}"
        )
        db.add(history_entry)

    db.commit()
    db.refresh(inv)
    refresh_invoice_aging_live(inv, date.today())

    return {
        "status": "success",
        "message": "Remarks updated successfully",
        "invoice_number": inv.invoice_number,
        "remarks": inv.am_remarks,
        "remarks_date": inv.am_remarks_date,
        "remarks_by": inv.am_remarks_by,
        "am_remarks": inv.am_remarks,
        "am_remarks_date": inv.am_remarks_date,
        "am_remarks_by": inv.am_remarks_by,
        "md_remarks": inv.md_remarks if payload.user_role == "MD" else None,
        "md_remarks_date": inv.md_remarks_date if payload.user_role == "MD" else None,
        "md_remarks_by": inv.md_remarks_by if payload.user_role == "MD" else None
    }

# ==========================================
# WEEKLY TALLY EXCEL UPLOAD & RECONCILIATION
# ==========================================

def find_matching_account_manager(db: Session, raw_name: str) -> Optional[User]:
    """
    Regex Word-Boundary & Length-Prioritized Account Manager Matcher (Method 2).
    Ensures strict distinction:
    - \\bRekha\\b strictly matches Rekha only
    - \\bRekhal\\b strictly matches Rekhal only
    """
    if not raw_name:
        return None
    clean_target = raw_name.strip()
    if not clean_target:
        return None

    all_users = db.query(User).filter(User.role.in_(["ACCOUNT_MANAGER", "SALES_HEAD"])).all()
    if not all_users:
        return None

    target_lower = clean_target.lower()

    # SPECIAL GUARD: Rekha L / Rekhal vs Rekha
    # If target has 'rekhal' or 'rekha l' (with space/dot/dash), it is strictly Rekhal (ID 32)
    if re.search(r'\b(rekhal|rehal|rekha[\s._-]*l)\b', target_lower):
        rekhal_user = db.query(User).filter(
            (User.full_name.ilike('%rekhal%')) | 
            (User.username == 'rekhal_am') | 
            (User.id == 32)
        ).first()
        if rekhal_user:
            return rekhal_user

    # If target has 'rekha' without any 'l', it is strictly Rekha (ID 27)
    if re.search(r'\brekha\b', target_lower) and not re.search(r'\b(rekhal|rehal|rekha[\s._-]*l)\b', target_lower):
        rekha_user = db.query(User).filter(
            (User.full_name == 'Rekha') | 
            (User.username == 'rekha_am') | 
            (User.id == 27)
        ).first()
        if rekha_user:
            return rekha_user

    # 1. Exact match (full_name or username)
    for u in all_users:
        if u.full_name.strip().lower() == target_lower or u.username.lower() == target_lower:
            return u

    # 2. Strict Regex Word Boundary Match (\bname\b) with Length-Descending Priority
    # Longer names (e.g. Rekhal = 6 chars) are evaluated BEFORE shorter names (Rekha = 5 chars)
    users_sorted = sorted(all_users, key=lambda u: len(u.full_name.strip()), reverse=True)

    raw_tokens = [re.sub(r"[^a-zA-Z0-9]", "", t) for t in target_lower.split()]
    target_tokens = [t for t in raw_tokens if t and t not in [
        "pdy", "pondy", "cbe", "hq", "br", "group", "am", "branch", "tamilnadu", "tn", "as", "on"
    ]]

    # Word-boundary check on user name / tokens
    for u in users_sorted:
        u_clean = u.full_name.strip().lower()
        # Full name word-boundary regex
        if re.search(r'\b' + re.escape(u_clean) + r'\b', target_lower):
            return u
        # Token-level word-boundary regex (min 3 chars)
        u_tokens = [re.sub(r"[^a-zA-Z0-9]", "", t) for t in u_clean.split() if len(t) >= 3]
        for ut in u_tokens:
            if re.search(r'\b' + re.escape(ut) + r'\b', target_lower):
                return u

    # 3. Fuzzy sequence matcher (for genuine typos like Jennifer vs Jenifer)
    # Strict regex guard: Rekha vs Rekhal can NEVER cross-match via fuzzy logic!
    def is_conflict(t_tokens, u_clean):
        if ("kumaran" in t_tokens and "karan" in u_clean) or ("karan" in t_tokens and "kumaran" in u_clean):
            return True
        if ("rekhal" in t_tokens or "rehal" in t_tokens) and u_clean == "rekha":
            return True
        if "rekha" in t_tokens and ("rekhal" in u_clean or "rehal" in u_clean):
            return True
        return False

    best_match = None
    best_score = 0.0
    for u in users_sorted:
        u_clean = u.full_name.strip().lower()
        if is_conflict(target_tokens, u_clean):
            continue
        ratio1 = difflib.SequenceMatcher(None, target_lower, u_clean).ratio()
        max_token_ratio = max(
            [difflib.SequenceMatcher(None, t, u_clean).ratio() for t in target_tokens],
            default=0.0
        )
        score = max(ratio1, max_token_ratio)
        if score > best_score and score >= 0.80:
            best_score = score
            best_match = u

    return best_match

@app.post("/api/upload", response_model=UploadSummaryResponse)
async def upload_tally_excel(
    file: UploadFile = File(...),
    uploaded_by: str = Form("anand_billing"),
    override_am: Optional[str] = Form(None),
    sales_head_id: Optional[int] = Form(None),
    as_of_date_str: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    try:
        filename_lower = (file.filename or "").lower()
        if not (filename_lower.endswith(".xlsx") or filename_lower.endswith(".xls")):
            raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported.")

        file_bytes = await file.read()

        as_of = None
        if as_of_date_str:
            as_of, _ = parse_tally_date(as_of_date_str)

        # 1. Parse Excel content using specialized Tally parser
        # Regardless of filename, analyzes inner structure
        parsed_data = parse_tally_workbook(file_bytes, override_am=override_am, as_of_date=as_of)
        detected_am_name = parsed_data.get("account_manager_name") or override_am or "Unassigned"
        invoices_in_file = parsed_data.get("invoices", [])

        if not invoices_in_file:
            raise HTTPException(
                status_code=400, 
                detail="No valid invoice rows found in the uploaded Excel file. Please ensure it follows the Tally pending bills export format."
            )

        # 2. Smart Match Account Manager & Sales Head
        # Priority 1: User explicitly selected override_am in the upload modal
        # Priority 2: Filename first (because billing team names the file specifically for the AM, e.g. "REKHAL BR..." vs "REKHA BR...")
        # Priority 3: Inner sheet detected_am_name (fallback if filename is generic e.g. "Pending.xlsx")
        am_user = None
        if override_am:
            am_user = find_matching_account_manager(db, override_am)
        if not am_user and file.filename:
            am_user = find_matching_account_manager(db, file.filename)
        if not am_user and detected_am_name and detected_am_name != "Unassigned":
            am_user = find_matching_account_manager(db, detected_am_name)

        canonical_am_name = am_user.full_name if am_user else detected_am_name
        canonical_am_id = am_user.id if am_user else None

        assigned_sh_id = sales_head_id
        is_direct = False
        if am_user and am_user.role == "SALES_HEAD":
            assigned_sh_id = am_user.id
            is_direct = True
            canonical_am_name = f"{am_user.full_name} (Direct)"
            canonical_am_id = am_user.id
        elif am_user and am_user.sales_head_id:
            assigned_sh_id = am_user.sales_head_id
        elif not assigned_sh_id:
            # Fallback to first available Sales Head
            sh = db.query(User).filter(User.role == "SALES_HEAD").first()
            if sh:
                assigned_sh_id = sh.id

        batch_id = f"BATCH-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"

        # 3. Weekly Reconciliation Engine
        # PRIMARY KEY IS INVOICE NUMBER ALONE
        file_invoice_numbers = set()
        new_count = 0
        updated_count = 0
        now_utc = datetime.now(timezone.utc)

        for item in invoices_in_file:
            inv_num = item["invoice_number"].strip()
            file_invoice_numbers.add(inv_num)

            existing_inv = db.query(Invoice).filter(Invoice.invoice_number == inv_num).first()
            if existing_inv:
                # Update existing invoice with latest pending amount and recalculated aging
                prev_amt = existing_inv.pending_amount
                existing_inv.party_name = item["party_name"]
                existing_inv.pending_amount = item["pending_amount"]
                existing_inv.amount_type = item["amount_type"]
                existing_inv.days_overdue = item["days_overdue"]
                existing_inv.aging_status = item["aging_status"]
                existing_inv.status = "PENDING"
                existing_inv.last_uploaded_at = now_utc
                existing_inv.last_batch_id = batch_id
                existing_inv.account_manager_name = canonical_am_name
                if canonical_am_id:
                    existing_inv.account_manager_id = canonical_am_id
                if assigned_sh_id:
                    existing_inv.sales_head_id = assigned_sh_id
                if is_direct:
                    existing_inv.is_direct_to_sh = True

                # Add history log
                history_entry = InvoiceHistory(
                    invoice_number=inv_num,
                    batch_id=batch_id,
                    action="UPDATED",
                    previous_pending=prev_amt,
                    new_pending=item["pending_amount"],
                    notes=f"Updated via weekly Tally upload {file.filename}"
                )
                db.add(history_entry)
                updated_count += 1
            else:
                # New invoice!
                new_inv = Invoice(
                    invoice_number=inv_num, # PK
                    party_name=item["party_name"],
                    account_manager_name=canonical_am_name,
                    account_manager_id=canonical_am_id,
                    sales_head_id=assigned_sh_id,
                    is_direct_to_sh=is_direct,
                    invoice_date=item["invoice_date"],
                    opening_amount=item["opening_amount"],
                    pending_amount=item["pending_amount"],
                    amount_type=item["amount_type"],
                    days_overdue=item["days_overdue"],
                    aging_status=item["aging_status"],
                    status="PENDING",
                    first_uploaded_at=now_utc,
                    last_uploaded_at=now_utc,
                    last_batch_id=batch_id
                )
                db.add(new_inv)

                history_entry = InvoiceHistory(
                    invoice_number=inv_num,
                    batch_id=batch_id,
                    action="CREATED",
                    previous_pending=0.0,
                    new_pending=item["pending_amount"],
                    notes=f"Created via weekly Tally upload {file.filename}"
                )
                db.add(history_entry)
                new_count += 1

        # 4. Detect Settled / Paid Invoices:
        # Any pending invoice for this exact AM not in this new weekly file is marked SETTLED/PAID
        settled_count = 0
        am_pending_invoices_query = db.query(Invoice).filter(Invoice.status == "PENDING")
        if canonical_am_id:
            am_pending_invoices_query = am_pending_invoices_query.filter(
                Invoice.account_manager_id == canonical_am_id
            )
        elif canonical_am_name and canonical_am_name != "Unassigned":
            am_pending_invoices_query = am_pending_invoices_query.filter(
                Invoice.account_manager_name == canonical_am_name
            )

        all_am_pending = am_pending_invoices_query.all()
        for prev_inv in all_am_pending:
            if prev_inv.invoice_number not in file_invoice_numbers:
                prev_amt = prev_inv.pending_amount
                prev_inv.status = "SETTLED"
                prev_inv.settled_at = now_utc
                prev_inv.pending_amount = 0.0
                prev_inv.last_batch_id = batch_id

                history_entry = InvoiceHistory(
                    invoice_number=prev_inv.invoice_number,
                    batch_id=batch_id,
                    action="SETTLED",
                    previous_pending=prev_amt,
                    new_pending=0.0,
                    notes="Cleared in subsequent weekly upload (Payment Completed)"
                )
                db.add(history_entry)
                settled_count += 1

        total_pending_sum = sum(i["pending_amount"] for i in invoices_in_file)

        # 5. Save UploadBatch record
        batch_record = UploadBatch(
            id=batch_id,
            filename=file.filename,
            uploaded_by=uploaded_by,
            account_manager_name=canonical_am_name,
            period_range=parsed_data.get("period_range", ""),
            total_invoices_in_file=len(invoices_in_file),
            new_invoices_count=new_count,
            updated_invoices_count=updated_count,
            settled_invoices_count=settled_count,
            total_pending_amount=total_pending_sum,
            uploaded_at=now_utc
        )
        db.add(batch_record)
        db.commit()

        return UploadSummaryResponse(
            batch_id=batch_id,
            filename=file.filename,
            account_manager_name=canonical_am_name,
            total_in_file=len(invoices_in_file),
            new_invoices=new_count,
            updated_invoices=updated_count,
            settled_invoices=settled_count,
            total_pending_amount=total_pending_sum,
            message=f"Successfully processed {len(invoices_in_file)} invoices for {canonical_am_name}. ({new_count} new, {updated_count} updated, {settled_count} auto-cleared/paid)."
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to process Excel: {str(e)}")

# ==========================================
# SAMPLE WEEKLY TALLY EXCEL GENERATOR (FOR DEMO/TESTING)
# ==========================================

@app.get("/api/samples/generate-test-excel")
def generate_sample_excel(scenario: str = "week2"):
    """
    Generates a realistic Tally Excel spreadsheet formatted exactly like the user's screenshot.
    - 'week1': Standard starting data for Saravanan
    - 'week2': Shows invoice 1475 (Levim Lifetech) removed/paid, SE/1550/24-25 updated, and a new invoice added.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Pending Bills"

    # Row 1: Group : Saravanan, 1-Apr-26 to 23-Oct-26
    ws["A1"] = "Group :"
    ws["B1"] = "Saravanan"
    ws["G1"] = "1-Apr-26 to 23-Oct-26"
    ws["A2"] = "Details of:"
    ws["B2"] = "Pending Bills"

    # Row 4: Headers
    headers = ["Date", "Ref. No.", "Party's Name", "Opening Amount", "Pending Amount", "(< 60 days )", "60 to 180 days", "(> 180 days )"]
    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col_idx, value=h)
        cell.font = openpyxl.styles.Font(bold=True)

    r = 6
    if scenario == "week2":
        # Scenario Week 2:
        # Notice: Invoice 1475 for LEVIM LIFETECH is OMITTED (client finished payment!)
        # Instead, LEVIM has a newer invoice
        ws.cell(row=r, column=3, value="LEVIM LIFETECH PVT LTD").font = openpyxl.styles.Font(bold=True)
        r += 1
        ws.cell(row=r, column=1, value="10-Oct-26")
        ws.cell(row=r, column=2, value="FC/2026/8891")
        ws.cell(row=r, column=3, value="LEVIM LIFETECH PVT LTD")
        ws.cell(row=r, column=4, value="185000.00 Dr")
        ws.cell(row=r, column=5, value="185000.00 Dr")
        ws.cell(row=r, column=6, value="185000.00 Dr")
        r += 1
        # Subtotal row
        ws.cell(row=r, column=4, value="185000.00 Dr")
        ws.cell(row=r, column=5, value="185000.00 Dr")
        r += 2

        # OTTO CLOTHING
        ws.cell(row=r, column=3, value="OTTO CLOTHING PVT LTD").font = openpyxl.styles.Font(bold=True)
        r += 1
        ws.cell(row=r, column=1, value="31-Mar-25")
        ws.cell(row=r, column=2, value="SE/1550/24-25")
        ws.cell(row=r, column=3, value="OTTO CLOTHING PVT LTD")
        ws.cell(row=r, column=4, value="93271.00 Dr")
        ws.cell(row=r, column=5, value="93271.00 Dr")
        ws.cell(row=r, column=8, value="93271.00 Dr")
        r += 1
        ws.cell(row=r, column=4, value="93271.00 Dr")
        ws.cell(row=r, column=5, value="93271.00 Dr")
        r += 2

        # Brand New Invoice: WIPRO ENTERPRISES
        ws.cell(row=r, column=3, value="WIPRO ENTERPRISES LTD").font = openpyxl.styles.Font(bold=True)
        r += 1
        ws.cell(row=r, column=1, value="20-Oct-26")
        ws.cell(row=r, column=2, value="FC/2026/9999")
        ws.cell(row=r, column=3, value="WIPRO ENTERPRISES LTD")
        ws.cell(row=r, column=4, value="240000.00 Dr")
        ws.cell(row=r, column=5, value="240000.00 Dr")
        ws.cell(row=r, column=6, value="240000.00 Dr")
        r += 1
        ws.cell(row=r, column=4, value="240000.00 Dr")
        ws.cell(row=r, column=5, value="240000.00 Dr")
    else:
        # Scenario Week 1: Exact screenshot data
        ws.cell(row=r, column=3, value="LEVIM LIFETECH PVT LTD").font = openpyxl.styles.Font(bold=True)
        r += 1
        ws.cell(row=r, column=1, value="05-Sep-25")
        ws.cell(row=r, column=2, value="1475")
        ws.cell(row=r, column=3, value="LEVIM LIFETECH PVT LTD")
        ws.cell(row=r, column=4, value="1180.00 Cr")
        ws.cell(row=r, column=5, value="1180.00 Cr")
        ws.cell(row=r, column=8, value="1180.00 Cr")
        r += 2

        ws.cell(row=r, column=3, value="OTTO CLOTHING PVT LTD").font = openpyxl.styles.Font(bold=True)
        r += 1
        ws.cell(row=r, column=1, value="31-Mar-25")
        ws.cell(row=r, column=2, value="SE/1550/24-25")
        ws.cell(row=r, column=3, value="OTTO CLOTHING PVT LTD")
        ws.cell(row=r, column=4, value="93271.00 Dr")
        ws.cell(row=r, column=5, value="93271.00 Dr")
        ws.cell(row=r, column=8, value="93271.00 Dr")
        r += 2

        ws.cell(row=r, column=3, value="RAQMIYAT INFORMATION TECHNOLOGY PRIVATE LIMITED").font = openpyxl.styles.Font(bold=True)
        r += 1
        ws.cell(row=r, column=1, value="31-Mar-26")
        ws.cell(row=r, column=2, value="Tds 26as")
        ws.cell(row=r, column=3, value="RAQMIYAT INFORMATION TECHNOLOGY PRIVATE LIMITED")
        ws.cell(row=r, column=4, value="14756.51 Cr")
        ws.cell(row=r, column=5, value="14756.51 Cr")
        ws.cell(row=r, column=8, value="14756.51 Cr")

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"Tally_Export_Saravanan_{scenario.capitalize()}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ==========================================
# STATIC FILES SERVING (PRODUCTION / COMBINED)
# ==========================================
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

