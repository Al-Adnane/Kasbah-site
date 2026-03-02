'use client';

import { useEffect, useState } from 'react';
import { apiClient, TeamMember } from '@/lib/api';
import styles from './UserList.module.css';

interface UserListProps {
  onRefresh?: () => void;
}

export default function UserList({ onRefresh }: UserListProps) {
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', role: 'user' as const });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true);
        const data = await apiClient.getTeamMembers();
        setUsers(data);
      } catch (error) {
        console.error('Failed to load team members:', error);
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddUser = async () => {
    if (!newUser.email) {
      setMessage('❌ Email is required');
      return;
    }

    try {
      setSaving(true);
      await apiClient.addTeamMember(newUser.email, newUser.role);

      const newMember: TeamMember = {
        id: `user-${Date.now()}`,
        email: newUser.email,
        name: newUser.email.split('@')[0],
        role: newUser.role,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      };

      setUsers([...users, newMember]);
      setShowModal(false);
      setNewUser({ email: '', role: 'member' });
      setMessage('✅ User invited successfully');

      setTimeout(() => setMessage(''), 3000);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to add user:', error);
      setMessage('❌ Failed to add user');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: TeamMember['role']) => {
    try {
      await apiClient.updateTeamMember(userId, newRole);

      setUsers(
        users.map((user) =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );

      setMessage('✅ User role updated');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to update role:', error);
      setMessage('❌ Failed to update role');
    }
  };

  const handleRemoveUser = async (userId: string, email: string) => {
    if (window.confirm(`Remove ${email} from team?`)) {
      try {
        await apiClient.removeTeamMember(userId);

        setUsers(users.filter((u) => u.id !== userId));
        setMessage('✅ User removed from team');
        setTimeout(() => setMessage(''), 3000);
      } catch (error) {
        console.error('Failed to remove user:', error);
        setMessage('❌ Failed to remove user');
      }
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading team members...</div>;
  }

  return (
    <div className={styles.userList}>
      <div className={styles.header}>
        <h2>Team Members</h2>
        <button className={styles.addButton} onClick={() => setShowModal(true)}>
          + Invite User
        </button>
      </div>

      {message && <div className={`${styles.message} ${message.includes('✅') ? styles.success : styles.error}`}>{message}</div>}

      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Search by email or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {filteredUsers.length === 0 ? (
        <div className={styles.empty}>No team members found. Invite your first user to get started.</div>
      ) : (
        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <div className={styles.col_email}>Email</div>
            <div className={styles.col_name}>Name</div>
            <div className={styles.col_role}>Role</div>
            <div className={styles.col_joined}>Joined</div>
            <div className={styles.col_lastSeen}>Last Seen</div>
            <div className={styles.col_actions}>Actions</div>
          </div>

          <div className={styles.tableBody}>
            {filteredUsers.map((user) => (
              <div key={user.id} className={styles.row}>
                <div className={styles.col_email}>
                  <span className={styles.email}>{user.email}</span>
                </div>
                <div className={styles.col_name}>
                  <span>{user.name}</span>
                </div>
                <div className={styles.col_role}>
                  <select
                    value={user.role}
                    onChange={(e) => handleUpdateRole(user.id, e.target.value as TeamMember['role'])}
                    className={styles.roleSelect}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div className={styles.col_joined}>
                  <span className={styles.date}>{new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.col_lastSeen}>
                  <span className={styles.date}>
                    {user.last_seen
                      ? new Date(user.last_seen).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                <div className={styles.col_actions}>
                  <button
                    className={styles.removeButton}
                    onClick={() => handleRemoveUser(user.id, user.email)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => !saving && setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Invite User</h3>
              <button
                className={styles.closeButton}
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="user@company.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className={styles.input}
                  disabled={saving}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                  className={styles.select}
                  disabled={saving}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.cancelButton}
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={styles.inviteButton}
                onClick={handleAddUser}
                disabled={saving}
              >
                {saving ? 'Inviting...' : 'Invite User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
