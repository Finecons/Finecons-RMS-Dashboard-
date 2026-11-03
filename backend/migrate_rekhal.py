import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "rms.db")

def run_migration():
    print(f"Connecting to database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Find Rekha and Rekhal users
    users = cursor.execute("SELECT id, username, full_name, role FROM users WHERE full_name LIKE '%Rekha%'").fetchall()
    print("Found users with Rekha in name:")
    for u in users:
        print(f"  ID: {u[0]}, Username: {u[1]}, Name: {u[2]}, Role: {u[3]}")

    rekhal_user = cursor.execute("SELECT id, full_name FROM users WHERE full_name LIKE '%Rekhal%' OR username LIKE '%rekhal%'").fetchone()
    if not rekhal_user:
        # Check if user 32 exists
        u32 = cursor.execute("SELECT id, full_name FROM users WHERE id = 32").fetchone()
        if u32:
            rekhal_user = u32
            print(f"Using user 32: {rekhal_user}")
        else:
            print("Rekhal user not found directly. Creating/finding Rekhal...")

    rekhal_id = rekhal_user[0] if rekhal_user else 32
    rekhal_name = rekhal_user[1] if rekhal_user else "Rekhal"

    target_invoices = ['FINE/2832/24-25', 'FINE/1429/25-26', 'FINE/2632/24-25']
    print(f"\nReassigning {len(target_invoices)} invoices to Rekhal (ID: {rekhal_id}, Name: {rekhal_name})...")
    
    for inv_num in target_invoices:
        existing = cursor.execute("SELECT invoice_number, account_manager_id, account_manager_name, party_name FROM invoices WHERE invoice_number = ?", (inv_num,)).fetchone()
        if existing:
            print(f"  Found invoice {inv_num}: currently assigned to ID={existing[1]}, AM='{existing[2]}', Client='{existing[3]}'")
            cursor.execute("""
                UPDATE invoices 
                SET account_manager_id = ?, account_manager_name = ?
                WHERE invoice_number = ?
            """, (rekhal_id, rekhal_name, inv_num))
            print(f"  -> Successfully reassigned {inv_num} to {rekhal_name} (ID: {rekhal_id})")
        else:
            print(f"  Warning: Invoice {inv_num} not found in database.")

    conn.commit()
    conn.close()
    print("\nMigration completed successfully.")

if __name__ == "__main__":
    run_migration()

