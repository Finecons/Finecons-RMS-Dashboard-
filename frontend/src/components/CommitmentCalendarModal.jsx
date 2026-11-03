import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Download, X, Check } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { 
  MONTH_NAMES, 
  filterInvoicesByRemarkMonth, 
  exportCommitmentRemarksToCsv,
  parseRemarkCommitment 
} from '../utils/remarksFilter';

export default function CommitmentCalendarModal({
  isOpen,
  onClose,
  invoices = [],
  exportPrefix = "Finecons"
}) {
  const currentSystemYear = new Date().getFullYear();
  const currentSystemMonth = new Date().getMonth(); // 0-11

  const [selectedYear, setSelectedYear] = useState(currentSystemYear);
  const [selectedMonth, setSelectedMonth] = useState('ALL'); // 'ALL' or 'October', 'November', etc.

  // Pre-calculate commitments count per month for the selected year
  const monthCommitmentCounts = useMemo(() => {
    const counts = {};
    MONTH_NAMES.forEach(m => counts[m] = 0);
    let allCount = 0;

    for (const inv of invoices) {
      const remarkText = inv.am_remarks || inv.remarks || "";
      const remarkDate = inv.am_remarks_date || inv.remarks_date || null;
      const analysis = parseRemarkCommitment(remarkText, remarkDate);
      if (analysis.hasCommitment) {
        allCount++;
        if (analysis.targetYear === selectedYear && analysis.targetMonthName) {
          counts[analysis.targetMonthName] = (counts[analysis.targetMonthName] || 0) + 1;
        }
      }
    }
    return { counts, allCount };
  }, [invoices, selectedYear]);

  // Filter matching invoices based on selection
  const matchedInvoices = useMemo(() => {
    return filterInvoicesByRemarkMonth(invoices, selectedMonth);
  }, [invoices, selectedMonth]);

  const totalAmount = useMemo(() => {
    return matchedInvoices.reduce((sum, r) => {
      const amt = r.pending_amount || 0;
      return sum + (r.amount_type !== 'Cr' ? amt : -amt);
    }, 0);
  }, [matchedInvoices]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (matchedInvoices.length === 0) {
      alert(`No committed invoices found for ${selectedMonth === 'ALL' ? 'all months' : selectedMonth + ' ' + selectedYear}.`);
      return;
    }
    const filterLabel = selectedMonth === 'ALL' ? 'All Months' : `${selectedMonth} ${selectedYear}`;
    exportCommitmentRemarksToCsv(
      `${exportPrefix}_Remarks_Commitment_${selectedMonth}_${new Date().toISOString().split('T')[0]}.csv`,
      matchedInvoices,
      filterLabel
    );
    onClose();
  };

  const handleNativeMonthChange = (e) => {
    if (!e.target.value) return;
    const [yStr, mStr] = e.target.value.split('-');
    const y = parseInt(yStr, 10);
    const mIdx = parseInt(mStr, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      setSelectedYear(y);
      setSelectedMonth(MONTH_NAMES[mIdx]);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        style={{ maxWidth: '460px', padding: 0, overflow: 'hidden' }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '8px', 
              background: 'var(--fc-orange-50)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--fc-orange-600)'
            }}>
              <Calendar size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--fc-navy-900)', fontWeight: 700 }}>
                Filter by Calendar Month
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Select commitment month to export report
              </div>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: Clean Calendar UI */}
        <div style={{ padding: '1.25rem' }}>
          {/* Quick "All Months" Pill & Native Picker */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setSelectedMonth('ALL')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: selectedMonth === 'ALL' ? '2px solid var(--fc-navy-700)' : '1px solid #cbd5e1',
                background: selectedMonth === 'ALL' ? 'var(--fc-navy-800)' : '#ffffff',
                color: selectedMonth === 'ALL' ? '#ffffff' : 'var(--fc-navy-800)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              <Calendar size={13} />
              <span>All Committed Months ({monthCommitmentCounts.allCount})</span>
            </button>

            {/* Native OS Month Calendar Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="month"
                className="search-input"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem', width: 'auto' }}
                title="Or pick exact month from calendar"
                onChange={handleNativeMonthChange}
              />
            </div>
          </div>

          {/* Year Navigation Bar */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            background: '#f8fafc', 
            padding: '0.4rem 0.75rem', 
            borderRadius: '6px', 
            marginBottom: '0.75rem',
            border: '1px solid #e2e8f0'
          }}>
            <button
              type="button"
              onClick={() => setSelectedYear(prev => prev - 1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fc-navy-700)', padding: '3px', display: 'flex' }}
              title="Previous Year"
            >
              <ChevronLeft size={18} />
            </button>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--fc-navy-900)' }}>
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear(prev => prev + 1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fc-navy-700)', padding: '3px', display: 'flex' }}
              title="Next Year"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* 12 Month Calendar Grid (4 columns x 3 rows) */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '0.5rem', 
            marginBottom: '1.25rem' 
          }}>
            {MONTH_NAMES.map((mName, idx) => {
              const isSelected = selectedMonth === mName;
              const count = monthCommitmentCounts.counts[mName] || 0;
              const isCurrentMonth = selectedYear === currentSystemYear && idx === currentSystemMonth;

              return (
                <button
                  key={mName}
                  type="button"
                  onClick={() => setSelectedMonth(mName)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.55rem 0.25rem',
                    borderRadius: '6px',
                    border: isSelected 
                      ? '2px solid var(--fc-orange-500)' 
                      : isCurrentMonth 
                        ? '1px solid var(--fc-navy-400)' 
                        : '1px solid #e2e8f0',
                    background: isSelected 
                      ? 'var(--fc-orange-500)' 
                      : isCurrentMonth 
                        ? '#eff6ff' 
                        : count > 0 
                          ? '#ffffff' 
                          : '#fafafa',
                    color: isSelected 
                      ? '#ffffff' 
                      : isCurrentMonth 
                        ? 'var(--fc-navy-900)' 
                        : count > 0 
                          ? 'var(--fc-navy-900)' 
                          : '#94a3b8',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontWeight: isSelected || isCurrentMonth ? 700 : 600, fontSize: '0.82rem' }}>
                    {mName.substring(0, 3)}
                  </span>
                  {count > 0 ? (
                    <span style={{ 
                      fontSize: '0.68rem', 
                      marginTop: '2px', 
                      background: isSelected ? '#ffffff' : '#dbeafe', 
                      color: isSelected ? 'var(--fc-orange-700)' : '#1e40af', 
                      padding: '1px 5px', 
                      borderRadius: '9999px',
                      fontWeight: 700
                    }}>
                      {count} bills
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.65rem', marginTop: '2px', color: isSelected ? '#fed7aa' : '#cbd5e1' }}>
                      -
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Compact Summary Strip (No unwanted clutter) */}
          <div style={{ 
            background: '#f8fafc', 
            padding: '0.75rem 1rem', 
            borderRadius: '6px', 
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem'
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Target: </span>
              <strong style={{ color: 'var(--fc-navy-900)' }}>
                {selectedMonth === 'ALL' ? 'All Months' : `${selectedMonth} ${selectedYear}`}
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{matchedInvoices.length} Bills</span>
              <strong style={{ color: 'var(--fc-green-dark)' }}>{formatCurrency(totalAmount)}</strong>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '0.75rem', 
          padding: '0.85rem 1.25rem', 
          borderTop: '1px solid #e2e8f0',
          background: '#ffffff'
        }}>
          <button 
            type="button" 
            className="btn-outline" 
            onClick={onClose}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="btn-accent" 
            onClick={handleDownload}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              fontSize: '0.82rem', 
              padding: '0.4rem 1rem' 
            }}
          >
            <Download size={14} />
            <span>Download Report (CSV / Excel)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
