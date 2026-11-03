import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, FileText, CheckCircle2, AlertTriangle, 
  Clock, ShieldAlert, ArrowUpRight, Search, Download, Filter, 
  Eye, FileDown, Receipt, UserCheck, Edit3, MessageSquare, Lock, X, Check, FileSpreadsheet
} from 'lucide-react';
import { 
  formatCurrency, formatDate, exportToCsv, 
  groupInvoicesByAccountManager, exportConsolidatedReceivablesToCsv 
} from '../utils/formatters';
import { exportReceivablesToPdf } from '../utils/pdfExport';
import CommitmentCalendarModal from './CommitmentCalendarModal';

export default function MDDashboard({ 
  currentUser,
  onSelectSalesHead, 
  onSelectAM,
  onSelectInvoice,
  activeSection = 'DASHBOARD'
}) {
  const [data, setData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterSH, setFilterSH] = useState('ALL');

  // Unified Remarks Modal State
  const [activeRemarkInvoice, setActiveRemarkInvoice] = useState(null);
  const [unifiedRemarkInput, setUnifiedRemarkInput] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Commitment Calendar Modal State
  const [showCommitmentExportModal, setShowCommitmentExportModal] = useState(false);

  const isMD = currentUser?.role === 'MD';

  useEffect(() => {
    fetchDashboardData();
  }, [currentUser]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/md');
      const mdData = await res.json();
      setData(mdData);

      const roleParam = currentUser?.role ? `&user_role=${currentUser.role}` : '&user_role=MD';
      const invRes = await fetch(`/api/invoices?status=ALL${roleParam}`);
      const invData = await invRes.json();
      setInvoices(invData);
    } catch (err) {
      console.error('Failed to load MD dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p>Loading Finecons Company Receivables...</p>
      </div>
    );
  }

  // Filter invoices
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
    const matchesSH = filterSH === 'ALL' || String(inv.sales_head_id) === String(filterSH);

    return matchesSearch && matchesStatus && matchesSH;
  });

  // Group invoices by Account Manager in ascending alphabetical order (A to Z) with subtotals
  const groupedData = groupInvoicesByAccountManager(filteredInvoices);

  const handleExportCsv = () => {
    exportConsolidatedReceivablesToCsv(
      `Finecons_Consolidated_Receivables_${new Date().toISOString().split('T')[0]}.csv`,
      filteredInvoices,
      isMD
    );
  };

  const handleExportPdf = () => {
    exportReceivablesToPdf({
      title: "Company-Wide Receivables Audit Report",
      subtitle: "Consolidated Master Ledger • Finecons Private Limited",
      invoices: filteredInvoices,
      filterInfo: `Aging: ${filterStatus} | Division: ${filterSH === 'ALL' ? 'All Divisions' : filterSH} | Search: ${search || 'None'}`,
      includeMDRemarks: isMD,
      summaryMetrics: {
        totalPending: data.total_company_pending,
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
        updated_by: currentUser?.full_name || 'MD Admin',
        user_role: currentUser?.role || 'MD'
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

      // Update in local invoices array
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

  const totalCols = 9;

  return (
    <div className="dashboard-content-area">
      {/* Executive Welcome & Role Badge */}
      <div className="profile-banner">
        <div className="profile-info">
          <div className="profile-avatar">MD</div>
          <div className="profile-meta">
            <h2>Managing Director Executive Portal</h2>
            <div className="profile-role-tag">
              <Building2 size={14} />
              <span>Company-Wide Consolidated View • Finecons Private Limited</span>
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
          title="Click to view all company receivables"
        >
          <div className="kpi-header">
            <span className="kpi-title">Total Receivables</span>
            <div className="kpi-icon"><Building2 size={20} /></div>
          </div>
          <div className="kpi-amount">{formatCurrency(data.total_company_pending)}</div>
          <div className="kpi-sub">
            <span>{data.total_invoices_count} pending invoices across {data.total_clients_count} clients</span>
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
            <span>{data.green_count} fresh invoices</span>
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
            <span>{data.orange_count} warning invoices</span>
            {filterStatus === 'ORANGE' && <span className="kpi-filter-tag" style={{ background: '#fef3c7', color: '#b45309' }}>● Filter Active</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-red is-clickable ${filterStatus === 'RED' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'RED' ? 'ALL' : 'RED')}
          title="Click to filter Critical > 90 Days"
        >
          <div className="kpi-header">
            <span className="kpi-title">Delayed &gt; 90 Days</span>
            <div className="kpi-icon"><ShieldAlert size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: 'var(--fc-red-dark)' }}>
            {formatCurrency(data.red_amount)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-red">Critical</span>
            <span>{data.red_count} overdue invoices</span>
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
            <span className="badge badge-credit">Adjustments</span>
            <span>{data.credit_count || 0} credit notes</span>
            {filterStatus === 'CREDIT' && <span className="kpi-filter-tag" style={{ background: '#f3e8ff', color: '#6b21a8' }}>● Filter Active</span>}
          </div>
        </div>

        <div 
          className={`kpi-card kpi-settled is-clickable ${filterStatus === 'SETTLED' ? 'is-active' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'SETTLED' ? 'ALL' : 'SETTLED')}
          title="Click to filter Auto-Settled / Paid"
        >
          <div className="kpi-header">
            <span className="kpi-title">Auto-Settled / Paid</span>
            <div className="kpi-icon"><CheckCircle2 size={20} /></div>
          </div>
          <div className="kpi-amount" style={{ color: '#475569' }}>
            {formatCurrency(data.settled_amount)}
          </div>
          <div className="kpi-sub">
            <span className="badge badge-settled">Cleared</span>
            <span>{data.settled_count} settled bills</span>
            {filterStatus === 'SETTLED' && <span className="kpi-filter-tag" style={{ background: '#f1f5f9', color: '#475569' }}>● Filter Active</span>}
          </div>
        </div>
      </div>

      {/* Segregation by Sales Heads */}
      <div className="content-card">
        <div className="card-header">
          <h3>
            <Users size={18} color="var(--fc-navy-600)" />
            <span>Sales Head Segregation ({data.sales_heads?.length || 0} Divisions)</span>
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {data.sales_heads?.length > 0 
              ? 'Click on any Sales Head card to inspect their Account Managers & clients' 
              : 'Add Sales Heads in Master Admin to establish division hierarchies'}
          </span>
        </div>
        <div className="card-body">
          {!data.sales_heads || data.sales_heads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
              <Users size={32} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
              <p style={{ fontWeight: 600, color: 'var(--fc-navy-900)' }}>No Sales Heads or Divisions created yet</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Use <strong>Master Admin</strong> from the sidebar to create Sales Heads, Account Managers, and assign team structures.
              </p>
            </div>
          ) : (
            <div className="sh-grid">
              {data.sales_heads.map(sh => (
              <div key={sh.id} className="sh-card">
                <div>
                  <div className="sh-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className="sh-avatar">
                        {sh.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <h4 style={{ fontSize: '1.05rem', color: 'var(--fc-navy-900)' }}>{sh.name}</h4>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sh.designation}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ margin: '0.5rem 0' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Pending Receivables</div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--fc-navy-800)' }}>
                      {formatCurrency(sh.total_pending)}
                    </div>
                  </div>

                  {/* Aging bar */}
                  <div style={{ margin: '0.75rem 0' }}>
                    <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#e2e8f0' }}>
                      <div 
                        style={{ 
                          width: `${sh.total_pending ? (sh.green_pending / sh.total_pending) * 100 : 0}%`, 
                          background: 'var(--fc-green)' 
                        }} 
                        title={`<= 30d: ${formatCurrency(sh.green_pending)}`} 
                      />
                      <div 
                        style={{ 
                          width: `${sh.total_pending ? (sh.orange_pending / sh.total_pending) * 100 : 0}%`, 
                          background: 'var(--fc-amber)' 
                        }} 
                        title={`31-90d: ${formatCurrency(sh.orange_pending)}`} 
                      />
                      <div 
                        style={{ 
                          width: `${sh.total_pending ? (sh.red_pending / sh.total_pending) * 100 : 0}%`, 
                          background: 'var(--fc-red)' 
                        }} 
                        title={`> 90d: ${formatCurrency(sh.red_pending)}`} 
                      />
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="sh-metrics">
                    <div className="sh-metric-item">
                      <div className="val" style={{ color: 'var(--fc-green-dark)' }}>{formatCurrency(sh.green_pending)}</div>
                      <div className="lbl">≤ 30 Days</div>
                    </div>
                    <div className="sh-metric-item">
                      <div className="val" style={{ color: 'var(--fc-amber-dark)' }}>{formatCurrency(sh.orange_pending)}</div>
                      <div className="lbl">31-90 Days</div>
                    </div>
                    <div className="sh-metric-item">
                      <div className="val" style={{ color: 'var(--fc-red-dark)' }}>{formatCurrency(sh.red_pending)}</div>
                      <div className="lbl">&gt; 90 Days</div>
                    </div>
                    <div className="sh-metric-item">
                      <div className="val" style={{ color: '#7c3aed' }}>{sh.credit_pending > 0 ? `-${formatCurrency(sh.credit_pending)}` : formatCurrency(0)}</div>
                      <div className="lbl">Credit Notes</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {sh.am_count} AMs {sh.direct_clients_count > 0 ? `• ${sh.direct_clients_count} Direct Clients` : ''} • {sh.invoice_count} Invoices
                  </span>
                  <button 
                    className="btn-outline" 
                    onClick={() => onSelectSalesHead(sh.id)}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    <span>View Team</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Transparent Detail Ledger (Company-Wide) */}
      <div className="content-card">
        <div className="card-header">
          <h3>
            <FileText size={18} color="var(--fc-navy-600)" />
            <span>Company-Wide Transparent Receivables Ledger</span>
          </h3>

          {/* Filters */}
          <div className="filter-bar">
            <div style={{ position: 'relative' }}>
              <input 
                type="text"
                placeholder="Search Invoice (PK) or Client..."
                className="search-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <select 
              className="search-input" 
              style={{ minWidth: '150px' }}
              value={filterSH} 
              onChange={e => setFilterSH(e.target.value)}
            >
              <option value="ALL">All Sales Heads</option>
              {data.sales_heads.map(sh => (
                <option key={sh.id} value={sh.id}>{sh.name}</option>
              ))}
            </select>

            <select 
              className="search-input" 
              style={{ minWidth: '150px' }}
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="ALL">All Aging Buckets</option>
              <option value="GREEN">🟢 Delayed ≤ 30 Days</option>
              <option value="ORANGE">🟠 Delayed 31-90 Days</option>
              <option value="RED">🔴 Critical &gt; 90 Days</option>
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
                <th>Billing Date</th>
                <th>Client (Party's Name)</th>
                <th>Account Manager</th>
                <th>Days Overdue</th>
                <th style={{ textAlign: 'right' }}>Pending Amount</th>
                <th>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                    <span>Remarks</span>
                    <button 
                      type="button" 
                      onClick={() => setShowCommitmentExportModal(true)}
                      title="Filter & Export Remarks by Calendar Month"
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
                <th className="sticky-col-right" style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedData.groups.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    {invoices.length === 0 
                      ? 'No invoices uploaded yet. Upload a weekly Tally Excel report to populate receivables.' 
                      : 'No invoices matching the selected filters.'}
                  </td>
                </tr>
              ) : (
                <>
                  {groupedData.groups.map((grp) => (
                    <React.Fragment key={`group-${grp.accountManagerName}`}>
                      {/* 1. Account Manager Header Row (Alphabetical Ascending Order) */}
                      <tr className="am-group-header-row">
                        <td colSpan={totalCols}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <UserCheck size={16} />
                              <span style={{ fontSize: '0.88rem', letterSpacing: '0.02em' }}>
                                ACCOUNT MANAGER: <strong>{grp.accountManagerName.toUpperCase()}</strong> ({grp.invoiceCount} Invoices)
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.78rem' }}>
                              <span>Total Cr: <strong style={{ color: '#7c3aed' }}>{formatCurrency(grp.totalCr)}</strong></span>
                              <span>Ending Pending (Dr): <strong style={{ color: 'var(--fc-navy-900)' }}>{formatCurrency(grp.endingPending)}</strong></span>
                              <span>Net Outstanding: <strong style={{ color: 'var(--fc-green-dark)' }}>{formatCurrency(grp.netPending)}</strong></span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* 2. Invoices under this Account Manager */}
                      {grp.invoices.map((inv) => {
                        const isCr = inv.amount_type === 'Cr';
                        return (
                          <tr key={inv.invoice_number} className={isCr ? 'credit-row' : ''}>
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
                            <td style={{ fontWeight: 600, maxWidth: '240px', wordBreak: 'break-word' }}>{inv.party_name}</td>
                            <td>
                              <span 
                                style={{ color: 'var(--fc-navy-600)', cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={() => inv.account_manager_id && onSelectAM(inv.account_manager_id)}
                              >
                                {grp.accountManagerName}
                              </span>
                            </td>
                            <td>
                              <span style={{ 
                                fontWeight: 700, 
                                color: isCr ? '#7c3aed' : inv.days_overdue > 90 ? 'var(--fc-red-dark)' : inv.days_overdue > 30 ? 'var(--fc-amber-dark)' : 'var(--fc-green-dark)' 
                              }}>
                                {inv.days_overdue} days
                              </span>
                            </td>
                            <td className="currency-cell" style={{ textAlign: 'right' }}>
                              {isCr ? (
                                <span className="particular-cr" style={{ color: '#7c3aed', fontWeight: 700 }}>
                                  (-) {formatCurrency(inv.pending_amount)} <span style={{ fontSize: '0.7rem' }}>(Cr)</span>
                                </span>
                              ) : (
                                <span style={{ fontWeight: 700, color: 'var(--fc-navy-900)' }}>
                                  {formatCurrency(inv.pending_amount)}
                                </span>
                              )}
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
                              ) : isCr ? (
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
                                title="Audit invoice history"
                              >
                                <Eye size={13} />
                                <span>Audit</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* 3. Account Manager Subtotal Row */}
                      <tr className="am-subtotal-row">
                        <td colSpan="4">
                          <strong>SUBTOTAL — {grp.accountManagerName.toUpperCase()}</strong> ({grp.invoiceCount} Bills)
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>-</td>
                        <td className="currency-cell" style={{ textAlign: 'right' }}>
                          <div>
                            <span style={{ color: 'var(--fc-navy-900)', fontWeight: 800 }}>{formatCurrency(grp.endingPending)}</span>
                            {grp.totalCr > 0 && <div style={{ fontSize: '0.7rem', color: '#7c3aed' }}>Cr: -{formatCurrency(grp.totalCr)}</div>}
                          </div>
                        </td>
                        <td colSpan={3}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-green-dark)' }}>
                            Net: {formatCurrency(grp.netPending)}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}

                  {/* 4. Company-Wide Grand Total Row */}
                  <tr className="grand-total-row">
                    <td colSpan="4">
                      COMPANY-WIDE GRAND TOTAL ({groupedData.grandTotalCount} Invoices across {groupedData.groups.length} Account Managers)
                    </td>
                    <td style={{ textAlign: 'center', color: '#cbd5e1' }}>-</td>
                    <td className="currency-cell" style={{ textAlign: 'right', color: '#ffffff' }}>
                      <div>{formatCurrency(groupedData.grandEndingPending)}</div>
                      {groupedData.grandTotalCr > 0 && <div style={{ color: '#c4b5fd', fontSize: '0.7rem' }}>Cr: -{formatCurrency(groupedData.grandTotalCr)}</div>}
                    </td>
                    <td colSpan={3} style={{ color: '#86efac' }}>
                      Company Net: {formatCurrency(groupedData.grandNetPending)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Unified Remarks Modal */}
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
                    placeholder="e.g. Payment will be done October last / Spoke with client finance; RTGS committed by Friday..."
                    value={unifiedRemarkInput}
                    onChange={e => setUnifiedRemarkInput(e.target.value)}
                    autoFocus
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    💡 Both AM and MD can view and update this remark. Any edits are tracked with author name, role, and timestamp in the audit history.
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

      {/* 6. Calendar Month Commitment Filter & Export Modal */}
      <CommitmentCalendarModal
        isOpen={showCommitmentExportModal}
        onClose={() => setShowCommitmentExportModal(false)}
        invoices={filteredInvoices}
        exportPrefix="Finecons_MD"
      />
    </div>
  );
}