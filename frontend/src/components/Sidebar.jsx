import React from 'react';
import { 
  LayoutDashboard, FileText, Users, UploadCloud, 
  ShieldCheck, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react';

export default function Sidebar({
  currentUser,
  currentSection,
  onSelectSection,
  onLogout,
  collapsed,
  onToggleCollapse
}) {
  const getRoleDisplayName = (role) => {
    switch (role) {
      case 'MD': return 'Managing Director';
      case 'SALES_HEAD': return 'Sales Head';
      case 'ACCOUNT_MANAGER': return 'Account Manager';
      case 'BILLING': return 'Billing Operations';
      default: return role;
    }
  };

  const getInitials = (name) => {
    if (!name) return 'FC';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <aside className={`zoho-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header with Brand & Collapse Trigger */}
      <div className="sidebar-brand-header">
        <div className="sidebar-logo-group">
          <img src="/finecons_logo.png" alt="Finecons" className="sidebar-logo-img" />
          {!collapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-company">FINECONS</span>
              <span className="sidebar-app-name">RMS Receivables</span>
            </div>
          )}
        </div>
        <button 
          type="button" 
          className="sidebar-collapse-btn" 
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Sections */}
      <nav className="sidebar-nav-container">
        {/* Section 1: Receivables Management */}
        <div className="nav-group">
          {!collapsed && <div className="nav-group-title">RECEIVABLES</div>}
          
          <button
            type="button"
            className={`nav-item ${currentSection === 'DASHBOARD' ? 'active' : ''}`}
            onClick={() => onSelectSection('DASHBOARD')}
            title="Dashboard Overview"
          >
            <LayoutDashboard size={18} className="nav-icon" />
            {!collapsed && <span>Overview</span>}
          </button>

          <button
            type="button"
            className={`nav-item ${currentSection === 'LEDGER' ? 'active' : ''}`}
            onClick={() => onSelectSection('LEDGER')}
            title="Invoices Ledger"
          >
            <FileText size={18} className="nav-icon" />
            {!collapsed && <span>Invoices Ledger</span>}
          </button>
        </div>

        {/* Section 2: Team Segregation (visible to MD) */}
        {currentUser?.role === 'MD' && (
          <div className="nav-group">
            {!collapsed && <div className="nav-group-title">TEAMS</div>}
            
            <button
              type="button"
              className={`nav-item ${currentSection === 'TEAMS' ? 'active' : ''}`}
              onClick={() => onSelectSection('TEAMS')}
              title="Sales Divisions"
            >
              <Users size={18} className="nav-icon" />
              {!collapsed && <span>Sales Divisions</span>}
            </button>
          </div>
        )}

        {/* Section 3: Operations & Admin */}
        <div className="nav-group">
          {!collapsed && <div className="nav-group-title">OPERATIONS</div>}

          {(currentUser?.role === 'BILLING' || currentUser?.role === 'MD') && (
            <button
              type="button"
              className={`nav-item ${currentSection === 'UPLOAD' ? 'active' : ''}`}
              onClick={() => onSelectSection('UPLOAD')}
              title="Upload Tally Excel"
            >
              <UploadCloud size={18} className="nav-icon" />
              {!collapsed && <span>Tally Upload</span>}
            </button>
          )}

          {currentUser?.role === 'MD' && (
            <button
              type="button"
              className={`nav-item ${currentSection === 'ADMIN' ? 'active' : ''}`}
              onClick={() => onSelectSection('ADMIN')}
              title="Master Admin Panel"
            >
              <ShieldCheck size={18} className="nav-icon" />
              {!collapsed && <span>Master Admin</span>}
            </button>
          )}
        </div>
      </nav>

      {/* Footer User Profile Capsule */}
      <div className="sidebar-footer-profile">
        <div className="profile-capsule-inner">
          <div className="user-avatar-circle" title={currentUser?.full_name}>
            {getInitials(currentUser?.full_name)}
          </div>
          {!collapsed && (
            <div className="user-info-text">
              <span className="user-display-name">{currentUser?.full_name || currentUser?.username}</span>
              <span className="user-role-label">{getRoleDisplayName(currentUser?.role)}</span>
            </div>
          )}
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={onLogout}
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
