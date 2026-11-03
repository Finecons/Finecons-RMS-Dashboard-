import React, { useState, useEffect } from 'react';
import { X, FileText, Calendar, Building, DollarSign, Clock, CheckCircle2, History } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function InvoiceDetailModal({ invoiceNumber, isOpen, onClose, currentUser }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (invoiceNumber && isOpen) {
      fetchInvoiceDetail();
    }
  }, [invoiceNumber, isOpen, currentUser]);

  const fetchInvoiceDetail = async () => {
    try {
      setLoading(true);
      const roleParam = currentUser?.role ? `?user_role=${currentUser.role}` : '';
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNumber)}${roleParam}`);
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      console.error("Failed to load invoice detail:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isMD = currentUser?.role === 'MD';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileText size={22} color="var(--fc-navy-600)" />
            <div>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Invoice Audit & History</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Primary Key: <span className="primary-key-cell">{invoiceNumber}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {loading || !detail ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <Clock size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
              <p>Fetching invoice records...</p>
            </div>
          ) : (
            <div>
              {/* Key details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', background: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Client (Party's Name)</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--fc-navy-900)' }}>{detail.invoice.party_name}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Account Manager</div>
                  <div style={{ fontWeight: 600, color: 'var(--fc-navy-800)' }}>{detail.invoice.account_manager_name || "-"}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Billing Date</div>
                  <div style={{ fontWeight: 600 }}>{formatDate(detail.invoice.invoice_date)}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aging & Overdue</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <span style={{ fontWeight: 700, color: detail.invoice.amount_type === 'Cr' ? '#7c3aed' : undefined }}>
                      {detail.invoice.days_overdue} days
                    </span>
                    {detail.invoice.status === 'SETTLED' ? (
                      <span className="badge badge-settled">✓ Settled</span>
                    ) : detail.invoice.amount_type === 'Cr' ? (
                      <span className="badge badge-credit">
                        🟣 Credit Note (Cr)
                      </span>
                    ) : detail.invoice.aging_status === 'GREEN' ? (
                      <span className="badge badge-green">🟢 ≤ 30 Days</span>
                    ) : detail.invoice.aging_status === 'ORANGE' ? (
                      <span className="badge badge-orange">🟠 31 - 90 Days</span>
                    ) : (
                      <span className="badge badge-red">🔴 &gt; 90 Days</span>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Opening Amount</div>
                  <div style={{ fontWeight: 600 }}>{formatCurrency(detail.invoice.opening_amount)}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current Pending Balance</div>
                  <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--fc-navy-800)' }}>
                    {formatCurrency(detail.invoice.pending_amount)} ({detail.invoice.amount_type})
                  </div>
                </div>
              </div>

              {/* Weekly History Timeline */}
              <h4 style={{ fontSize: '1rem', color: 'var(--fc-navy-900)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <History size={16} color="var(--fc-navy-600)" />
                <span>Weekly Sync & Audit Trail</span>
              </h4>

              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Prev Pending</th>
                      <th>New Pending</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.history && detail.history.length > 0 ? (
                      detail.history.map((h) => (
                        <tr key={h.id}>
                          <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                            {new Date(h.timestamp).toLocaleString()}
                          </td>
                          <td>
                            <span className={`badge ${h.action === 'CREATED' ? 'badge-green' :
                                h.action === 'SETTLED' ? 'badge-settled' :
                                  h.action === 'MD_NOTE' ? 'badge-blue' :
                                    h.action === 'AM_REMARK' ? 'badge-credit' : 'badge-orange'
                              }`}>
                              {h.action}
                            </span>
                          </td>
                          <td>{h.previous_pending !== undefined && h.previous_pending !== null ? formatCurrency(h.previous_pending) : '-'}</td>
                          <td style={{ fontWeight: 700 }}>{h.new_pending !== undefined && h.new_pending !== null ? formatCurrency(h.new_pending) : '-'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{h.notes}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                          No audit entries recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}