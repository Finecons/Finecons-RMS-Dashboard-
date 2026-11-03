from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class UserBase(BaseModel):
    username: str
    full_name: str
    role: str
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    sales_head_id: Optional[int] = None

class UserOut(UserBase):
    id: int
    is_active: bool = True
    sales_head_name: Optional[str] = None

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    user: UserOut
    token: str
    message: str

class CreateUserRequest(BaseModel):
    username: str
    full_name: str
    password: str
    role: str # 'ACCOUNT_MANAGER', 'SALES_HEAD', 'MD', 'BILLING'
    sales_head_id: Optional[int] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    new_password: str

class UserUpdateRequest(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    sales_head_id: Optional[int] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = None

class InvoiceBase(BaseModel):
    invoice_number: str
    party_name: str
    account_manager_name: Optional[str] = None
    invoice_date: str
    opening_amount: float
    pending_amount: float
    amount_type: str = "Dr"
    days_overdue: int = 0
    aging_status: str = "GREEN"
    status: str = "PENDING"
    is_direct_to_sh: bool = False

class InvoiceOut(InvoiceBase):
    account_manager_id: Optional[int] = None
    sales_head_id: Optional[int] = None
    first_uploaded_at: Optional[datetime] = None
    last_uploaded_at: Optional[datetime] = None
    settled_at: Optional[datetime] = None
    last_batch_id: Optional[str] = None

    # Dual Remarks / Unified Remarks
    am_remarks: Optional[str] = None
    am_remarks_date: Optional[datetime] = None
    am_remarks_by: Optional[str] = None
    remarks: Optional[str] = None
    remarks_date: Optional[datetime] = None
    remarks_by: Optional[str] = None
    md_remarks: Optional[str] = None
    md_remarks_date: Optional[datetime] = None
    md_remarks_by: Optional[str] = None

    class Config:
        from_attributes = True

class UpdateRemarksRequest(BaseModel):
    remarks: Optional[str] = None
    am_remarks: Optional[str] = None
    md_remarks: Optional[str] = None
    updated_by: str = "User"
    user_role: str = "ACCOUNT_MANAGER" # 'MD', 'ACCOUNT_MANAGER', 'SALES_HEAD', 'BILLING'

class SalesHeadSummary(BaseModel):
    id: int
    name: str
    designation: Optional[str] = None
    total_pending: float
    green_pending: float
    orange_pending: float
    red_pending: float
    credit_pending: float = 0.0
    credit_count: int = 0
    am_count: int
    invoice_count: int
    client_count: int
    direct_clients_count: int = 0
    direct_pending_amount: float = 0.0

class AccountManagerSummary(BaseModel):
    id: Optional[int] = None
    name: str
    total_pending: float
    green_pending: float
    orange_pending: float
    red_pending: float
    credit_pending: float = 0.0
    credit_count: int = 0
    invoice_count: int
    client_count: int

class ClientSummary(BaseModel):
    party_name: str
    total_pending: float
    invoice_count: int
    oldest_invoice_date: Optional[str] = None
    highest_aging_status: str

class MDDashboardResponse(BaseModel):
    total_company_pending: float
    total_invoices_count: int
    total_clients_count: int
    green_amount: float
    green_count: int
    orange_amount: float
    orange_count: int
    red_amount: float
    red_count: int
    credit_amount: float = 0.0
    credit_count: int = 0
    settled_amount: float
    settled_count: int
    sales_heads: List[SalesHeadSummary]

class SalesHeadDashboardResponse(BaseModel):
    sales_head_id: int
    sales_head_name: str
    total_team_pending: float
    green_amount: float
    orange_amount: float
    red_amount: float
    credit_amount: float = 0.0
    credit_count: int = 0
    account_managers: List[AccountManagerSummary]
    # Direct Clients handled by Sales Head without an AM
    direct_pending_amount: float = 0.0
    direct_green_amount: float = 0.0
    direct_orange_amount: float = 0.0
    direct_red_amount: float = 0.0
    direct_credit_amount: float = 0.0
    direct_credit_count: int = 0
    direct_clients: List[ClientSummary] = []
    direct_invoices: List[InvoiceOut] = []

class AMDashboardResponse(BaseModel):
    am_id: Optional[int] = None
    am_name: str
    total_pending: float
    green_amount: float
    green_count: int = 0
    orange_amount: float
    orange_count: int = 0
    red_amount: float
    red_count: int = 0
    credit_amount: float = 0.0
    credit_count: int = 0
    clients: List[ClientSummary]
    invoices: List[InvoiceOut]

class UploadSummaryResponse(BaseModel):
    batch_id: str
    filename: str
    account_manager_name: Optional[str] = None
    total_in_file: int
    new_invoices: int
    updated_invoices: int
    settled_invoices: int
    total_pending_amount: float
    message: str
