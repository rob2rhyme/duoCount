// src/components/UserManagement.tsx
// Admin-only: list users in the `users` collection and manage their roles.
// Backed by role-aware Firestore rules (only admins can write user docs).
import React, { useEffect, useState } from "react";
import styles from "@/styles/Settings.module.css";
import { db } from "@/utils/firebase";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/utils/activity";
import { ROLES, Role, isRole } from "@/utils/permissions";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import toast from "react-hot-toast";

interface UserRow {
  uid: string;
  role: Role;
  displayName?: string;
}

const UserManagement: React.FC = () => {
  const { user, role } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            role: isRole(data.role) ? data.role : "viewer",
            displayName: data.displayName,
          };
        })
      );
    });
    return () => unsub();
  }, []);

  const changeRole = async (u: UserRow, nextRole: Role) => {
    if (u.uid === user?.uid) {
      toast.error("You can't change your own role.");
      return;
    }
    try {
      await setDoc(doc(db, "users", u.uid), { role: nextRole }, { merge: true });
      toast.success(`${u.displayName || u.uid.slice(0, 6)} → ${nextRole}`);
      logActivity(
        {
          action: "edit",
          item: u.displayName || u.uid,
          detail: `role → ${nextRole}`,
        },
        { uid: user?.uid ?? null, role }
      );
    } catch {
      toast.error("Failed to update role.");
    }
  };

  const removeUser = async (u: UserRow) => {
    if (u.uid === user?.uid) return;
    if (!confirm(`Remove ${u.displayName || u.uid}? They revert to the default role.`))
      return;
    try {
      await deleteDoc(doc(db, "users", u.uid));
      toast.success("User removed");
    } catch {
      toast.error("Failed to remove user.");
    }
  };

  const addUser = async () => {
    const uid = newUid.trim();
    if (!uid) {
      toast.error("Enter a Firebase Auth UID.");
      return;
    }
    if (uid === user?.uid) {
      toast.error("You can't change your own role — ask another admin.");
      return;
    }
    try {
      await setDoc(
        doc(db, "users", uid),
        { role: newRole, displayName: newName.trim() || null },
        { merge: true }
      );
      toast.success("User saved");
      logActivity(
        { action: "edit", item: newName.trim() || uid, detail: `role → ${newRole}` },
        { uid: user?.uid ?? null, role }
      );
      setNewUid("");
      setNewName("");
      setNewRole("viewer");
    } catch {
      toast.error("Failed to save user. Check the UID and your permissions.");
    }
  };

  return (
    <div className={styles.card}>
      <h2>User management</h2>
      {users.length === 0 ? (
        <p className={styles.note}>
          No user records yet. Add one below using a Firebase Auth UID.
        </p>
      ) : (
        <table className={styles.userTable}>
          <thead>
            <tr>
              <th>User</th>
              <th>UID</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.uid === user?.uid;
              return (
                <tr key={u.uid}>
                  <td>
                    {u.displayName || "—"}
                    {isSelf && <span className={styles.you}>YOU</span>}
                  </td>
                  <td className={styles.mono}>{u.uid.slice(0, 10)}…</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) =>
                        changeRole(u, e.target.value as Role)
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className={styles.removeBtn}
                      onClick={() => removeUser(u)}
                      disabled={isSelf}
                      title={isSelf ? "You can't remove yourself" : "Remove user"}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className={styles.addForm}>
        <div className={styles.field}>
          <label>Firebase Auth UID</label>
          <input
            value={newUid}
            onChange={(e) => setNewUid(e.target.value)}
            placeholder="e.g. aBcD…"
          />
        </div>
        <div className={styles.field}>
          <label>Display name</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="optional"
          />
        </div>
        <div className={styles.field} style={{ flex: "0 1 120px" }}>
          <label>Role</label>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button className={styles.addBtn} onClick={addUser}>
          Save user
        </button>
      </div>
      <p className={styles.note}>
        Find a user’s UID in the Firebase console → Authentication → Users (after
        they’ve signed in once). Users with no record here get the default role.
      </p>
    </div>
  );
};

export default UserManagement;
