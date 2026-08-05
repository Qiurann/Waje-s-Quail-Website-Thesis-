import { useEffect, useMemo, useState } from "react";
import {
    Search,
    LogIn,
    LogOut,
    UserPlus,
    Pencil,
    Trash2,
    ClipboardList,
    CheckCircle2,
    Egg,
    Wrench,
    Activity as ActivityIcon,
} from "lucide-react";
import { subscribeToAuditTrail } from "../services/activityService";

const TYPE_META = {
    login: { label: "Login", icon: LogIn, color: "text-green-600 bg-green-100" },
    logout: { label: "Logout", icon: LogOut, color: "text-gray-600 bg-gray-100" },
    create: { label: "Created", icon: UserPlus, color: "text-blue-600 bg-blue-100" },
    update: { label: "Updated", icon: Pencil, color: "text-amber-600 bg-amber-100" },
    delete: { label: "Deleted", icon: Trash2, color: "text-red-600 bg-red-100" },
    task_assign: { label: "Task Assigned", icon: ClipboardList, color: "text-indigo-600 bg-indigo-100" },
    task_complete: { label: "Task Completed", icon: CheckCircle2, color: "text-teal-600 bg-teal-100" },
    egg_count: { label: "Egg Count", icon: Egg, color: "text-orange-600 bg-orange-100" },
    maintenance: { label: "Maintenance", icon: Wrench, color: "text-purple-600 bg-purple-100" },
};

const FILTERS = [
    "all",
    "login",
    "logout",
    "create",
    "update",
    "delete",
    "task_assign",
    "task_complete",
    "egg_count",
    "maintenance",
];

function formatTimestamp(ts) {
    if (!ts) return "Just now";
    const date = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    if (Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
    });
}

export default function ActivityLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        const unsubscribe = subscribeToAuditTrail((data) => {
            setLogs(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const filteredLogs = useMemo(() => {
        const term = search.toLowerCase();
        return logs.filter((log) => {
            const matchesType = filter === "all" || log.type === filter;
            const matchesSearch =
                !term ||
                log.userName?.toLowerCase().includes(term) ||
                log.userEmail?.toLowerCase().includes(term) ||
                log.message?.toLowerCase().includes(term) ||
                log.details?.toLowerCase().includes(term);
            return matchesType && matchesSearch;
        });
    }, [logs, search, filter]);

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
                <p className="text-gray-500 mt-1 text-sm">
                    Full audit trail of user and system events: logins, task assignments,
                    automated egg counts, and account changes
                </p>
            </div>

            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by user, action, or details..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#2D5016]/30 focus:border-[#2D5016] outline-none transition-all"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto">
                    {FILTERS.map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                filter === f
                                    ? "bg-[#2D5016] text-white"
                                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                        >
                            {f === "all" ? "All" : TYPE_META[f]?.label || f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Activity Feed */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading && (
                    <div className="text-center p-10 text-gray-400 text-sm">Loading activity...</div>
                )}

                {!loading && filteredLogs.length === 0 && (
                    <div className="text-center p-10 text-gray-400 text-sm">
                        No activity found.
                    </div>
                )}

                {!loading && filteredLogs.length > 0 && (
                    <ul className="divide-y divide-gray-50">
                        {filteredLogs.map((log) => {
                            const meta = TYPE_META[log.type] || {
                                label: log.type || "Activity",
                                icon: ActivityIcon,
                                color: "text-gray-600 bg-gray-100",
                            };
                            const Icon = meta.icon;
                            const isSystem = log.userName === "System" || log.role === "automated";
                            return (
                                <li key={log.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-900">{log.message}</p>
                                        {log.details && (
                                            <p className="text-xs text-gray-500 mt-0.5">{log.details}</p>
                                        )}
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {isSystem ? (
                                                <span className="font-medium text-gray-500">System</span>
                                            ) : (
                                                log.userName || log.userEmail || "Unknown"
                                            )}
                                            {log.role && !isSystem ? ` · ${log.role}` : ""}
                                        </p>
                                    </div>
                                    <div className="text-xs text-gray-400 flex-shrink-0 text-right">
                                        {formatTimestamp(log.timestamp)}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {!loading && filteredLogs.length > 0 && (
                    <div className="px-6 py-3 text-xs text-gray-400 border-t border-gray-50">
                        Showing {filteredLogs.length} of {logs.length} recent events
                    </div>
                )}
            </div>
        </div>
    );
}
