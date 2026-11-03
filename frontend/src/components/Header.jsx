import React from 'react';
import { 
  Building2, Briefcase, UserCheck, FileSpreadsheet, Shield, 
  LogOut, UploadCloud, FileDown
} from 'lucide-react';

export default function Header({ 
  currentUser, 
  currentSectionTitle = "Company Receivables Overview",
  onOpenUpload, 
  onExportPdf,
  onLogout,
  onOpenMobileMenu 
}) {
  const getRoleIcon = (role) => {
    switch (role) {
      case 'MD': return <Building2 size={15} color="var(--fc-navy-700)" />;
      case 'SALES_HEAD': return <Briefcase size={15} color="var(--fc-navy-700)" />;
      case 'ACCOUNT_MANAGER': return <UserCheck size={15} color="var(--fc-navy-700)" />;
      case 'BILLING': return <FileSpreadsheet size={15} color="var(--fc-navy-700)" />;
      default: return <Shield size={15} />;
    }
  };

  const getInitials = (name) => {
    if (!name) return 'FC';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="zoho-header">
      <div className="header-inner">
        {/* Mobile-Only Header Brand */}
        <div className="mobile-brand-bar">
          <img src="/finecons_logo.png" alt="Finecons" className="mobile-logo-img" />
          <div className="mobile-brand-titles">
            <span className="mobile-company-title">FINECONS</span>
            <span className="mobile-app-subtitle">RMS Receivables</span>
          </div>
        </div>

        {/* Desktop Breadcrumb / View Context */}
        <div className="desktop-view-title hide-on-mobile">
          <h2 className="header-view-heading">{currentSectionTitle}</h2>
          <span className="header-view-badge">Finecons Private Limited</span>
        </div>

        {/* Header Right Action Elements */}
        <div className="header-actions">
          {/* Quick PDF Export if available */}
          {onExportPdf && (
            <button 
              type="button"
              className="btn-header-action btn-pdf-export" 
              onClick={onExportPdf}
              title="Download Finecons PDF Receivables Report"
            >
              <FileDown size={16} />
              <span className="hide-on-mobile">Export PDF</span>
            </button>
          )}

          {/* Quick Upload Button (for Billing & MD) */}
          {(currentUser?.role === 'BILLING' || currentUser?.role === 'MD') && onOpenUpload && (
            <button 
              type="button"
              className="btn-accent btn-header-action hide-on-mobile" 
              onClick={onOpenUpload}
              title="Upload weekly Tally Excel sheet"
            >
              <UploadCloud size={16} />
              <span>Upload Excel</span>
            </button>
          )}

          {/* Mobile User Initial Avatar / Menu Trigger */}
          <button 
            type="button" 
            className="mobile-avatar-btn show-on-mobile"
            onClick={onOpenMobileMenu}
            title="Open Account Menu"
          >
            {getInitials(currentUser?.full_name)}
          </button>

          {/* Desktop User Capsule */}
          <div className="user-capsule hide-on-mobile">
            <div className="user-avatar-small">
              {getInitials(currentUser?.full_name)}
            </div>
            <div className="user-details">
              <div className="user-name">{currentUser?.full_name || currentUser?.username}</div>
              <div className="user-role-badge">
                {getRoleIcon(currentUser?.role)}
                <span>{currentUser?.role?.replace('_', ' ')}</span>
              </div>
            </div>
            <button 
              type="button"
              className="logout-icon-btn" 
              onClick={onLogout}
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
