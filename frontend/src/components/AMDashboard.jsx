import React, { useState, useEffect } from 'react';
import { 
  UserCheck, Users, FileText, CheckCircle2, AlertTriangle, 
  Clock, ShieldAlert, ArrowLeft, Download, Eye, DollarSign, Calendar, 
  FileDown, Receipt, Edit3, MessageSquare, X, Check
} from 'lucide-react';
import { formatCurrency, formatDate, exportToCsv } from '../utils/formatters';
import { exportReceivablesToPdf } from '../utils/pdfExport';
import CommitmentCalendarModal from './CommitmentCalendarModal';

export default function AMDashboard({ 
  amIdentifier, 
  currentUser,
  onBack, 
  onSelectInvoice,
  isDirectLogin = false 
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [selectedClient, setSelectedClient] = useState('ALL');

  // AM Remarks Modal State
  const [activeRemarkInvoice, setActiveRemarkInvoice] = useState(null);
  const [amRemarkInput, setAmRemarkInput] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Commitment Calendar Modal State
  const [showCommitmentExportModal, setShowCommitmentExportModal] = useState(false);

  useEffect(() => {
    fetchAMData();
  }, [amIdentifier]);

  const fetchAMData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dashboard/am/${amIdentifier}`);
      const amData = await res.json();
      setData(amData);
    } catch (err) {
      console.error('Failed to load AM dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p>Loading Account Manager Portfolio...</p>
      </div>
    );
  }

  const filteredInvoices = data.invoices.filter(inv => {
    const matchesSearch = 
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.party_name.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = 
      filterStatus === 'ALL' ||
      (filterStatus === 'CREDIT' ? inv.amount_type === 'Cr' : (inv.aging_status === filterStatus && inv.amount_type !== 'Cr'));
    const matchesClient = selectedClient === 'ALL' || inv.party_name === selectedClient;

    return matchesSearch && matchesStatus && matchesClient;
  });

  const handleOpenRemarkModal = (inv) => {
    setActiveRemarkInvoice(inv);
    setAmRemarkInput(inv.am_remarks || '');
    setSaveSuccess(false);
  };

  const handleSaveRemark = async (e) => {
    e.preventDefault();
    if (!activeRemarkInvoice) return;
    try {
      setSavingRemark(true);
      const payload = {
        remarks: amRemarkInput,
        am_remarks: amRemarkInput,
        updated_by: currentUser?.full_name || data.am_name || 'Account Manager',
        user_role: currentUser?.role || 'ACCOUNT_MANAGER'
      };
      const res = await fetch(`/api/invoices/${encodeURIComponent(activeRemarkInvoice.invoice_number)}/remarks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update remark');
      }
      const updatedInv = await res.json();

      // Update in data.invoices state
      setData(prev => {
        if (!prev) return prev;
        const newInvs = prev.invoices.map(inv => {
          if (inv.invoice_number === activeRemarkInvoice.invoice_number) {
            return {
              ...inv,
              am_remarks: updatedInv.am_remarks || updatedInv.remarks,
              am_remarks_date: updatedInv.am_remarks_date || updatedInv.remarks_date,
              am_remarks_by: updatedInv.am_remarks_by || updatedInv.remarks_by,
              remarks: updatedInv.remarks || updatedInv.am_remarks,
              remarks_date: updatedInv.remarks_date || updatedInv.am_remarks_date,
              remarks_by: updatedInv.remarks_by || updatedInv.am_remarks_by
            };
          }
          return inv;
        });
        return { ...prev, invoices: newInvs };
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setActiveRemarkInvoice(null);
        setSaveSuccess(false);
      }, 700);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingRemark(false);
    }
  };

  const handleExportCsv = () => {
    exportToCsv(
      `${data.am_name}_Client_Invoices_${new Date().toISOString().split('T')[0]}.csv`,
      filteredInvoices.map(inv => ({
        ...inv,
        am_remarks_formatted: inv.am_remarks 
          ? `[${inv.am_remarks_date ? formatDate(inv.am_remarks_date) : 'Update'}] ${inv.am_remarks}`
          : ''
      })),
      {
        invoice_number: "Invoice Ref No (PK)",
        party_name: "Client Name",
        invoice_date: "Billing Date",
        days_overdue: "Days Overdue",
        pending_amount: "Pending Amount",
        amount_type: "Dr/Cr",
        am_remarks_formatted: "AM Remarks",
        aging_status: "Aging Status",
        status: "Status"
      }
    );
  };

  const handleExportPdf = () => {
    exportReceivablesToPdf({
      title: `${data.am_name} Client Invoices Ledger`,
      subtitle: "Account Manager Dedicated Portfolio • Finecons Private Limited",
      invoices: filteredInvoices,
      filterInfo: `Client: ${selectedClient} | Aging: ${filterStatus} | Search: ${search || 'None'}`,
      includeMDRemarks: false,
      summaryMetrics: {
        totalPending: data.total_am_pending,
        totalInvoices: filteredInvoices.length
      }
    });
  };

  return (
    <div className="dashboard-content-area">
      {/* Navigation Breadcrumb */}
      {!isDirectLogin && (
        <div className="breadcrumb">
          <span className="breadcrumb-link" onClick={onBack}>
            ← Back to Team View
          </span>
          <span>/</span>
          <span>{data.am_name}</span>
        </div>
      )}

      {/* Banner */}
      <div className="profile-banner">
        <div className="profile-info">
          <div className="profile-avatar">
            {data.am_name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="profile-meta">
            <h2>{data.am_name} | Account Manager Ledger</h2>
            <div className="profile-role-tag">
              <UserCheck size={14} />
              <span>Assigned Clients & Active Invoices Portfolio</span>
            </div>
          </div>
        </div>
        <div className="banner-actions">
          <button 
            type="button" 
            className="btn-outline btn-pdf-export" 
            onClick={handleExportPdf}
            title="Download formatted Finecons PDF Report"
          >
            <FileDown size={15} />
            <span>Export PDF</span>
          </button>
          <button 
            type="button" 
            className="btn-outline" 
            onClick={handleExportCsv}
            title="Export CSV data"
          >
            <Download size={15} />
            <span className="hide-on-mobile">Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards (Interactive Filters) */}
      <div className="kpi-grid">
        <div 
          className={`kpi-card kpi-total is-clickable ${filterStatus === 'ALL' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus('ALL')}
          title="Click to view all outstanding invoices"
        >
          <div className="kpi-header">
            <span className="kpi-title">Total Outstanding</span>
            <div className="kpi-icon"><DollarSign size={20} /></div>
          </div>
          <div className="kpi-amount">{formatCurrency(data.total_pending)}</div>
          <div className="kpi-sub">
            <span>Across {data.clients.length} Clients ({data.invoices.length} Bills)</span>
            {filterStatus === 'ALL' && <span className="kpi-filter-tag" style={{ background: '#e0f2fe', color: '#0369a1' }}>● Showing All</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-green is-clickable ${filterStatus === 'GREEN' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'GREEN' ? 'ALL' : 'GREEN')}
          title="Click to filter Delayed ≤ 30 Days (Fresh Bills)"
        >
          <div className="kpi-header">
            <span className="kpi-title">Delayed ≤ 30 Days</span>
            <div className="kpi-icon"><CheckCircle2 size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: 'var(--fc-green-dark)' }}>
            {formatCurrency(data.green_amount)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-green">🟢 Fresh Bills</span>
            {data.green_count !== undefined && <span>{data.green_count} bills</span>}
            {filterStatus === 'GREEN' && <span className="kpi-filter-tag" style={{ background: '#dcfce7', color: '#15803d' }}>● Filter Active</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-orange is-clickable ${filterStatus === 'ORANGE' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'ORANGE' ? 'ALL' : 'ORANGE')}
          title="Click to filter Delayed 31 - 90 Days (Follow-up Due)"
        >
          <div className="kpi-header">
            <span className="kpi-title">Delayed 31 - 90 Days</span>
            <div className="kpi-icon"><AlertTriangle size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: 'var(--fc-amber-dark)' }}>
            {formatCurrency(data.orange_amount)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-orange">🟠 Follow-up Due</span>
            {data.orange_count !== undefined && <span>{data.orange_count} bills</span>}
            {filterStatus === 'ORANGE' && <span className="kpi-filter-tag" style={{ background: '#fef3c7', color: '#b45309' }}>● Filter Active</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-red is-clickable ${filterStatus === 'RED' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'RED' ? 'ALL' : 'RED')}
          title="Click to filter Critical > 90 Days (Escalation Required)"
        >
          <div className="kpi-header">
            <span className="kpi-title">Delayed &gt; 90 Days</span>
            <div className="kpi-icon"><ShieldAlert size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: 'var(--fc-red-dark)' }}>
            {formatCurrency(data.red_amount)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-red">🔴 Escalation Required</span>
            {data.red_count !== undefined && <span>{data.red_count} bills</span>}
            {filterStatus === 'RED' && <span className="kpi-filter-tag" style={{ background: '#fee2e2', color: '#b91c1c' }}>● Filter Active</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-credit is-clickable ${filterStatus === 'CREDIT' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'CREDIT' ? 'ALL' : 'CREDIT')}
          title="Click to filter Credit Notes"
        >
          <div className="kpi-header">
            <span className="kpi-title">Credit Notes</span>
            <div className="kpi-icon"><Receipt size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: '#7c3aed' }}>
            {data.credit_amount > 0 ? `-${formatCurrency(data.credit_amount)}` : formatCurrency(0)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-credit">🟣 {data.credit_count || 0} Credit Notes</span>
            <span>Adjusted from Total</span>
            {filterStatus === 'CREDIT' && <span className="kpi-filter-tag" style={{ background: '#f3e8ff', color: '#6b21a8' }}>● Filter Active</span>}
          </div>
        </div>
      </div>

      {/* Client Summary Chips */}
      <div className="content-card">
        <div className="card-header">
          <h3>
            <Users size={18} color="var(--fc-navy-600)" />
            <span>Assigned Client Accounts ({data.clients.length})</span>
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Filter invoices by clicking a client
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              onClick={() => setSelectedClient('ALL')}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '9999px',
                border: '1px solid',
                borderColor: selectedClient === 'ALL' ? 'var(--fc-navy-700)' : '#cbd5e1',
                background: selectedClient === 'ALL' ? 'var(--fc-navy-700)' : '#ffffff',
                color: selectedClient === 'ALL' ? '#ffffff' : 'var(--fc-navy-900)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              All Clients ({data.invoices.length})
            </button>
            {data.clients.map(c => (
              <button
                key={c.party_name}
                onClick={() => setSelectedClient(c.party_name)}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '9999px',
                  border: '1px solid',
                  borderColor: selectedClient === c.party_name ? 'var(--fc-orange-600)' : '#cbd5e1',
                  background: selectedClient === c.party_name ? 'var(--fc-orange-600)' : '#ffffff',
                  color: selectedClient === c.party_name ? '#ffffff' : 'var(--fc-navy-900)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <span>{c.party_name}</span>
                <span style={{ 
                  background: selectedClient === c.party_name ? 'rgba(255,255,255,0.3)' : '#f1f5f9', 
                  padding: '1px 6px', 
                  borderRadius: '9999px',
                  fontSize: '0.7rem' 
                }}>
                  {formatCurrency(c.total_pending)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invoice Ledger Table */}
      <div className="content-card">
        <div className="card-header">
          <h3>
            <FileText size={18} color="var(--fc-navy-600)" />
            <span>Pending Invoices Ledger (Ref. No. is Primary Key)</span>
          </h3>

          <div className="filter-bar">
            <input 
              type="text"
              placeholder="Search Invoice Ref No or Client..."
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <select 
              className="search-input"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="ALL">All Statuses & Types</option>
              <option value="GREEN">🟢 Delayed ≤ 30 Days (Green)</option>
              <option value="ORANGE">🟠 Delayed 31 - 90 Days (Orange)</option>
              <option value="RED">🔴 Delayed &gt; 90 Days (Red)</option>
              <option value="CREDIT">🟣 Credit Notes (Cr)</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref. No. (Primary Key)</th>
                <th>Client Name</th>
                <th>Billing Date</th>
                <th>Days Overdue</th>
                <th>Opening Amount</th>
                <th>Pending Amount</th>
                <th>Type</th>
                <th>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                    <span>Remarks</span>
                    <button 
                      type="button" 
                      onClick={() => setShowCommitmentExportModal(true)}
                      title="Download Filtered Remarks Report"
                      style={{
                        background: 'transparent',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '2px 5px',
                        cursor: 'pointer',
                        color: 'var(--fc-navy-700)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '0.68rem',
                        fontWeight: 600
                      }}
                    >
                      <Download size={11} />
                      <span>Report</span>
                    </button>
                  </div>
                </th>
                <th>Aging Status</th>
                <th className="sticky-col-right" style={{ textAlign: 'center' }}>History</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No pending invoices found for this criteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.invoice_number} className={inv.amount_type === 'Cr' ? 'credit-row' : ''}>
                    <td>
                      <span 
                        className="primary-key-cell"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onSelectInvoice(inv.invoice_number)}
                        title="Click to view audit history"
                      >
                        {inv.invoice_number}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{inv.party_name}</td>
                    <td>{formatDate(inv.invoice_date)}</td>
                    <td>
                      <span style={{ 
                        fontWeight: 700, 
                        color: inv.amount_type === 'Cr' ? '#7c3aed' : inv.days_overdue > 90 ? 'var(--fc-red-dark)' : inv.days_overdue > 30 ? 'var(--fc-amber-dark)' : 'var(--fc-green-dark)' 
                      }}>
                        {inv.days_overdue} days
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {formatCurrency(inv.opening_amount)}
                    </td>
                    <td style={{ fontWeight: 800, fontFamily: 'Outfit' }}>
                      <span className={inv.amount_type === 'Cr' ? 'particular-cr' : ''}>
                        {inv.amount_type === 'Cr' ? `(-) ${formatCurrency(inv.pending_amount)}` : formatCurrency(inv.pending_amount)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${inv.amount_type === 'Cr' ? 'badge-cr' : 'badge-dr'}`}>
                        {inv.amount_type}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.4rem', minWidth: '150px', maxWidth: '240px' }}>
                        {(inv.am_remarks || inv.remarks) ? (
                          <div style={{ fontSize: '0.8rem', lineHeight: '1.3', flex: 1 }}>
                            <div style={{ fontWeight: 600, color: 'var(--fc-navy-900)' }}>{inv.am_remarks || inv.remarks}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={11} />
                              <span>{(inv.am_remarks_date || inv.remarks_date) ? formatDate(inv.am_remarks_date || inv.remarks_date) : 'Recently'}</span>
                              {(inv.am_remarks_by || inv.remarks_by) && <span>• {inv.am_remarks_by || inv.remarks_by}</span>}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontStyle: 'italic' }}>No remarks</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenRemarkModal(inv)}
                          title="Add / Edit Remark"
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '3px 6px',
                            cursor: 'pointer',
                            color: '#334155',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.72rem',
                            flexShrink: 0
                          }}
                        >
                          <Edit3 size={11} />
                          <span>{(inv.am_remarks || inv.remarks) ? 'Edit' : 'Add'}</span>
                        </button>
                      </div>
                    </td>
                    <td>
                      {inv.amount_type === 'Cr' ? (
                        <span className="badge badge-credit">
                          🟣 Credit Note (Cr)
                        </span>
                      ) : inv.aging_status === 'GREEN' ? (
                        <span className="badge badge-green">🟢 ≤ 30 Days</span>
                      ) : inv.aging_status === 'ORANGE' ? (
                        <span className="badge badge-orange">🟠 31 - 90 Days</span>
                      ) : (
                        <span className="badge badge-red">🔴 &gt; 90 Days</span>
                      )}
                    </td>
                    <td className="sticky-col-right" style={{ textAlign: 'center' }}>
                      <button 
                        className="btn-outline" 
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', fontWeight: 600 }}
                        onClick={() => onSelectInvoice(inv.invoice_number)}
                      >
                        <Eye size={13} />
                        <span>Audit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AM Remarks Modal */}
      {activeRemarkInvoice && (
        <div className="modal-overlay" onClick={() => setActiveRemarkInvoice(null)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ 
                  width: '36px', 
                  height: '36px', 
                  borderRadius: '8px', 
                  background: 'var(--fc-navy-50)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: 'var(--fc-navy-700)'
                }}>
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--fc-navy-900)' }}>
                    Account Manager Status Update
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Ref: <strong className="primary-key-cell">{activeRemarkInvoice.invoice_number}</strong> • Client: {activeRemarkInvoice.party_name}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setActiveRemarkInvoice(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRemark}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-navy-900)', marginBottom: '0.4rem' }}>
                    Invoice Progress / Client Follow-up Remark
                  </label>
                  <textarea
                    className="search-input"
                    rows={4}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem' }}
                    placeholder="e.g. Spoke with client finance team today; payment cheque dispatched or promised by Friday..."
                    value={amRemarkInput}
                    onChange={e => setAmRemarkInput(e.target.value)}
                    autoFocus
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    💡 This remark will be visible to the Managing Director and Sales Division leadership with today's date stamp.
                  </div>
                </div>

                {saveSuccess && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    color: 'var(--fc-green-dark)', 
                    background: '#f0fdf4', 
                    padding: '0.5rem 0.75rem', 
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}>
                    <Check size={16} />
                    <span>Remark updated and synced to Managing Director!</span>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0' }}>
                <button 
                  type="button" 
                  className="btn-outline" 
                  onClick={() => setActiveRemarkInvoice(null)}
                  disabled={savingRemark}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-accent" 
                  disabled={savingRemark}
                >
                  {savingRemark ? 'Saving...' : 'Save Remark'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Calendar Month Commitment Filter & Export Modal */}
      <CommitmentCalendarModal
        isOpen={showCommitmentExportModal}
        onClose={() => setShowCommitmentExportModal(false)}
        invoices={filteredInvoices}
        exportPrefix={data?.am_name || "AM"}
      />
    </div>
  );
}