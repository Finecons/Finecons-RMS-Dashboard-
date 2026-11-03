import React, { useState, useEffect } from 'react';
import {
  Briefcase, Users, FileText, CheckCircle2, AlertTriangle,
  Clock, ShieldAlert, ArrowLeft, ArrowUpRight, Search, Download, Eye, FileDown, Receipt,
  Edit3, X, Check
} from 'lucide-react';
import { formatCurrency, formatDate, exportToCsv, exportConsolidatedReceivablesToCsv } from '../utils/formatters';
import { exportReceivablesToPdf } from '../utils/pdfExport';
import CommitmentCalendarModal from './CommitmentCalendarModal';

export default function SalesHeadDashboard({
  currentUser,
  salesHeadId,
  onBackToMD,
  onSelectAM,
  onSelectInvoice,
  isDirectLogin = false
}) {
  const [data, setData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAM, setFilterAM] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Unified Remarks Modal State
  const [activeRemarkInvoice, setActiveRemarkInvoice] = useState(null);
  const [unifiedRemarkInput, setUnifiedRemarkInput] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Commitment Calendar Modal State
  const [showCommitmentExportModal, setShowCommitmentExportModal] = useState(false);

  useEffect(() => {
    fetchSalesHeadData();
  }, [salesHeadId]);

  const fetchSalesHeadData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dashboard/sales-head/${salesHeadId}`);
      const shData = await res.json();
      setData(shData);

      const invRes = await fetch(`/api/invoices?sales_head_id=${salesHeadId}&status=ALL`);
      const invData = await invRes.json();
      setInvoices(invData);
    } catch (err) {
      console.error('Failed to load Sales Head dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p>Loading Sales Division Receivables...</p>
      </div>
    );
  }

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.party_name.toLowerCase().includes(search.toLowerCase()) ||
      (inv.account_manager_name && inv.account_manager_name.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'SETTLED' ? inv.status === 'SETTLED' :
        filterStatus === 'CREDIT' ? inv.amount_type === 'Cr' && inv.status !== 'SETTLED' :
          inv.aging_status === filterStatus && inv.amount_type !== 'Cr' && inv.status !== 'SETTLED');
    const matchesAM = filterAM === 'ALL' || 
      (filterAM === 'DIRECT' 
        ? (inv.is_direct_to_sh || inv.account_manager_id === salesHeadId || (inv.account_manager_name && inv.account_manager_name.toLowerCase().includes('direct')))
        : (String(inv.account_manager_id) === String(filterAM) || (inv.account_manager_name && inv.account_manager_name.toLowerCase().includes(filterAM.toLowerCase()))));

    return matchesSearch && matchesStatus && matchesAM;
  });

  const filteredDirectInvoices = (data.direct_invoices || []).filter(inv => {
    const matchesSearch = !search ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.party_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'SETTLED' ? inv.status === 'SETTLED' :
        filterStatus === 'CREDIT' ? inv.amount_type === 'Cr' && inv.status !== 'SETTLED' :
          inv.aging_status === filterStatus && inv.amount_type !== 'Cr' && inv.status !== 'SETTLED');
    return matchesSearch && matchesStatus;
  });

  const handleExportCsv = () => {
    exportConsolidatedReceivablesToCsv(
      `${data.sales_head_name}_Team_Receivables_${new Date().toISOString().split('T')[0]}.csv`,
      filteredInvoices
    );
  };

  const handleExportPdf = () => {
    exportReceivablesToPdf({
      title: `${data.sales_head_name} Division Receivables Report`,
      subtitle: "Sales Head Team Audit • Finecons Private Limited",
      invoices: filteredInvoices,
      filterInfo: `AM: ${filterAM} | Aging: ${filterStatus} | Search: ${search || 'None'}`,
      summaryMetrics: {
        totalPending: data.total_division_pending,
        totalInvoices: filteredInvoices.length
      }
    });
  };

  const handleOpenRemarkModal = (inv) => {
    setActiveRemarkInvoice(inv);
    setUnifiedRemarkInput(inv.am_remarks || inv.remarks || '');
    setSaveSuccess(false);
  };

  const handleSaveRemarks = async (e) => {
    e.preventDefault();
    if (!activeRemarkInvoice) return;
    try {
      setSavingRemark(true);
      const payload = {
        remarks: unifiedRemarkInput,
        am_remarks: unifiedRemarkInput,
        updated_by: currentUser?.full_name || data?.sales_head_name || 'Sales Head',
        user_role: currentUser?.role || 'SALES_HEAD'
      };
      const res = await fetch(`/api/invoices/${encodeURIComponent(activeRemarkInvoice.invoice_number)}/remarks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save remarks');
      }
      const updatedInv = await res.json();

      // Update in invoices
      setInvoices(prev => prev.map(item => {
        if (item.invoice_number === activeRemarkInvoice.invoice_number) {
          return {
            ...item,
            am_remarks: updatedInv.am_remarks || updatedInv.remarks,
            am_remarks_date: updatedInv.am_remarks_date || updatedInv.remarks_date,
            am_remarks_by: updatedInv.am_remarks_by || updatedInv.remarks_by,
            remarks: updatedInv.remarks || updatedInv.am_remarks,
            remarks_date: updatedInv.remarks_date || updatedInv.am_remarks_date,
            remarks_by: updatedInv.remarks_by || updatedInv.am_remarks_by
          };
        }
        return item;
      }));

      // Update in direct_invoices if present in data
      setData(prev => {
        if (!prev || !prev.direct_invoices) return prev;
        const newDirect = prev.direct_invoices.map(item => {
          if (item.invoice_number === activeRemarkInvoice.invoice_number) {
            return {
              ...item,
              am_remarks: updatedInv.am_remarks || updatedInv.remarks,
              am_remarks_date: updatedInv.am_remarks_date || updatedInv.remarks_date,
              am_remarks_by: updatedInv.am_remarks_by || updatedInv.remarks_by,
              remarks: updatedInv.remarks || updatedInv.am_remarks,
              remarks_date: updatedInv.remarks_date || updatedInv.am_remarks_date,
              remarks_by: updatedInv.remarks_by || updatedInv.am_remarks_by
            };
          }
          return item;
        });
        return { ...prev, direct_invoices: newDirect };
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

  return (
    <div className="dashboard-content-area">
      {/* Navigation Breadcrumb */}
      {!isDirectLogin && (
        <div className="breadcrumb">
          <span className="breadcrumb-link" onClick={onBackToMD}>
            ← Company Overview (MD)
          </span>
          <span>/</span>
          <span>{data.sales_head_name}</span>
        </div>
      )}

      {/* Banner */}
      <div className="profile-banner">
        <div className="profile-info">
          <div className="profile-avatar">
            {data.sales_head_name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="profile-meta">
            <h2>{data.sales_head_name} | Sales Head Dashboard</h2>
            <div className="profile-role-tag">
              <Briefcase size={14} />
              <span>Division Scope: Only Assigned Account Managers & Invoices</span>
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
          title="Click to view all team receivables"
        >
          <div className="kpi-header">
            <span className="kpi-title">Team Total Pending</span>
            <div className="kpi-icon"><Briefcase size={20} /></div>
          </div>
          <div className="kpi-amount">{formatCurrency(data.total_team_pending)}</div>
          <div className="kpi-sub">
            <span>Across {data.account_managers.length} Account Managers</span>
            {filterStatus === 'ALL' && <span className="kpi-filter-tag" style={{ background: '#e0f2fe', color: '#0369a1' }}>● Showing All</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-green is-clickable ${filterStatus === 'GREEN' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'GREEN' ? 'ALL' : 'GREEN')}
          title="Click to filter Delayed ≤ 30 Days (Healthy)"
        >
          <div className="kpi-header">
            <span className="kpi-title">Delayed ≤ 30 Days</span>
            <div className="kpi-icon"><CheckCircle2 size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: 'var(--fc-green-dark)' }}>
            {formatCurrency(data.green_amount)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-green">Healthy</span>
            <span>Within standard credit terms</span>
            {filterStatus === 'GREEN' && <span className="kpi-filter-tag" style={{ background: '#dcfce7', color: '#15803d' }}>● Filter Active</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-orange is-clickable ${filterStatus === 'ORANGE' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'ORANGE' ? 'ALL' : 'ORANGE')}
          title="Click to filter Delayed 31 - 90 Days (Follow-up)"
        >
          <div className="kpi-header">
            <span className="kpi-title">Delayed 31 - 90 Days</span>
            <div className="kpi-icon"><AlertTriangle size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: 'var(--fc-amber-dark)' }}>
            {formatCurrency(data.orange_amount)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-orange">Follow-up</span>
            <span>Needs manager intervention</span>
            {filterStatus === 'ORANGE' && <span className="kpi-filter-tag" style={{ background: '#fef3c7', color: '#b45309' }}>● Filter Active</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-red is-clickable ${filterStatus === 'RED' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'RED' ? 'ALL' : 'RED')}
          title="Click to filter Critical > 90 Days"
        >
          <div className="kpi-header">
            <span className="kpi-title">Critical &gt; 90 Days</span>
            <div className="kpi-icon"><ShieldAlert size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: 'var(--fc-red-dark)' }}>
            {formatCurrency(data.red_amount)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-red">Escalation</span>
            <span>High credit risk</span>
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

      {/* DIRECT ACCOUNTS HANDLED BY SALES HEAD DIRECTLY */}
      <div id="direct-accounts-section">
        {data.direct_clients && data.direct_clients.length > 0 ? (
          <div className="content-card" style={{ border: '2px solid #fed7aa', background: '#fffaf5' }}>
            <div className="card-header" style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
              <div>
                <h3 style={{ color: 'var(--fc-orange-700)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Briefcase size={18} color="var(--fc-orange-600)" />
                  <span>Direct Accounts Handled by {data.sales_head_name} (Without Account Manager)</span>
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {data.direct_clients.length} key enterprise clients managed directly at the Sales Head level ({data.direct_invoices.length} Invoices)
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Direct Pending Balance</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--fc-orange-700)', fontFamily: 'Outfit' }}>
                    {formatCurrency(data.direct_pending_amount)}
                  </div>
                </div>
              </div>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client Account</th>
                    <th>Ref. No. (PK)</th>
                    <th>Billing Date</th>
                    <th>Days Overdue</th>
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
                    <th className="sticky-col-right" style={{ textAlign: 'center' }}>Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDirectInvoices.map((inv) => (
                    <tr key={inv.invoice_number} style={inv.amount_type === 'Cr' ? { background: '#f0fdf4' } : {}}>
                      <td style={{ fontWeight: 700, color: 'var(--fc-navy-900)' }}>
                        🏢 {inv.party_name}
                      </td>
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
                      <td>{formatDate(inv.invoice_date)}</td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          color: inv.amount_type === 'Cr' ? '#15803d' : inv.days_overdue > 90 ? 'var(--fc-red-dark)' : inv.days_overdue > 30 ? 'var(--fc-amber-dark)' : 'var(--fc-green-dark)'
                        }}>
                          {inv.days_overdue} days
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, fontFamily: 'Outfit' }}>
                        <span className={inv.amount_type === 'Cr' ? 'particular-cr' : ''} style={{ color: inv.amount_type === 'Cr' ? '#15803d' : 'var(--fc-orange-700)' }}>
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
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{inv.am_remarks || inv.remarks}</div>
                              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={11} />
                                <span>{(inv.am_remarks_date || inv.remarks_date) ? formatDate(inv.am_remarks_date || inv.remarks_date) : 'Update'}</span>
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
                          <span className="badge badge-green" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#86efac', fontWeight: 700 }}>
                            🟢 Credit Note (Green Zone)
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="content-card" style={{ border: '1px dashed #cbd5e1', background: '#f8fafc' }}>
            <div className="card-header" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Briefcase size={18} color="var(--fc-navy-600)" />
                <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--fc-navy-800)' }}>
                  Direct Accounts Portfolio
                </h3>
              </div>
            </div>
            <div className="card-body" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--fc-navy-900)', fontWeight: 600 }}>
                No direct enterprise accounts currently assigned directly to {data.sales_head_name}.
              </p>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                All client invoices for this division are managed by assigned Account Managers below.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Account Managers Breakdown */}
      <div className="content-card">
        <div className="card-header">
          <h3>
            <Users size={18} color="var(--fc-navy-600)" />
            <span>Assigned Account Managers ({data.account_managers.length} Members)</span>
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Click on any Account Manager to view their client portfolio and pending bills
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account Manager</th>
                <th>Clients</th>
                <th>Invoices</th>
                <th>≤ 30 Days (Green)</th>
                <th>31 - 90 Days (Orange)</th>
                <th>&gt; 90 Days (Red)</th>
                <th>Credit Notes (Cr)</th>
                <th>Total Pending</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {/* Direct Accounts Row if present */}
              {data.direct_clients && data.direct_clients.length > 0 && (
                <tr style={{ background: '#fffbeb', borderLeft: '4px solid var(--fc-orange-500)' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--fc-orange-100)', color: 'var(--fc-orange-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                        ★
                      </div>
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--fc-orange-900)' }}>{data.sales_head_name} (Direct Accounts)</span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--fc-orange-700)' }}>Managed Directly without AM</div>
                      </div>
                    </div>
                  </td>
                  <td><strong>{data.direct_clients.length}</strong></td>
                  <td><strong>{data.direct_invoices.length}</strong></td>
                  <td style={{ color: 'var(--fc-green-dark)', fontWeight: 600 }}>
                    {formatCurrency(data.direct_green_amount)}
                  </td>
                  <td style={{ color: 'var(--fc-amber-dark)', fontWeight: 600 }}>
                    {formatCurrency(data.direct_orange_amount)}
                  </td>
                  <td style={{ color: 'var(--fc-red-dark)', fontWeight: 600 }}>
                    {formatCurrency(data.direct_red_amount)}
                  </td>
                  <td style={{ color: '#7c3aed', fontWeight: 600 }}>
                    {data.direct_credit_amount > 0 ? `-${formatCurrency(data.direct_credit_amount)}` : formatCurrency(0)}
                  </td>
                  <td style={{ fontWeight: 800, fontFamily: 'Outfit', color: 'var(--fc-orange-800)' }}>
                    {formatCurrency(data.direct_pending_amount)}
                  </td>
                  <td>
                    <button
                      className="btn-outline"
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', borderColor: 'var(--fc-orange-500)', color: 'var(--fc-orange-700)', background: '#fff' }}
                      onClick={() => {
                        const directEl = document.getElementById('direct-accounts-section');
                        if (directEl) directEl.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <span>View Direct</span>
                      <ArrowUpRight size={13} />
                    </button>
                  </td>
                </tr>
              )}
              {data.account_managers.map((am) => (
                <tr key={am.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--fc-navy-100)', color: 'var(--fc-navy-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem' }}>
                        {am.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span style={{ fontWeight: 600 }}>{am.name}</span>
                    </div>
                  </td>
                  <td>{am.client_count}</td>
                  <td>{am.invoice_count}</td>
                  <td style={{ color: 'var(--fc-green-dark)', fontWeight: 600 }}>
                    {formatCurrency(am.green_pending)}
                  </td>
                  <td style={{ color: 'var(--fc-amber-dark)', fontWeight: 600 }}>
                    {formatCurrency(am.orange_pending)}
                  </td>
                  <td style={{ color: 'var(--fc-red-dark)', fontWeight: 600 }}>
                    {formatCurrency(am.red_pending)}
                  </td>
                  <td style={{ color: '#7c3aed', fontWeight: 600 }}>
                    {am.credit_pending > 0 ? `-${formatCurrency(am.credit_pending)}` : formatCurrency(0)}
                  </td>
                  <td style={{ fontWeight: 800, fontFamily: 'Outfit', color: 'var(--fc-navy-900)' }}>
                    {formatCurrency(am.total_pending)}
                  </td>
                  <td>
                    <button
                      className="btn-outline"
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => onSelectAM(am.id || am.name)}
                    >
                      <span>Drill-down</span>
                      <ArrowUpRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Invoices Ledger */}
      <div className="content-card">
        <div className="card-header">
          <h3>
            <FileText size={18} color="var(--fc-navy-600)" />
            <span>Team Receivables Detail Ledger</span>
          </h3>

          <div className="filter-bar">
            <input
              type="text"
              placeholder="Search Invoice or Client..."
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <select
              className="search-input"
              value={filterAM}
              onChange={e => setFilterAM(e.target.value)}
            >
              <option value="ALL">All Account Managers & Direct</option>
              {data.direct_clients && data.direct_clients.length > 0 && (
                <option value="DIRECT">★ {data.sales_head_name} (Direct Accounts)</option>
              )}
              {data.account_managers.map(am => (
                <option key={am.name} value={am.id || am.name}>{am.name}</option>
              ))}
            </select>

            <select
              className="search-input"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="ALL">All Aging Buckets</option>
              <option value="GREEN">🟢 ≤ 30 Days</option>
              <option value="ORANGE">🟠 31 - 90 Days</option>
              <option value="RED">🔴 &gt; 90 Days</option>
              <option value="CREDIT">🟣 Credit Notes (Cr)</option>
              <option value="SETTLED">⚪ Settled / Paid</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice Number (PK)</th>
                <th>Client Name</th>
                <th>Account Manager</th>
                <th>Billing Date</th>
                <th>Days Overdue</th>
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
                <th>Status</th>
                <th className="sticky-col-right" style={{ textAlign: 'center' }}>Audit</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No team invoices match the filters.
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
                    <td>{inv.account_manager_name}</td>
                    <td>{formatDate(inv.invoice_date)}</td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: inv.amount_type === 'Cr' ? '#7c3aed' : inv.days_overdue > 90 ? 'var(--fc-red-dark)' : inv.days_overdue > 30 ? 'var(--fc-amber-dark)' : 'var(--fc-green-dark)'
                      }}>
                        {inv.days_overdue} days
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, fontFamily: 'Outfit' }}>
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
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{inv.am_remarks || inv.remarks}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={11} />
                              <span>{(inv.am_remarks_date || inv.remarks_date) ? formatDate(inv.am_remarks_date || inv.remarks_date) : 'Update'}</span>
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
                      {inv.status === 'SETTLED' ? (
                        <span className="badge badge-settled">✓ Settled</span>
                      ) : inv.amount_type === 'Cr' ? (
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

      {/* Unified Remarks Modal */}
      {activeRemarkInvoice && (
        <div className="modal-overlay" onClick={() => setActiveRemarkInvoice(null)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
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
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--fc-navy-900)' }}>
                    Invoice Status Remarks
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

            <form onSubmit={handleSaveRemarks}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-navy-900)', marginBottom: '0.4rem' }}>
                    <span>Progress / Payment Commitment Remark</span>
                    {activeRemarkInvoice.account_manager_name && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        AM: {activeRemarkInvoice.account_manager_name}
                      </span>
                    )}
                  </label>
                  <textarea
                    className="search-input"
                    rows={4}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem' }}
                    placeholder="e.g. Payment will be done October last / Client committed RTGS for next week..."
                    value={unifiedRemarkInput}
                    onChange={e => setUnifiedRemarkInput(e.target.value)}
                    autoFocus
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    💡 Updates are saved in real-time, visible across MD and AM dashboards, and logged to the audit history.
                  </div>
                  {(activeRemarkInvoice.am_remarks_date || activeRemarkInvoice.remarks_date) && (
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} />
                      <span>Last updated: {formatDate(activeRemarkInvoice.am_remarks_date || activeRemarkInvoice.remarks_date)} {(activeRemarkInvoice.am_remarks_by || activeRemarkInvoice.remarks_by) ? `by ${activeRemarkInvoice.am_remarks_by || activeRemarkInvoice.remarks_by}` : ''}</span>
                    </div>
                  )}
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
                    <span>Remark updated and logged to audit trail!</span>
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
        exportPrefix={data?.sales_head_name || "SalesHead"}
      />
    </div>
  );
}
