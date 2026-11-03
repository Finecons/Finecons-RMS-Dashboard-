import re
from datetime import datetime, date, timezone
from typing import List, Dict, Any, Tuple, Optional
import openpyxl
from io import BytesIO

MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
}

def parse_tally_date(val: Any) -> Tuple[Optional[date], str]:
    """Parse various Tally date representations into date object and ISO string."""
    if not val:
        return None, ""
    if isinstance(val, (datetime, date)):
        if isinstance(val, datetime):
            val = val.date()
        return val, val.strftime("%Y-%m-%d")
    
    s = str(val).strip()
    # Try formats: 05-Sep-25, 05-Sep-2025, 31-Mar-25, 2025-09-05, 05/09/2025
    # Regex for dd-Mon-yy or dd-Mon-yyyy
    match_mon = re.match(r"^(\d{1,2})[-/ ]([a-zA-Z]{3})[-/ ](\d{2,4})$", s)
    if match_mon:
        day = int(match_mon.group(1))
        mon_str = match_mon.group(2).lower()
        year = int(match_mon.group(3))
        if year < 100:
            year += 2000
        month = MONTH_MAP.get(mon_str, 1)
        try:
            d = date(year, month, day)
            return d, d.strftime("%Y-%m-%d")
        except Exception:
            pass

    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%d-%m-%y"):
        try:
            dt = datetime.strptime(s, fmt).date()
            return dt, dt.strftime("%Y-%m-%d")
        except Exception:
            continue

    return None, s

def parse_amount(val: Any, num_format: Optional[str] = None) -> Tuple[float, str]:
    """
    Parses amount and detects Dr / Cr.
    Example: '1180.00 Cr' -> (1180.0, 'Cr')
    '93271.00 Dr' -> (93271.0, 'Dr')
    Format: '""0.00" Cr"' -> (15000.0, 'Cr')
    """
    if val is None or val == "":
        return 0.0, "Dr"
    
    fmt = str(num_format or "").strip().lower()
    amount_type = "Dr"
    if "cr" in fmt:
        amount_type = "Cr"
    elif "dr" in fmt:
        amount_type = "Dr"

    if isinstance(val, (int, float)):
        if val < 0:
            amount_type = "Cr"
        return abs(float(val)), amount_type

    s = str(val).strip()
    if "cr" in s.lower():
        amount_type = "Cr"
    elif "dr" in s.lower() and amount_type != "Cr":
        amount_type = "Dr"

    # Remove currency symbols, Cr, Dr, commas
    cleaned = re.sub(r"[^\d.-]", "", s)
    try:
        amt = float(cleaned)
        if amt < 0:
            amount_type = "Cr"
        return abs(amt), amount_type
    except Exception:
        return 0.0, amount_type

def calculate_aging(inv_date: Optional[date], as_of_date: Optional[date] = None) -> Tuple[int, str]:
    """
    Aging highlight rules:
    - <= 30 days: GREEN
    - 31 to 90 days: ORANGE
    - > 90 days: RED
    """
    if not as_of_date:
        as_of_date = date.today()
    
    if not inv_date:
        return 0, "GREEN"

    days = (as_of_date - inv_date).days
    if days < 0:
        days = 0

    if days <= 30:
        status = "GREEN"
    elif days <= 90:
        status = "ORANGE"
    else:
        status = "RED"

    return days, status

def parse_tally_workbook(
    file_bytes: bytes, 
    override_am: Optional[str] = None, 
    as_of_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Parses an uploaded Tally Excel file.
    Supports single or multi-sheet workbooks regardless of filename.
    Analyzes inner file structure:
    - Row 1: 'Group : <AM_NAME>' (case-insensitive, e.g. Bala PDY, Jennifer, Saravanan)
    - Row 1/2: Period range e.g. '1-Apr-25 to 22-Oct-26'
    - Table Headers: Date, Ref. No. (Primary Key), Party's Name, Opening Amount, Pending Amount.
    - Data rows: Client section headers, individual invoice rows, subtotals.
    """
    try:
        wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)
    except Exception:
        import pandas as pd
        xls_dict = pd.read_excel(BytesIO(file_bytes), sheet_name=None, header=None)
        wb = openpyxl.Workbook()
        wb.remove(wb.active)
        for s_name, df in xls_dict.items():
            ws = wb.create_sheet(title=str(s_name))
            for row in df.itertuples(index=False):
                ws.append([None if (pd.isna(v) or v == "") else v for v in row])

    all_invoices = []
    detected_am = override_am.strip() if override_am else None
    period_range = ""

    if not as_of_date:
        as_of_date = date.today()

    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        current_client = ""
        header_row_idx = None
        col_indices = {}

        # Scan top 15 rows for metadata (Group : <AM>, Period range, and Column Headers)
        for r_idx in range(1, min(16, sheet.max_row + 1)):
            row_vals = [sheet.cell(row=r_idx, column=c_idx).value for c_idx in range(1, min(15, sheet.max_column + 1))]
            
            # 1. Check for Group : <AM> (case-insensitive)
            if not detected_am:
                for c_pos, cell_val in enumerate(row_vals):
                    if cell_val and "group" in str(cell_val).lower():
                        c_str = str(cell_val).strip()
                        # e.g. "Group : Bala PDY" or "GROUP : Jennifer"
                        if ":" in c_str:
                            parts = c_str.split(":", 1)
                            am_candidate = parts[1].strip() if len(parts) > 1 else ""
                            if am_candidate and not any(kw in am_candidate.lower() for kw in ["details", "pending", "bill", "date", "1-", "2-", "3-"]):
                                detected_am = am_candidate
                        # Or Col A has "Group :" and Col B has "Bala PDY"
                        if not detected_am and c_pos + 1 < len(row_vals) and row_vals[c_pos + 1]:
                            next_val = str(row_vals[c_pos + 1]).strip()
                            if next_val and not any(kw in next_val.lower() for kw in ["details", "pending", "bill", "date", "to", "1-", "2-", "3-"]):
                                detected_am = next_val

            # 2. Check for period range: e.g. "1-Apr-25 to 22-Oct-26"
            for cell_val in row_vals:
                if cell_val and " to " in str(cell_val).lower() and any(m in str(cell_val).lower() for m in ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "-"]):
                    period_range = str(cell_val).strip()
                    parts = period_range.lower().split(" to ")
                    if len(parts) == 2:
                        end_dt, _ = parse_tally_date(parts[1].strip())
                        if end_dt and not as_of_date:
                            as_of_date = end_dt

            # 3. Check if this row is the column header row
            val_str = " ".join([str(v).lower() for v in row_vals if v is not None])
            if ("ref. no" in val_str or "ref no" in val_str or "bill no" in val_str or "invoice" in val_str or "ref." in val_str) and \
               ("pending" in val_str or "amount" in val_str or "party" in val_str or "date" in val_str or "opening" in val_str):
                header_row_idx = r_idx
                # Map column indices
                for c_idx in range(1, sheet.max_column + 1):
                    h_val = str(sheet.cell(row=r_idx, column=c_idx).value or "").strip().lower()
                    if "date" in h_val and "date" not in col_indices:
                        col_indices["date"] = c_idx
                    elif ("ref" in h_val or "bill" in h_val or "invoice" in h_val) and "ref_no" not in col_indices:
                        col_indices["ref_no"] = c_idx
                    elif ("party" in h_val or "client" in h_val or "particular" in h_val) and "party" not in col_indices:
                        col_indices["party"] = c_idx
                    elif "opening" in h_val and "opening" not in col_indices:
                        col_indices["opening"] = c_idx
                    elif "pending" in h_val and "pending" not in col_indices:
                        col_indices["pending"] = c_idx
                    elif re.search(r"\b(account\s*manager|am|a\.m\.)\b", h_val) and "amount" not in h_val and "am" not in col_indices:
                        col_indices["am"] = c_idx

        # If header row was not found, fallback standard Tally columns
        if not header_row_idx:
            header_row_idx = 4
            col_indices = {
                "date": 1,
                "ref_no": 2,
                "party": 3,
                "opening": 4,
                "pending": 5
            }

        # Fallback sheet name if AM still not found
        if not detected_am and sheet_name.lower() not in ["sheet1", "sheet", "summary", "pending", "pending bills", "page 1", "table 1"]:
            detected_am = sheet_name.strip()

        # Clean detected AM name (remove any trailing suffixes or accidental colons)
        if detected_am:
            detected_am = re.sub(r"^(group\s*:?\s*)", "", detected_am, flags=re.IGNORECASE).strip()

        # Parse rows starting after header row
        for r_idx in range(header_row_idx + 1, sheet.max_row + 1):
            date_cell = sheet.cell(row=r_idx, column=col_indices.get("date", 1))
            ref_cell = sheet.cell(row=r_idx, column=col_indices.get("ref_no", 2))
            party_cell = sheet.cell(row=r_idx, column=col_indices.get("party", 3))
            opening_cell = sheet.cell(row=r_idx, column=col_indices.get("opening", 4))
            pending_cell = sheet.cell(row=r_idx, column=col_indices.get("pending", 5))
            row_am_val = sheet.cell(row=r_idx, column=col_indices.get("am", 99)).value if "am" in col_indices else None

            date_val = date_cell.value
            ref_val = ref_cell.value
            party_val = party_cell.value
            opening_val = opening_cell.value
            pending_val = pending_cell.value

            # Skip header continuation rows (e.g. Row 5 with 'Amount' under Opening/Pending)
            row_text = " ".join([str(sheet.cell(row=r_idx, column=c).value or "").strip().lower() for c in range(1, min(7, sheet.max_column + 1))])
            if not row_text or row_text in ["amount", "amount amount", "dr", "cr"]:
                continue

            # Skip grand total rows or subtotal rows
            if "grand total" in row_text or "total" in row_text:
                continue

            ref_str = str(ref_val or "").strip()

            # Check if this row is a Subtotal row or Client Header row
            if not ref_str or ref_str.lower() in ["none", ""]:
                # If opening_val or pending_val has numbers, this is a Subtotal row -> Skip
                open_sub, _ = parse_amount(opening_val, opening_cell.number_format)
                pend_sub, _ = parse_amount(pending_val, pending_cell.number_format)
                if open_sub > 0 or pend_sub > 0:
                    continue

                # Potential client header row (Tally prints the party name in Col 2 or Col 3 with no Ref. No. and no amounts)
                cand = str(party_val or ref_val or date_val or "").strip()
                cand_lower = cand.lower()
                if cand and not any(kw in cand_lower for kw in ["total", "subtotal", "group :", "group:", "details of", "amount", "opening", "pending", "ref. no", "ref no", "bill no", "party's name", "party name", "date"]):
                    current_client = cand
                continue

            # If ref_str is present, this is a valid invoice record!
            # If party_val is empty, use current_client
            client_name = str(party_val or "").strip()
            if not client_name:
                client_name = current_client
            else:
                current_client = client_name

            inv_date, inv_date_str = parse_tally_date(date_val)
            if not inv_date_str:
                inv_date_str = as_of_date.strftime("%Y-%m-%d")

            open_amt, open_type = parse_amount(opening_val, opening_cell.number_format)
            pend_amt, amt_type = parse_amount(pending_val, pending_cell.number_format)
            if pend_amt == 0.0 and open_amt > 0:
                pend_amt = open_amt
                amt_type = open_type
            elif open_type == "Cr" and amt_type == "Dr" and "dr" not in str(pending_cell.number_format or "").lower():
                amt_type = "Cr"

            days_overdue, aging_status = calculate_aging(inv_date, as_of_date)
            # All Cr values (credit notes/advance payments) belong in the GREEN zone
            if amt_type == "Cr":
                aging_status = "GREEN"

            row_am = str(row_am_val).strip() if (row_am_val and "am" in col_indices) else (detected_am or "Unassigned")

            all_invoices.append({
                "invoice_number": ref_str, # PRIMARY KEY
                "party_name": client_name or "Unknown Client",
                "account_manager_name": row_am,
                "invoice_date": inv_date_str,
                "opening_amount": open_amt,
                "pending_amount": pend_amt,
                "amount_type": amt_type,
                "days_overdue": days_overdue,
                "aging_status": aging_status,
                "status": "PENDING"
            })

    return {
        "account_manager_name": detected_am or "Unassigned",
        "period_range": period_range,
        "as_of_date": as_of_date.strftime("%Y-%m-%d"),
        "invoices": all_invoices
    }
