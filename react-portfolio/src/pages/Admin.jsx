import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Shield, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';

const Admin = () => {
  const { session, user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [quotasByUser, setQuotasByUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchProfiles = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const [profilesRes, quotasRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, display_name, role, status, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('truth_or_dare_sessions')
          .select('user_id, games_played, max_games'),
      ]);

      if (profilesRes.error) {
        setErrorMsg(profilesRes.error.message || 'Failed to load user directory.');
      } else {
        setProfiles(profilesRes.data || []);
      }

      if (!quotasRes.error && Array.isArray(quotasRes.data)) {
        const map = {};
        quotasRes.data.forEach((q) => {
          map[q.user_id] = {
            games_played: q.games_played ?? 0,
            max_games: q.max_games ?? 10,
          };
        });
        setQuotasByUser(map);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Unexpected error fetching users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleToggleUser = async (targetUser) => {
    if (!session?.access_token) {
      setErrorMsg('Session expired. Please sign in again.');
      return;
    }

    const action = targetUser.status === 'active' ? 'disable' : 'enable';
    setTogglingId(targetUser.id);
    setErrorMsg('');

    try {
      const response = await fetch('/api/admin/toggle-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: targetUser.id,
          action,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMsg(data.message || `Failed to ${action} user.`);
        return;
      }

      if (data.profile) {
        setProfiles((prev) =>
          prev.map((row) => (row.id === data.profile.id ? data.profile : row))
        );
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Network error while updating user status.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleResetQuota = async (targetUser) => {
    if (!session?.access_token) {
      setErrorMsg('Session expired. Please sign in again.');
      return;
    }

    setResettingId(targetUser.id);
    setErrorMsg('');

    try {
      const response = await fetch('/api/admin/toggle-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: targetUser.id,
          action: 'reset-quota',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMsg(data.message || 'Failed to reset user game quota.');
        return;
      }

      if (data.quota) {
        setQuotasByUser((prev) => ({
          ...prev,
          [targetUser.id]: {
            games_played: data.quota.games_played ?? 0,
            max_games: data.quota.max_games ?? 10,
          },
        }));
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Network error while resetting quota.');
    } finally {
      setResettingId(null);
    }
  };

  const stats = useMemo(() => {
    const total = profiles.length;
    const active = profiles.filter((p) => p.status === 'active').length;
    const disabled = profiles.filter((p) => p.status === 'disabled').length;
    return { total, active, disabled };
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.display_name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.role || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q)
    );
  }, [profiles, searchQuery]);

  return (
    <div className="page-container admin-page">
      <Link to="/" className="back-link">
        &larr; Back to Portfolio
      </Link>

      <div className="admin-header-row">
        <div>
          <div className="osint-badge-line">
            <Shield size={14} strokeWidth={1.75} />
            <span>ADMINISTRATIVE CONTROL PANEL</span>
          </div>
          <h1 className="page-title" style={{ marginBottom: '6px' }}>
            Operator Directory &amp; Access Control
          </h1>
        </div>
        <button
          type="button"
          className="btn"
          onClick={fetchProfiles}
          disabled={loading}
        >
          <RefreshCw size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          Refresh
        </button>
      </div>

      {/* 3 Metric Cards */}
      <div className="admin-metrics-grid">
        <div className="admin-metric-card">
          <div className="admin-metric-value">{stats.total}</div>
          <div className="admin-metric-label">Total Users</div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-value" style={{ color: '#55ff99' }}>
            {stats.active}
          </div>
          <div className="admin-metric-label">Active Accounts</div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-value" style={{ color: '#ff7777' }}>
            {stats.disabled}
          </div>
          <div className="admin-metric-label">Disabled Accounts</div>
        </div>
      </div>

      {errorMsg && (
        <div className="auth-alert auth-alert-error" role="alert">
          <AlertCircle size={16} strokeWidth={1.75} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="admin-search-bar">
        <Search size={16} strokeWidth={1.75} className="admin-search-icon" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by display name, email, role, or status..."
          className="tool-input admin-search-input"
        />
      </div>

      {/* User Table */}
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Display Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined Date</th>
              <th>Games</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="admin-table-empty">
                  LOADING OPERATOR RECORDS...
                </td>
              </tr>
            ) : filteredProfiles.length === 0 ? (
              <tr>
                <td colSpan="7" className="admin-table-empty">
                  No matching user accounts found.
                </td>
              </tr>
            ) : (
              filteredProfiles.map((row) => {
                const isSelf = row.id === user?.id;
                const isDisabling = row.status === 'active';
                const quota = quotasByUser[row.id] || { games_played: 0, max_games: 10 };
                return (
                  <tr key={row.id}>
                    <td>{row.display_name || '—'}</td>
                    <td>{row.email}</td>
                    <td>
                      <span className={`role-badge role-${row.role}`}>{row.role}</span>
                    </td>
                    <td>
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td>
                      <div className="admin-quota-cell">
                        <span>
                          {quota.games_played} / {quota.max_games}
                        </span>
                        {quota.games_played > 0 && (
                          <button
                            type="button"
                            className="copy-btn"
                            disabled={resettingId === row.id}
                            onClick={() => handleResetQuota(row)}
                            title="Reset Truth or Dare game quota to 0"
                          >
                            {resettingId === row.id ? '...' : 'Reset'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          row.status === 'active' ? 'status-match' : 'status-mismatch'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={isSelf || togglingId === row.id}
                        onClick={() => handleToggleUser(row)}
                        className={`admin-action-btn ${
                          isDisabling ? 'btn-disable' : 'btn-enable'
                        }`}
                        title={
                          isSelf
                            ? 'Cannot disable your own administrator account'
                            : isDisabling
                              ? 'Disable user and revoke sessions'
                              : 'Re-enable user account'
                        }
                      >
                        {togglingId === row.id
                          ? 'Updating...'
                          : isSelf
                            ? 'Current Admin'
                            : isDisabling
                              ? 'Disable'
                              : 'Enable'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Admin;
