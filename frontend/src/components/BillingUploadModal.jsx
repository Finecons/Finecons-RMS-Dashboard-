import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, X, FileSpreadsheet, CheckCircle, AlertCircle, 
  Download, ArrowRight, Sparkles, RefreshCw, Layers, Trash2, Plus, 
  Check, Clock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { formatCurrency } from '../utils/formatters';

export default function BillingUploadModal({ 
  isOpen, 
  onClose, 
  allUsers, 
  onUploadSuccess 
}) {
  const [files, setFiles] = useState([]);
  const [selectedAM, setSelectedAM] = useState('');
  const [asOfDate, setAsOfDate] = useState('2026-10-23');
  const [uploading, setUploading] = useState(false);
  const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0, currentFileName: '' });
  const [fileProgress, setFileProgress] = useState({});
  const [summaryResult, setSummaryResult] = useState(null);
  const [error, setError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [amList, setAmList] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (allUsers && allUsers.length > 0) {
      setAmList(allUsers.filter(u => u.role === 'ACCOUNT_MANAGER'));
    } else {
      fetch('/api/admin/users')
        .then(res => res.json())
        .then(users => {
          if (Array.isArray(users)) {
            setAmList(users.filter(u => u.role === 'ACCOUNT_MANAGER'));
          }
        })
        .catch(() => {});
    }
  }, [allUsers]);

  if (!isOpen) return null;

  const addValidFiles = (newFileList) => {
    const valid = Array.from(newFileList).filter(f => {
      const name = (f.name || '').toLowerCase();
      return name.endsWith('.xlsx') || name.endsWith('.xls');
    });

    if (valid.length === 0) {
      setError("Please select valid Excel files (.xlsx or .xls).");
      return;
    }

    setFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}-${f.size}`));
      const nonDuplicates = valid.filter(f => !existingKeys.has(`${f.name}-${f.size}`));
      return [...prev, ...nonDuplicates];
    });
    setError(null);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addValidFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (fileProgress[index]) {
      const updated = { ...fileProgress };
      delete updated[index];
      setFileProgress(updated);
    }
  };

  const handleClearAll = () => {
    setFiles([]);
    setFileProgress({});
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      setError("Please select at least one Tally Excel file to upload.");
      return;
    }

    setUploading(true);
    setError(null);
    setSummaryResult(null);

    // Initial progress state
    const initialMap = {};
    files.forEach((f, idx) => {
      initialMap[idx] = { status: 'pending', name: f.name, size: f.size };
    });
    setFileProgress(initialMap);

    const successfulUploads = [];
    const failedUploads = [];

    let totalNew = 0;
    let totalUpdated = 0;
    let totalSettled = 0;
    let totalInvoices = 0;
    let totalPending = 0;

    for (let i = 0; i < files.length; i++) {
      const curFile = files[i];
      setCurrentProgress({
        current: i + 1,
        total: files.length,
        currentFileName: curFile.name,
      });

      setFileProgress(prev => ({
        ...prev,
        [i]: { ...prev[i], status: 'uploading' }
      }));

      const formData = new FormData();
      formData.append("file", curFile);
      formData.append("uploaded_by", "anand_billing");
      if (files.length === 1 && selectedAM) {
        formData.append("override_am", selectedAM);
      }
      if (asOfDate) {
        formData.append("as_of_date_str", asOfDate);
      }

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(text || "Server error occurred during upload.");
        }

        if (!res.ok) {
          throw new Error(data.detail || `Upload failed for ${curFile.name}`);
        }

        totalNew += (data.new_invoices || 0);
        totalUpdated += (data.updated_invoices || 0);
        totalSettled += (data.settled_invoices || 0);
        totalInvoices += (data.total_invoices || 0);
        totalPending += (data.total_pending_amount || 0);

        successfulUploads.push({
          file: curFile,
          data
        });

        setFileProgress(prev => ({
          ...prev,
          [i]: { 
            ...prev[i], 
            status: 'success', 
            data,
            amName: data.account_manager_name
          }
        }));
      } catch (err) {
        failedUploads.push({
          file: curFile,
          error: err.message
        });

        setFileProgress(prev => ({
          ...prev,
          [i]: { 
            ...prev[i], 
            status: 'error', 
            error: err.message 
          }
        }));
      }
    }

    setUploading(false);

    const summary = {
      totalFiles: files.length,
      successCount: successfulUploads.length,
      failureCount: failedUploads.length,
      totalNew,
      totalUpdated,
      totalSettled,
      totalInvoices,
      totalPending,
      successfulUploads,
      failedUploads
    };

    setSummaryResult(summary);

    if (successfulUploads.length > 0) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      if (onUploadSuccess) {
        onUploadSuccess(summary);
      }
    }
  };

  const handleDownloadSample = (scenario) => {
    window.open(`/api/samples/generate-test-excel?scenario=${scenario}`, '_blank');
  };

  const handleResetModal = () => {
    setFiles([]);
    setFileProgress({});
    setSummaryResult(null);
    setError(null);
    onClose();
  };

  const percentComplete = currentProgress.total > 0 
    ? Math.round((currentProgress.current / currentProgress.total) * 100) 
    : 0;

  return (
    <div className="modal-overlay" onClick={uploading ? undefined : onClose}>
      <div className="modal-content" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileSpreadsheet size={22} color="var(--fc-orange-600)" />
            <div>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Weekly Tally Excel Upload & Sync</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Finecons Receivables Management System</div>
            </div>
          </div>
          {!uploading && (
            <button 
              onClick={handleResetModal}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {/* Instructions Alert */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#334155' }}>
            <strong>How Weekly Reconciliation Works:</strong>
            <ul style={{ paddingLeft: '1.2rem', marginTop: '0.35rem', lineHeight: '1.4' }}>
              <li><strong>Invoice Ref. No.</strong> is strictly the <strong>Primary Key</strong>.</li>
              <li>Existing invoices update their pending balances, aging days, and Cr/Dr badges in-place.</li>
              <li><strong>Multi-File Upload:</strong> You can select and sync multiple AM Excel sheets at once.</li>
            </ul>
          </div>

          {/* Quick Demo Test Buttons */}
          {!summaryResult && !uploading && (
            <div style={{ background: 'var(--fc-navy-50)', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-navy-800)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={14} color="var(--fc-orange-600)" />
                <span>Instant Test Generator (Exact Tally Format):</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className="btn-outline" 
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                  onClick={() => handleDownloadSample('week1')}
                >
                  <Download size={13} />
                  <span>Download Week 1 (Saravanan Baseline)</span>
                </button>
                <button 
                  type="button" 
                  className="btn-outline" 
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem', borderColor: 'var(--fc-orange-600)', color: 'var(--fc-orange-700)' }}
                  onClick={() => handleDownloadSample('week2')}
                >
                  <Download size={13} />
                  <span>Download Week 2 (Clears 1475 as Paid + Adds New)</span>
                </button>
              </div>
            </div>
          )}

          {/* RESULT SUMMARY VIEW */}
          {summaryResult ? (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--fc-green-light)', color: 'var(--fc-green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
                <CheckCircle size={32} />
              </div>
              <h4 style={{ fontSize: '1.25rem', color: 'var(--fc-navy-900)', marginBottom: '0.35rem' }}>
                Batch Reconciliation Complete!
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Successfully processed <strong>{summaryResult.successCount} of {summaryResult.totalFiles}</strong> Excel files.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem', marginBottom: '1.25rem', textAlign: 'center' }}>
                <div style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--fc-navy-800)' }}>
                    {summaryResult.successCount} / {summaryResult.totalFiles}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Files Processed</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--fc-green-dark)' }}>
                    +{summaryResult.totalNew}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>New Invoices</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--fc-navy-700)' }}>
                    {summaryResult.totalUpdated}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Updated Balances</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--fc-orange-600)' }}>
                    {summaryResult.totalSettled}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Auto-Paid / Cleared</div>
                </div>
              </div>

              {/* Per-file details table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '1.5rem', textAlign: 'left' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Account Manager</th>
                      <th>Invoices</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryResult.successfulUploads.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: 'var(--fc-navy-900)' }}>
                          📄 {item.file.name}
                        </td>
                        <td>
                          <span className="badge badge-settled">{item.data.account_manager_name}</span>
                        </td>
                        <td>
                          {item.data.total_invoices} invs (+{item.data.new_invoices} new, {item.data.updated_invoices} upd)
                        </td>
                        <td>
                          <span className="badge badge-green">✓ Synced</span>
                        </td>
                      </tr>
                    ))}
                    {summaryResult.failedUploads.map((item, idx) => (
                      <tr key={`fail-${idx}`}>
                        <td style={{ fontWeight: 600, color: 'var(--fc-red-dark)' }}>
                          ❌ {item.file.name}
                        </td>
                        <td colSpan="2" style={{ color: 'var(--fc-red-dark)', fontSize: '0.75rem' }}>
                          {item.error}
                        </td>
                        <td>
                          <span className="badge badge-red">Failed</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button 
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleResetModal}
              >
                <span>Done & View Updated Dashboard</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form onSubmit={handleUpload}>
              {/* Hidden multi-file input */}
              <input 
                ref={fileInputRef}
                id="file-input-tally"
                type="file" 
                multiple
                accept=".xlsx, .xls, .XLSX, .XLS, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    addValidFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />

              {/* Progress Bar during uploading */}
              {uploading && (
                <div style={{ background: '#f8fafc', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--fc-navy-800)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Reconciling file {currentProgress.current} of {currentProgress.total}:</span>
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--fc-navy-700)' }}>{percentComplete}%</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentProgress.currentFileName}
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${percentComplete}%`, 
                        height: '100%', 
                        background: 'linear-gradient(90deg, var(--fc-navy-600), var(--fc-orange-600))', 
                        transition: 'width 0.3s ease' 
                      }} 
                    />
                  </div>
                </div>
              )}

              {/* Multi-File List if files are selected */}
              {files.length > 0 ? (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fc-navy-900)' }}>
                      Selected Files ({files.length}):
                    </div>
                    {!uploading && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        >
                          <Plus size={13} />
                          <span>Add More</span>
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--fc-red-dark)' }}
                          onClick={handleClearAll}
                        >
                          <Trash2 size={13} />
                          <span>Clear All</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Scrollable File List */}
                  <div style={{ 
                    maxHeight: '190px', 
                    overflowY: 'auto', 
                    border: '1px solid #cbd5e1', 
                    borderRadius: 'var(--radius-md)', 
                    background: '#fff' 
                  }}>
                    {files.map((f, idx) => {
                      const prog = fileProgress[idx] || {};
                      return (
                        <div 
                          key={`${f.name}-${idx}`}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '0.55rem 0.85rem', 
                            borderBottom: idx === files.length - 1 ? 'none' : '1px solid #f1f5f9',
                            background: prog.status === 'uploading' ? '#eff6ff' : prog.status === 'success' ? '#f0fdf4' : prog.status === 'error' ? '#fef2f2' : '#fff'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flex: 1 }}>
                            <FileSpreadsheet size={16} color="var(--fc-navy-600)" style={{ flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fc-navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {f.name}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {(f.size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                            {prog.status === 'uploading' && (
                              <span className="badge" style={{ background: '#dbeafe', color: '#1e40af', fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}>
                                <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                <span>Syncing...</span>
                              </span>
                            )}
                            {prog.status === 'success' && (
                              <span className="badge badge-green" style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}>
                                <Check size={11} />
                                <span>{prog.amName || 'Done'} ({prog.data?.total_invoices || 0})</span>
                              </span>
                            )}
                            {prog.status === 'error' && (
                              <span className="badge badge-red" style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}>
                                ❌ Error
                              </span>
                            )}
                            {!uploading && (
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(idx)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                                title="Remove file"
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Empty Drag & Drop Zone */
                <div 
                  className={`upload-dropzone ${isDragOver ? 'drag-active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  style={{ marginBottom: '1rem' }}
                >
                  <UploadCloud size={44} color="var(--fc-navy-600)" style={{ margin: '0 auto 0.75rem' }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--fc-navy-800)', fontSize: '0.95rem' }}>
                      Drag and drop your Tally Excel sheets here
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Supports multiple files at once (.xlsx, .xls) — or click to browse
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Configuration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fc-navy-900)', marginBottom: '0.35rem' }}>
                    {files.length > 1 ? "Account Manager Detection:" : "Target Account Manager:"}
                  </label>
                  {files.length > 1 ? (
                    <div style={{ 
                      fontSize: '0.78rem', 
                      background: '#f8fafc', 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '8px', 
                      padding: '0.5rem 0.75rem', 
                      color: 'var(--fc-navy-800)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.4rem' 
                    }}>
                      <Layers size={14} color="var(--fc-orange-600)" />
                      <span>Auto-matched per file from <strong>Group: Name</strong></span>
                    </div>
                  ) : (
                    <select 
                      className="search-input"
                      style={{ width: '100%' }}
                      value={selectedAM}
                      onChange={e => setSelectedAM(e.target.value)}
                    >
                      <option value="">Auto-detect from sheet (Group: Name)</option>
                      {amList.map(u => (
                        <option key={u.id} value={u.full_name}>{u.full_name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fc-navy-900)', marginBottom: '0.35rem' }}>
                    As of Date (for Aging calculation):
                  </label>
                  <input 
                    type="date"
                    className="search-input"
                    style={{ width: '100%' }}
                    value={asOfDate}
                    onChange={e => setAsOfDate(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--fc-red-light)', border: '1px solid var(--fc-red-border)', color: 'var(--fc-red-dark)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginTop: '1rem', fontSize: '0.8rem' }}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" className="btn-outline" onClick={handleResetModal} disabled={uploading}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-accent" 
                  disabled={uploading || files.length === 0}
                  style={{ opacity: (uploading || files.length === 0) ? 0.6 : 1 }}
                >
                  {uploading ? (
                    <>
                      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Reconciling ({currentProgress.current}/{currentProgress.total})...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={16} />
                      <span>
                        {files.length > 1 
                          ? `Process & Sync All ${files.length} Files` 
                          : files.length === 1 
                            ? "Process & Sync Invoices" 
                            : "Select Files to Upload"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
