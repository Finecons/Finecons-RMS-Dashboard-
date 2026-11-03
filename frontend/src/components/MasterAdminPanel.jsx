import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Key, Trash2, Shield, Search, CheckCircle, 
  AlertCircle, X, ArrowLeft, RefreshCw, Briefcase, Mail, Phone, Edit3 
} from 'lucide-react';

export default function MasterAdminPanel({ onBack }) {
  const [users, setUsers] = useState([]);
  const [salesHeads, setSalesHeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [resetModalUser, setResetModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // Edit User Modal state
  const [editModalUser, setEditModalUser] = useState(null);
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    username: '',
    role: 'ACCOUNT_MANAGER',
    sales_head_id: '',
    email: '',
    phone: '',
    designation: '',
    is_active: true,
    new_password: ''
  });
  const [editingLoading, setEditingLoading] = useState(false);

  // Add User Form state
  const [formData, setFormData] = useState({
    full_name: '',
    username: '',
    password: '',
    role: 'ACCOUNT_MANAGER',
    sales_head_id: '',
    email: '',
    phone: '',
    designation: 'Account Manager'
  });

  const [feedback, setFeedback] = useState(null);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    fetchUsersAndSalesHeads();
  }, []);

  const fetchUsersAndSalesHeads = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(data);

      const shList = data.filter(u => u.role === 'SALES_HEAD');
      setSalesHeads(shList);
      if (shList.length > 0) {
        setFormData(prev => ({ ...prev, sales_head_id: shList[0].id }));
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError(null);

    try {
      const payload = {
        ...formData,
        sales_head_id: formData.role === 'ACCOUNT_MANAGER' && formData.sales_head_id ? parseInt(formData.sales_head_id) : null
      };

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create user');
      }

      setFeedback({ type: 'success', message: `User ${data.full_name} created successfully!` });
      setIsAddModalOpen(false);
      setFormData({
        full_name: '',
        username: '',
        password: '',
        role: 'ACCOUNT_MANAGER',
        sales_head_id: salesHeads[0]?.id || '',
        email: '',
        phone: '',
        designation: 'Account Manager'
      });
      fetchUsersAndSalesHeads();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetModalUser || !newPassword) return;

    try {
      const res = await fetch(`/api/admin/users/${resetModalUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to reset password');
      }

      setFeedback({ type: 'success', message: `Password for ${resetModalUser.full_name} reset successfully!` });
      setResetModalUser(null);
      setNewPassword('');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Are you sure you want to remove ${user.full_name} (${user.role})?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete user');
      }

      setFeedback({ type: 'success', message: data.message });
      fetchUsersAndSalesHeads();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editModalUser) return;

    try {
      setEditingLoading(true);
      const payload = {
        full_name: editFormData.full_name,
        username: editFormData.username,
        role: editFormData.role,
        sales_head_id: editFormData.role === 'ACCOUNT_MANAGER' && editFormData.sales_head_id ? Number(editFormData.sales_head_id) : null,
        email: editFormData.email || null,
        phone: editFormData.phone || null,
        designation: editFormData.designation || null,
        is_active: editFormData.is_active,
        ...(editFormData.new_password && editFormData.new_password.trim() ? { new_password: editFormData.new_password.trim() } : {})
      };

      const res = await fetch(`/api/admin/users/${editModalUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.detail || 'Failed to update user profile');
      }

      setFeedback({
        type: 'success',
        message: `User "${updated.full_name}" updated successfully${editFormData.new_password ? ' (with new password)' : ''}!`
      });
      setEditModalUser(null);
      fetchUsersAndSalesHeads();
    } catch (err) {
      alert(`Update Error: ${err.message}`);
    } finally {
      setEditingLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(search.toLowerCase()));

    const matchesRole = filterRole === 'ALL' || u.role === filterRole;

    return matchesSearch && matchesRole;
  });

  return (
    <div>
      {/* Navigation */}
      <div className="breadcrumb">
        <span className="breadcrumb-link" onClick={onBack}>
          ← Back to Executive Dashboard
        </span>
        <span>/</span>
        <span>Master Admin Panel</span>
      </div>

      {/* Profile Header */}
      <div className="profile-banner">
        <div className="profile-info">
          <div className="profile-avatar" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <Shield size={24} color="#fff" />
          </div>
          <div className="profile-meta">
            <h2>Master Admin Panel & User Directory</h2>
            <div className="profile-role-tag">
              <span>Finecons Private Limited • Add Account Managers, Assign Sales Heads & Reset Passwords</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', zIndex: 1 }}>
          <button className="btn-accent" onClick={() => setIsAddModalOpen(true)}>
            <UserPlus size={16} />
            <span>Add New Account Manager / User</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div style={{ 
          background: feedback.type === 'success' ? 'var(--fc-green-light)' : 'var(--fc-red-light)', 
          border: `1px solid ${feedback.type === 'success' ? 'var(--fc-green-border)' : 'var(--fc-red-border)'}`,
          color: feedback.type === 'success' ? 'var(--fc-green-dark)' : 'var(--fc-red-dark)',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={18} />
            <span style={{ fontWeight: 600 }}>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Users Management Content Card */}
      <div className="content-card">
        <div className="card-header">
          <h3>
            <Users size={18} color="var(--fc-navy-600)" />
            <span>All System Users ({filteredUsers.length})</span>
          </h3>

          <div className="filter-bar">
            <input 
              type="text"
              placeholder="Search user by name, username, email..."
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <select 
              className="search-input"
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
            >
              <option value="ALL">All Roles</option>
              <option value="ACCOUNT_MANAGER">Account Managers (30+)</option>
              <option value="SALES_HEAD">Sales Heads (3)</option>
              <option value="MD">Directors / MD (3)</option>
              <option value="BILLING">Sales & Billing (2)</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee / User Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Assigned Sales Head</th>
                <th>Contact Details</th>
                <th>Status</th>
                <th>Admin Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>#{u.id}</span>
                  </td>
                  <td>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--fc-navy-900)' }}>{u.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.designation || '-'}</div>
                    </div>
                  </td>
                  <td>
                    <span className="primary-key-cell">{u.username}</span>
                  </td>
                  <td>
                    <span className={`badge ${
                      u.role === 'MD' ? 'badge-red' : 
                      u.role === 'SALES_HEAD' ? 'badge-orange' : 
                      u.role === 'ACCOUNT_MANAGER' ? 'badge-green' : 'badge-settled'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    {u.sales_head_name ? (
                      <span style={{ fontWeight: 600, color: 'var(--fc-navy-800)' }}>
                        💼 {u.sales_head_name}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {u.role === 'SALES_HEAD' ? 'Division Leader' : '—'}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <div>{u.email || '-'}</div>
                      <div>{u.phone || ''}</div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-green">Active</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <button 
                        className="btn-outline" 
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderColor: '#93c5fd', color: '#1d4ed8' }}
                        onClick={() => {
                          setEditModalUser(u);
                          setEditFormData({
                            full_name: u.full_name || '',
                            username: u.username || '',
                            role: u.role || 'ACCOUNT_MANAGER',
                            sales_head_id: u.sales_head_id || (salesHeads.length > 0 ? salesHeads[0].id : ''),
                            email: u.email || '',
                            phone: u.phone || '',
                            designation: u.designation || '',
                            is_active: u.is_active !== undefined ? u.is_active : true,
                            new_password: ''
                          });
                        }}
                        title="Edit User Profile & Change Password"
                      >
                        <Edit3 size={13} color="#2563eb" />
                        <span>Edit</span>
                      </button>

                      <button 
                        className="btn-outline" 
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          setResetModalUser(u);
                          setNewPassword('finecons@123');
                        }}
                        title="Reset User Password"
                      >
                        <Key size={13} color="var(--fc-orange-600)" />
                        <span>Reset Pwd</span>
                      </button>
                      {u.role !== 'MD' && (
                        <button 
                          className="btn-outline" 
                          style={{ padding: '0.3rem 0.5rem', borderColor: '#fca5a5', color: '#dc2626' }}
                          onClick={() => handleDeleteUser(u)}
                          title="Remove User"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <UserPlus size={22} color="var(--fc-navy-600)" />
                <div>
                  <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Add New Account Manager / User</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Finecons Private Limited</div>
                </div>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {formError && (
                <div style={{ background: 'var(--fc-red-light)', border: '1px solid var(--fc-red-border)', color: 'var(--fc-red-dark)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleCreateUser}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Full Name *
                    </label>
                    <input 
                      type="text" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      placeholder="e.g. Vignesh Kumar"
                      value={formData.full_name}
                      onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Username *
                    </label>
                    <input 
                      type="text" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      placeholder="e.g. vignesh_am"
                      value={formData.username}
                      onChange={e => setFormData({ ...formData, username: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Password *
                    </label>
                    <input 
                      type="password" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      placeholder="Enter initial password"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Role *
                    </label>
                    <select 
                      className="search-input"
                      style={{ width: '100%' }}
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value })}
                    >
                      <option value="ACCOUNT_MANAGER">Account Manager (AM)</option>
                      <option value="SALES_HEAD">Sales Head</option>
                      <option value="BILLING">Sales & Billing</option>
                      <option value="MD">Managing Director / Board</option>
                    </select>
                  </div>
                </div>

                {formData.role === 'ACCOUNT_MANAGER' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Assigned Sales Head {salesHeads.length > 0 ? '' : '(Optional)'}
                    </label>
                    <select 
                      className="search-input"
                      style={{ width: '100%' }}
                      value={formData.sales_head_id}
                      onChange={e => setFormData({ ...formData, sales_head_id: e.target.value })}
                    >
                      <option value="">None / Direct to MD</option>
                      {salesHeads.map(sh => (
                        <option key={sh.id} value={sh.id}>💼 {sh.full_name} ({sh.designation || 'Sales Head'})</option>
                      ))}
                    </select>
                    {salesHeads.length === 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        💡 Tip: You can create a <strong>Sales Head</strong> first, or assign this Account Manager later.
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Email Address
                    </label>
                    <input 
                      type="email" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      placeholder="vignesh.k@finecons.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Designation
                    </label>
                    <input 
                      type="text" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      placeholder="Account Manager - South"
                      value={formData.designation}
                      onChange={e => setFormData({ ...formData, designation: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button type="button" className="btn-outline" onClick={() => setIsAddModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-accent">
                    <UserPlus size={16} />
                    <span>Create User</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalUser && (
        <div className="modal-overlay" onClick={() => setResetModalUser(null)}>
          <div className="modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Key size={20} color="var(--fc-orange-600)" />
                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Reset User Password</h3>
              </div>
              <button onClick={() => setResetModalUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Setting a new login password for <strong>{resetModalUser.full_name}</strong> (<code>{resetModalUser.username}</code>).
              </p>

              <form onSubmit={handleResetPassword}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    New Password *
                  </label>
                  <input 
                    type="password"
                    className="search-input"
                    style={{ width: '100%' }}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button type="button" className="btn-outline" onClick={() => setResetModalUser(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-accent">
                    <span>Save New Password</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal (With Password Editing) */}
      {editModalUser && (
        <div className="modal-overlay" onClick={() => setEditModalUser(null)}>
          <div className="modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Edit3 size={20} color="var(--fc-navy-700)" />
                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>
                  Edit System User: <span style={{ color: 'var(--fc-orange-600)' }}>{editModalUser.full_name}</span>
                </h3>
              </div>
              <button onClick={() => setEditModalUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleUpdateUser}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Full Name *
                    </label>
                    <input 
                      type="text" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      value={editFormData.full_name}
                      onChange={e => setEditFormData({ ...editFormData, full_name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Username *
                    </label>
                    <input 
                      type="text" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      value={editFormData.username}
                      onChange={e => setEditFormData({ ...editFormData, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Role *
                    </label>
                    <select 
                      className="search-input" 
                      style={{ width: '100%' }}
                      value={editFormData.role}
                      onChange={e => setEditFormData({ ...editFormData, role: e.target.value })}
                    >
                      <option value="ACCOUNT_MANAGER">Account Manager</option>
                      <option value="SALES_HEAD">Sales Head</option>
                      <option value="MD">Managing Director (MD)</option>
                      <option value="BILLING">Sales & Billing Admin</option>
                    </select>
                  </div>

                  {editFormData.role === 'ACCOUNT_MANAGER' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Assigned Sales Head *
                      </label>
                      <select 
                        className="search-input" 
                        style={{ width: '100%' }}
                        value={editFormData.sales_head_id}
                        onChange={e => setEditFormData({ ...editFormData, sales_head_id: e.target.value })}
                      >
                        <option value="">-- Select Sales Head --</option>
                        {salesHeads.map(sh => (
                          <option key={sh.id} value={sh.id}>{sh.full_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Email Address
                    </label>
                    <input 
                      type="email" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      value={editFormData.email}
                      onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                      placeholder="user@finecons.com"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Phone / Mobile
                    </label>
                    <input 
                      type="text" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      value={editFormData.phone}
                      onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Designation
                  </label>
                  <input 
                    type="text" 
                    className="search-input" 
                    style={{ width: '100%' }}
                    value={editFormData.designation}
                    onChange={e => setEditFormData({ ...editFormData, designation: e.target.value })}
                    placeholder="e.g. Account Manager - Enterprise"
                  />
                </div>

                {/* Password Edit Field */}
                <div style={{ 
                  marginBottom: '1.25rem', 
                  padding: '0.85rem 1rem', 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: 'var(--radius-sm)' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                    <Key size={14} color="var(--fc-orange-600)" />
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--fc-navy-900)' }}>
                      Change Password (Optional)
                    </label>
                  </div>
                  <input 
                    type="password" 
                    className="search-input" 
                    style={{ width: '100%', background: '#fff' }}
                    placeholder="Leave blank to keep existing password, or enter new password"
                    value={editFormData.new_password}
                    onChange={e => setEditFormData({ ...editFormData, new_password: e.target.value })}
                    autoComplete="new-password"
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    💡 If left blank, the user's current password remains unchanged.
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button 
                    type="button" 
                    className="btn-outline" 
                    onClick={() => setEditModalUser(null)}
                    disabled={editingLoading}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn-accent"
                    disabled={editingLoading}
                  >
                    <CheckCircle size={16} />
                    <span>{editingLoading ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
