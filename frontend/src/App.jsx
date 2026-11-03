import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
import LoginPage from './components/LoginPage';
import MDDashboard from './components/MDDashboard';
import SalesHeadDashboard from './components/SalesHeadDashboard';
import AMDashboard from './components/AMDashboard';
import MasterAdminPanel from './components/MasterAdminPanel';
import BillingUploadModal from './components/BillingUploadModal';
import InvoiceDetailModal from './components/InvoiceDetailModal';
import { UploadCloud, ShieldCheck, LogOut, X, FileSpreadsheet, User } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [viewMode, setViewMode] = useState('DASHBOARD'); // 'DASHBOARD', 'SALES_HEAD', 'AM', 'ADMIN'
  const [currentNavSection, setCurrentNavSection] = useState('DASHBOARD'); // 'DASHBOARD', 'LEDGER', 'TEAMS', 'DIRECT', 'UPLOAD', 'ADMIN'
  const [selectedSalesHeadId, setSelectedSalesHeadId] = useState(null);
  const [selectedAMIdentifier, setSelectedAMIdentifier] = useState(null);
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [collapsedSidebar, setCollapsedSidebar] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Check saved session
    const savedUser = localStorage.getItem('finecons_rms_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        setCurrentUser(u);
      } catch (e) {
        localStorage.removeItem('finecons_rms_user');
      }
    }
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setViewMode('DASHBOARD');
    setCurrentNavSection('DASHBOARD');
    setSelectedSalesHeadId(null);
    setSelectedAMIdentifier(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('finecons_rms_token');
    localStorage.removeItem('finecons_rms_user');
    setCurrentUser(null);
    setViewMode('DASHBOARD');
    setCurrentNavSection('DASHBOARD');
    setSelectedSalesHeadId(null);
    setSelectedAMIdentifier(null);
    setIsMobileMenuOpen(false);
  };

  // Section Selector from Sidebar or Mobile Nav
  const handleSelectSection = (section) => {
    setCurrentNavSection(section);
    setIsMobileMenuOpen(false);

    if (section === 'DASHBOARD') {
      setViewMode('DASHBOARD');
      setSelectedSalesHeadId(null);
      setSelectedAMIdentifier(null);
    } else if (section === 'LEDGER') {
      setViewMode('DASHBOARD');
      // Scroll to ledger table if already on dashboard
      setTimeout(() => {
        const tableEl = document.querySelector('.table-container');
        if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (section === 'TEAMS') {
      if (currentUser?.role === 'MD') {
        setViewMode('DASHBOARD');
        setTimeout(() => {
          const shEl = document.querySelector('.sh-grid');
          if (shEl) shEl.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else if (currentUser?.role === 'SALES_HEAD') {
        setViewMode('DASHBOARD');
      }
    } else if (section === 'DIRECT') {
      if (currentUser?.role === 'MD') {
        // Direct Accounts handled at the Sales Head level (Kumaran M - Vertical Head Hardware)
        handleDrilldownSalesHead(5, 'DIRECT');
        setTimeout(() => {
          const directEl = document.getElementById('direct-accounts-section');
          if (directEl) directEl.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      } else if (currentUser?.role === 'SALES_HEAD') {
        setViewMode('DASHBOARD');
        setTimeout(() => {
          const directEl = document.getElementById('direct-accounts-section');
          if (directEl) directEl.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    } else if (section === 'UPLOAD') {
      setIsUploadOpen(true);
    } else if (section === 'ADMIN') {
      setViewMode('ADMIN');
    }
  };

  // MD drills down into Sales Head
  const handleDrilldownSalesHead = (shId, targetSection = 'TEAMS') => {
    setSelectedSalesHeadId(shId);
    setViewMode('SALES_HEAD');
    setCurrentNavSection(targetSection);
  };

  // Sales Head or MD drills down into Account Manager
  const handleDrilldownAM = (amIdOrName) => {
    setSelectedAMIdentifier(amIdOrName);
    setViewMode('AM');
    setCurrentNavSection('TEAMS');
  };

  const handleBackToMD = () => {
    setViewMode('DASHBOARD');
    setCurrentNavSection('DASHBOARD');
    setSelectedSalesHeadId(null);
    setSelectedAMIdentifier(null);
  };

  const handleBackToSalesHead = () => {
    setViewMode('SALES_HEAD');
    setCurrentNavSection('TEAMS');
    setSelectedAMIdentifier(null);
  };

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  const getSectionTitle = () => {
    if (viewMode === 'ADMIN') return 'Master Admin • User Security & Role Directory';
    if (currentNavSection === 'DIRECT') return 'Direct Accounts Portfolio • Key Enterprise Clients';
    if (viewMode === 'SALES_HEAD') return 'Sales Division Receivables';
    if (viewMode === 'AM') return 'Account Manager Portfolio & Invoices Ledger';
    if (currentUser?.role === 'BILLING') return 'Billing Operations & Tally Reconciliations';
    return 'Company-Wide Consolidated Receivables';
  };

  // If not logged in, show Login Screen
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="zoho-app-layout">
      {/* 1. Desktop Zoho-Style Sidebar (Collapsible) */}
      <Sidebar 
        currentUser={currentUser}
        currentSection={currentNavSection}
        onSelectSection={handleSelectSection}
        onLogout={handleLogout}
        collapsed={collapsedSidebar}
        onToggleCollapse={() => setCollapsedSidebar(!collapsedSidebar)}
      />

      {/* 2. Main Application Viewport */}
      <div className={`zoho-main-viewport ${collapsedSidebar ? 'sidebar-collapsed' : ''}`}>
        {/* Top Header */}
        <Header 
          currentUser={currentUser} 
          currentSectionTitle={getSectionTitle()}
          onOpenUpload={() => setIsUploadOpen(true)}
          onLogout={handleLogout}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        {/* Dynamic Main Content Container */}
        <main className="main-content" key={refreshKey}>
          {/* MASTER ADMIN PANEL (MD ONLY) */}
          {viewMode === 'ADMIN' && currentUser.role === 'MD' && (
            <MasterAdminPanel onBack={handleBackToMD} />
          )}

          {/* 1. MD / DIRECTORS VIEW */}
          {viewMode !== 'ADMIN' && currentUser.role === 'MD' && (
            <>
              {viewMode === 'DASHBOARD' && (
                <MDDashboard 
                  currentUser={currentUser}
                  onSelectSalesHead={handleDrilldownSalesHead}
                  onSelectAM={handleDrilldownAM}
                  onSelectInvoice={invNum => setSelectedInvoiceNumber(invNum)}
                  activeSection={currentNavSection}
                />
              )}
              {viewMode === 'SALES_HEAD' && (
                <SalesHeadDashboard 
                  currentUser={currentUser}
                  salesHeadId={selectedSalesHeadId}
                  onBackToMD={handleBackToMD}
                  onSelectAM={handleDrilldownAM}
                  onSelectInvoice={invNum => setSelectedInvoiceNumber(invNum)}
                  isDirectLogin={false}
                />
              )}
              {viewMode === 'AM' && (
                <AMDashboard 
                  currentUser={currentUser}
                  amIdentifier={selectedAMIdentifier}
                  onBack={selectedSalesHeadId ? handleBackToSalesHead : handleBackToMD}
                  onSelectInvoice={invNum => setSelectedInvoiceNumber(invNum)}
                  isDirectLogin={false}
                />
              )}
            </>
          )}

          {/* 2. SALES HEAD VIEW (STRICTLY SCOPED TO OWN TEAM & DIRECT CLIENTS) */}
          {viewMode !== 'ADMIN' && currentUser.role === 'SALES_HEAD' && (
            <>
              {viewMode === 'AM' ? (
                <AMDashboard 
                  currentUser={currentUser}
                  amIdentifier={selectedAMIdentifier}
                  onBack={handleBackToSalesHead}
                  onSelectInvoice={invNum => setSelectedInvoiceNumber(invNum)}
                  isDirectLogin={false}
                />
              ) : (
                <SalesHeadDashboard 
                  currentUser={currentUser}
                  salesHeadId={currentUser.id}
                  onBackToMD={() => {}}
                  onSelectAM={handleDrilldownAM}
                  onSelectInvoice={invNum => setSelectedInvoiceNumber(invNum)}
                  isDirectLogin={true}
                />
              )}
            </>
          )}

          {/* 3. ACCOUNT MANAGER VIEW (STRICTLY SCOPED TO THEIR INVOICES ONLY) */}
          {viewMode !== 'ADMIN' && currentUser.role === 'ACCOUNT_MANAGER' && (
            <AMDashboard 
              currentUser={currentUser}
              amIdentifier={currentUser.id}
              onBack={() => {}}
              onSelectInvoice={invNum => setSelectedInvoiceNumber(invNum)}
              isDirectLogin={true}
            />
          )}

          {/* 4. SALES & BILLING VIEW (UPLOAD + CONSOLIDATED OVERVIEW) */}
          {viewMode !== 'ADMIN' && currentUser.role === 'BILLING' && (
            <div>
              <div className="profile-banner">
                <div className="profile-info">
                  <div className="profile-avatar">BL</div>
                  <div className="profile-meta">
                    <h2>{currentUser.full_name} | Billing & Receivables Portal</h2>
                    <div className="profile-role-tag">
                      <FileSpreadsheet size={14} />
                      <span>Upload weekly Tally Excel reports and manage client reconciliations</span>
                    </div>
                  </div>
                </div>
                <div className="banner-actions">
                  <button 
                    type="button"
                    className="btn-accent"
                    onClick={() => setIsUploadOpen(true)}
                  >
                    <UploadCloud size={16} />
                    <span>Upload Tally Excel</span>
                  </button>
                </div>
              </div>

              {/* Embedded overview for billing analysis */}
              <MDDashboard 
                currentUser={currentUser}
                onSelectSalesHead={handleDrilldownSalesHead}
                onSelectAM={handleDrilldownAM}
                onSelectInvoice={invNum => setSelectedInvoiceNumber(invNum)}
                activeSection={currentNavSection}
              />
            </div>
          )}
        </main>

        {/* 3. Mobile Bottom Navigation Bar (Visible only on mobile) */}
        <MobileBottomNav 
          currentUser={currentUser}
          currentSection={currentNavSection}
          onSelectSection={handleSelectSection}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />
      </div>

      {/* 4. Mobile Menu Bottom Sheet Drawer */}
      {isMobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="mobile-drawer-card" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div className="mobile-drawer-user">
                <div className="user-avatar-circle">
                  {currentUser.full_name?.substring(0, 2).toUpperCase() || 'FC'}
                </div>
                <div>
                  <h3 className="mobile-drawer-name">{currentUser.full_name}</h3>
                  <span className="mobile-drawer-role">{currentUser.role?.replace('_', ' ')}</span>
                </div>
              </div>
              <button 
                type="button" 
                className="close-btn" 
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="mobile-drawer-menu">
              {(currentUser?.role === 'BILLING' || currentUser?.role === 'MD') && (
                <button
                  type="button"
                  className="mobile-drawer-item"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsUploadOpen(true);
                  }}
                >
                  <UploadCloud size={18} color="var(--fc-orange-600)" />
                  <span>Upload Tally Excel Sheet</span>
                </button>
              )}

              {currentUser?.role === 'MD' && (
                <button
                  type="button"
                  className="mobile-drawer-item"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setViewMode('ADMIN');
                  }}
                >
                  <ShieldCheck size={18} color="var(--fc-navy-600)" />
                  <span>Master Admin (Add AMs, Reset Passwords)</span>
                </button>
              )}

              <button
                type="button"
                className="mobile-drawer-item mobile-logout-item"
                onClick={handleLogout}
              >
                <LogOut size={18} color="#dc2626" />
                <span>Sign Out of RMS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
        <BillingUploadModal 
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          allUsers={[]}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* Invoice Detail & Audit Modal */}
      {!!selectedInvoiceNumber && (
        <InvoiceDetailModal 
          invoiceNumber={selectedInvoiceNumber}
          isOpen={!!selectedInvoiceNumber}
          currentUser={currentUser}
          onClose={() => setSelectedInvoiceNumber(null)}
        />
      )}
    </div>
  );
}
