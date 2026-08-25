import { useEffect, useState } from "react";
import { Search, Pencil, Trash2, Check, Ban, Power, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

import EditUserModal from "../components/EditUserModal";

import {
    getUsers,
    removeUser,
    approveUser,
    deactivateUser,
    activateUser
} from "../services/userService";
import { logActivity, getCurrentActor } from "../services/activityService";

const ROLE_LABELS = {
    owner: "Owner",
    backup_owner: "Co Owner",
    manager: "Manager",
    staff: "Staff",
};

const STATUS_STYLES = {
    approved: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    invited: "bg-blue-100 text-blue-700",
    deactivated: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS = {
    approved: "Approved",
    pending: "Pending",
    invited: "Invited",
    deactivated: "Deactivated",
};

// Mobile access (isActive) is no longer shown as its own badge — a
// deactivated account just shows "Deactivated" in place of its
// approved/pending/invited status here.
const effectiveStatus = (user) => (user.isActive === false ? "deactivated" : (user.status || "approved"));

export default function UserManagement() {

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showEdit, setShowEdit] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [sortBy, setSortBy] = useState("name"); // "name"
    const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await getUsers();
            setUsers(data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const staffUsers = users.filter((user) => user.role === "staff");

    const filteredUsers = staffUsers
        .filter((user) => {
            const term = search.toLowerCase();
            return (
                user.name?.toLowerCase().includes(term) ||
                user.email?.toLowerCase().includes(term)
            );
        })
        .sort((a, b) => {
            const result = (a.name || "").localeCompare(b.name || "");
            return sortDir === "asc" ? result : -result;
        });

    const toggleSort = (column) => {
        if (sortBy === column) {
            setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(column);
            setSortDir("asc");
        }
    };

    const SortIcon = ({ column }) => {
        if (sortBy !== column) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />;
        return sortDir === "asc"
            ? <ArrowUp className="w-3.5 h-3.5 text-[#2D5016]" />
            : <ArrowDown className="w-3.5 h-3.5 text-[#2D5016]" />;
    };

    const handleDelete = async (email) => {
        const ok = window.confirm("Delete this user?");
        if (!ok) return;
        const target = users.find((u) => u.email === email);
        try {
            await removeUser(email);
            const actor = getCurrentActor();
            logActivity({
                type: "delete",
                module: "Staff",
                message: `${actor.userName || actor.userEmail || "Someone"} deleted user ${target?.name || email} (${email})`,
                ...actor,
            });
            loadUsers();
        } catch (err) {
            console.error(err);
            alert("Unable to delete user.");
        }
    };

    const handleApprove = async (email) => {
        const target = users.find((u) => u.email === email);
        try {
            await approveUser(email);
            const actor = getCurrentActor();
            logActivity({
                type: "update",
                module: "Staff",
                message: `${actor.userName || actor.userEmail || "Someone"} approved user ${target?.name || email} (${email})`,
                ...actor,
            });
            loadUsers();
        } catch (err) {
            console.error(err);
            alert("Unable to approve user.");
        }
    };

    const handleDeactivate = async (email) => {
        const target = users.find((u) => u.email === email);
        try {
            await deactivateUser(email);
            const actor = getCurrentActor();
            logActivity({
                type: "update",
                module: "Staff",
                message: `${actor.userName || actor.userEmail || "Someone"} deactivated user ${target?.name || email} (${email})`,
                ...actor,
            });
            loadUsers();
        } catch (err) {
            console.error(err);
            alert("Unable to deactivate user.");
        }
    };

    const handleActivate = async (email) => {
        const target = users.find((u) => u.email === email);
        try {
            await activateUser(email);
            const actor = getCurrentActor();
            logActivity({
                type: "update",
                module: "Staff",
                message: `${actor.userName || actor.userEmail || "Someone"} activated user ${target?.name || email} (${email})`,
                ...actor,
            });
            loadUsers();
        } catch (err) {
            console.error(err);
            alert("Unable to activate user.");
        }
    };

    return (
        <div>

            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-[#2D5016]/30 focus:border-[#2D5016] outline-none transition-all"
                />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b-2 border-gray-200">
                            <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                <button onClick={() => toggleSort("name")} className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                                    Name
                                    <SortIcon column="name" />
                                </button>
                            </th>
                            <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                            <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan="4" className="text-center p-10 text-gray-400 text-sm">
                                    Loading users...
                                </td>
                            </tr>
                        )}

                        {!loading && filteredUsers.length === 0 && (
                            <tr>
                                <td colSpan="4" className="text-center p-10 text-gray-400 text-sm">
                                    No users found.
                                </td>
                            </tr>
                        )}

                        {!loading &&
                            filteredUsers.map((user) => (
                                <tr key={user.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50/60 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                                                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-gray-900 text-sm">{user.name || "Unnamed"}</div>
                                                <div className="text-xs text-gray-400">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-sm text-gray-700">
                                        {ROLE_LABELS[user.role] || user.role || "Staff"}
                                    </td>

                                    <td className="px-6 py-4">
                                        <span
                                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                STATUS_STYLES[effectiveStatus(user)] || "bg-gray-100 text-gray-500"
                                            }`}
                                        >
                                            {STATUS_LABELS[effectiveStatus(user)] || effectiveStatus(user)}
                                        </span>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-1">
                                            {(user.status === "pending" || user.status === "invited") && (
                                                <button
                                                    onClick={() => handleApprove(user.email)}
                                                    title="Approve"
                                                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                            )}
                                            {user.isActive === false ? (
                                                <button
                                                    onClick={() => handleActivate(user.email)}
                                                    title="Reactivate"
                                                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                >
                                                    <Power className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleDeactivate(user.email)}
                                                    title="Deactivate"
                                                    className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                                >
                                                    <Ban className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setShowEdit(true);
                                                }}
                                                title="Edit"
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user.email)}
                                                title="Delete"
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>

                {!loading && (
                    <div className="px-6 py-3 text-xs text-gray-400 border-t-2 border-gray-200">
                        Showing {filteredUsers.length} of {staffUsers.length} staff users
                    </div>
                )}
            </div>

            {showEdit && selectedUser && (
                <EditUserModal
                    user={selectedUser}
                    close={() => {
                        setShowEdit(false);
                        setSelectedUser(null);
                    }}
                    reload={loadUsers}
                />
            )}
        </div>
    );
}