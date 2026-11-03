import React from 'react';
import { LayoutDashboard, FileText, Users, Menu, UploadCloud, ShieldCheck, LogOut } from 'lucide-react';

export default function MobileBottomNav({
  currentUser,
  currentSection,
  onSelectSection,
  onOpenMobileMenu
}) {
  return (
    <nav className="mobile-bottom-nav">
      <button
        type="button"
        className={`bottom-nav-item ${currentSection === 'DASHBOARD' ? 'active' : ''}`}
        onClick={() => onSelectSection('DASHBOARD')}
      >
        <LayoutDashboard size={20} className="bottom-nav-icon" />
        <span className="bottom-nav-label">Overview</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-item ${currentSection === 'LEDGER' ? 'active' : ''}`}
        onClick={() => onSelectSection('LEDGER')}
      >
        <FileText size={20} className="bottom-nav-icon" />
        <span className="bottom-nav-label">Ledger</span>
      </button>

      {(currentUser?.role === 'MD' || currentUser?.role === 'SALES_HEAD') && (
        <button
          type="button"
          className={`bottom-nav-item ${currentSection === 'TEAMS' ? 'active' : ''}`}
          onClick={() => onSelectSection('TEAMS')}
        >
          <Users size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">Teams</span>
        </button>
      )}

      <button
        type="button"
        className={`bottom-nav-item ${currentSection === 'MENU' ? 'active' : ''}`}
        onClick={onOpenMobileMenu}
      >
        <Menu size={20} className="bottom-nav-icon" />
        <span className="bottom-nav-label">More</span>
      </button>
    </nav>
  );
}
