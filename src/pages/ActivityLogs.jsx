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
    Calendar,
    X,
    ZoomIn,
    ZoomOut,
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
    // Maintenance Mode toggled on/off from App Settings — see
    // pages/AppSettings.jsx handleSave.
    maintenance: { label: "Maintenance", icon: Wrench, color: "text-purple-600 bg-purple-100" },
};

// Event types that are recorded elsewhere but intentionally not shown here.
const HIDDEN_TYPES = new Set(["login_failed", "login_locked"]);

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

// Module-based categories shown as sub-filters when the "Deleted" filter is
// active, so deletions are organized by which part of the app they came
// from — matching the app's existing modules. "Staff" covers deleted staff
// accounts (previously labeled "Accounts").
const DELETE_MODULES = ["all", "Inventory", "Staff", "Schedules"];

// Same idea for the "Updated" filter: every edit is tagged with the module
// it came from (Staff profile/status edits, Inventory quantity changes,
// Task edits like an owner extending a deadline) so they can be sorted into
// sub-tabs instead of one long mixed feed. Task ASSIGNMENT/COMPLETION are
// separate top-level types (task_assign/task_complete, own filter tabs) and
// are NOT update events — only actual edits to an existing task (module:
// "Tasks", type: "update") land in this Tasks sub-filter.
const UPDATE_MODULES = ["all", "Staff", "Inventory", "Tasks"];

// Sub-filters for the "Created" filter: a new inventory product (added from
// the mobile app's Feed Inventory screen) lands under "Inventory", and a new
// staff account (invited from the website's User Management or added from
// the mobile app) lands under "Account".
const CREATE_MODULES = ["all", "Inventory", "Account"];

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

// Shared with the date-range filter below — same Firestore-Timestamp-or-
// string handling as formatTimestamp, returned as a Date (or null).
function toDate(ts) {
    if (!ts) return null;
    const date = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    return Number.isNaN(date.getTime()) ? null : date;
}

// Local (not UTC) YYYY-MM-DD, since <input type="date"> works in the
// browser's local timezone and that's also how a person thinks about "today".
function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

const DATE_PRESETS = [
    { key: "all", label: "All time" },
    { key: "today", label: "Today" },
    { key: "7d", label: "Last 7 days" },
    { key: "30d", label: "Last 30 days" },
];

function presetToRange(key) {
    if (key === "all") return { from: "", to: "" };
    const today = new Date();
    const to = toDateInputValue(today);
    if (key === "today") return { from: to, to };
    const days = key === "7d" ? 6 : 29; // inclusive of today
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    return { from: toDateInputValue(start), to };
}

export default function ActivityLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [deleteModule, setDeleteModule] = useState("all");
    const [updateModule, setUpdateModule] = useState("all");
    const [createModule, setCreateModule] = useState("all");
    // Custom range (YYYY-MM-DD strings, matching <input type="date">) — both
    // empty means "all time". datePreset just tracks which quick-pick button
    // (if any) is highlighted; typing a custom date clears it.
    const [datePreset, setDatePreset] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    // Proof-photo lightbox (task_complete images) — stores the base64 data
    // of whichever photo is currently open, or null when closed.
    const [lightboxImage, setLightboxImage] = useState(null);
    const [lightboxZoomed, setLightboxZoomed] = useState(false);

    useEffect(() => {
        if (!lightboxImage) return;
        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                setLightboxImage(null);
                setLightboxZoomed(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [lightboxImage]);

    const applyDatePreset = (key) => {
        setDatePreset(key);
        const { from, to } = presetToRange(key);
        setDateFrom(from);
        setDateTo(to);
    };

    useEffect(() => {
        const unsubscribe = subscribeToAuditTrail((data) => {
            setLogs(data.filter((log) => !HIDDEN_TYPES.has(log.type)));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const filteredLogs = useMemo(() => {
        const term = search.toLowerCase();
        // Bounds are inclusive full days in local time: from 00:00:00.000 of
        // dateFrom through 23:59:59.999 of dateTo.
        const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
        const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

        return logs.filter((log) => {
            const matchesType = filter === "all" || log.type === filter;

            const matchesModule =
                (filter !== "delete" || deleteModule === "all" || log.module === deleteModule) &&
                (filter !== "update" || updateModule === "all" || log.module === updateModule) &&
                (filter !== "create" || createModule === "all" || log.module === createModule);

            const matchesSearch =
                !term ||
                log.userName?.toLowerCase().includes(term) ||
                log.userEmail?.toLowerCase().includes(term) ||
                log.message?.toLowerCase().includes(term) ||
                log.details?.toLowerCase().includes(term);

            const logMs = toDate(log.timestamp)?.getTime() ?? null;
            const matchesDate =
                (!fromMs && !toMs) ||
                (logMs !== null && (!fromMs || logMs >= fromMs) && (!toMs || logMs <= toMs));

            return matchesType && matchesModule && matchesSearch && matchesDate;
        });
    }, [logs, search, filter, deleteModule, updateModule, createModule, dateFrom, dateTo]);

    return (
        <div>
            {/* Search + Filters */}
            <div className="mb-6">
                <div className="relative mb-3">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700" />
                    <input
                        type="text"
                        placeholder="Search by user, action, or details..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 border-2 border-gray-400 rounded-xl bg-white text-gray-900 placeholder-gray-600 focus:ring-2 focus:ring-[#2D5016]/30 focus:border-[#2D5016] outline-none transition-all"
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    {FILTERS.map((f) => (
                        <button
                            key={f}
                            onClick={() => {
                                setFilter(f);
                                if (f !== "delete") setDeleteModule("all");
                                if (f !== "update") setUpdateModule("all");
                                if (f !== "create") setCreateModule("all");
                            }}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                filter === f
                                    ? "bg-[#2D5016] text-white"
                                    : "bg-white border-2 border-gray-400 text-gray-900 hover:bg-gray-50"
                            }`}
                        >
                            {f === "all" ? "All" : TYPE_META[f]?.label || f}
                        </button>
                    ))}
                </div>

                {/* Date range */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Calendar className="w-4 h-4 text-gray-700 flex-shrink-0" />
                    <select
                        value={datePreset === "custom" ? "custom" : datePreset}
                        onChange={(e) => {
                            const key = e.target.value;
                            if (key === "custom") {
                                // Just switch the dropdown into "custom" mode
                                // without touching from/to — the date inputs
                                // below already hold (or will hold) the
                                // actual range.
                                setDatePreset("custom");
                                return;
                            }
                            applyDatePreset(key);
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 border-gray-400 text-gray-900 bg-white focus:ring-2 focus:ring-[#2D5016]/30 focus:border-[#2D5016] outline-none cursor-pointer"
                    >
                        {DATE_PRESETS.map((p) => (
                            <option key={p.key} value={p.key}>
                                {p.label}
                            </option>
                        ))}
                        <option value="custom">Custom range</option>
                    </select>

                    <span className="text-xs text-gray-700 mx-1">from</span>

                    <input
                        type="date"
                        value={dateFrom}
                        max={dateTo || undefined}
                        onChange={(e) => {
                            setDateFrom(e.target.value);
                            setDatePreset("custom");
                        }}
                        className="px-3 py-1.5 rounded-full text-xs border-2 border-gray-400 text-gray-900 bg-white focus:ring-2 focus:ring-[#2D5016]/30 focus:border-[#2D5016] outline-none"
                    />
                    <span className="text-xs text-gray-700">to</span>
                    <input
                        type="date"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => {
                            setDateTo(e.target.value);
                            setDatePreset("custom");
                        }}
                        className="px-3 py-1.5 rounded-full text-xs border-2 border-gray-400 text-gray-900 bg-white focus:ring-2 focus:ring-[#2D5016]/30 focus:border-[#2D5016] outline-none"
                    />

                    {(dateFrom || dateTo) && (
                        <button
                            onClick={() => applyDatePreset("all")}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Deleted section: module sub-filters (Inventory / Staff / Schedules) */}
            {filter === "delete" && (
                <div className="flex gap-2 overflow-x-auto mb-6 -mt-3">
                    {DELETE_MODULES.map((m) => (
                        <button
                            key={m}
                            onClick={() => setDeleteModule(m)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                                deleteModule === m
                                    ? "bg-red-600 border-red-600 text-white"
                                    : "bg-white border-gray-400 text-gray-900 hover:bg-gray-50"
                            }`}
                        >
                            {m === "all" ? "All modules" : m}
                        </button>
                    ))}
                </div>
            )}

            {/* Created section: module sub-filters (Inventory / Account) */}
            {filter === "create" && (
                <div className="flex gap-2 overflow-x-auto mb-6 -mt-3">
                    {CREATE_MODULES.map((m) => (
                        <button
                            key={m}
                            onClick={() => setCreateModule(m)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                                createModule === m
                                    ? "bg-blue-600 border-blue-600 text-white"
                                    : "bg-white border-gray-400 text-gray-900 hover:bg-gray-50"
                            }`}
                        >
                            {m === "all" ? "All modules" : m}
                        </button>
                    ))}
                </div>
            )}

            {/* Updated section: module sub-filters (Staff / Inventory / Tasks) */}
            {filter === "update" && (
                <div className="flex gap-2 overflow-x-auto mb-6 -mt-3">
                    {UPDATE_MODULES.map((m) => (
                        <button
                            key={m}
                            onClick={() => setUpdateModule(m)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                                updateModule === m
                                    ? "bg-amber-600 border-amber-600 text-white"
                                    : "bg-white border-gray-400 text-gray-900 hover:bg-gray-50"
                            }`}
                        >
                            {m === "all" ? "All modules" : m}
                        </button>
                    ))}
                </div>
            )}

            {/* Activity Feed */}
            <div className="bg-white rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
                {loading && (
                    <div className="text-center p-10 text-gray-700 text-sm">Loading activity...</div>
                )}

                {!loading && filteredLogs.length === 0 && (
                    <div className="text-center p-10 text-gray-700 text-sm">
                        No activity found{(dateFrom || dateTo) ? " for this date range" : ""}.
                    </div>
                )}

                {!loading && filteredLogs.length > 0 && (
                    <ul className="divide-y divide-gray-300">
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
                                        <p className="text-sm text-gray-900">
                                            {log.message}
                                            {log.type === "delete" && log.module && (
                                                <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-100 align-middle">
                                                    {log.module}
                                                </span>
                                            )}
                                            {log.type === "update" && log.module && (
                                                <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-100 align-middle">
                                                    {log.module}
                                                </span>
                                            )}
                                            {log.type === "create" && log.module && (
                                                <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 align-middle">
                                                    {log.module}
                                                </span>
                                            )}
                                        </p>
                                        {log.details && (
                                            <p className="text-xs text-gray-700 mt-0.5">{log.details}</p>
                                        )}
                                        {log.type === "task_complete" && log.images && log.images.length > 0 && (
                                            <div className="mt-1.5 flex gap-1.5 flex-wrap">
                                                {log.images.map((img, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => {
                                                            setLightboxImage(img);
                                                            setLightboxZoomed(false);
                                                        }}
                                                        className="block"
                                                        title="View proof photo"
                                                    >
                                                        <img
                                                            src={`data:image/jpeg;base64,${img}`}
                                                            alt="Proof of completion"
                                                            className="w-12 h-12 rounded-lg object-cover border-2 border-gray-400 hover:opacity-80 transition-opacity"
                                                        />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-gray-700 mt-0.5">
                                            {isSystem ? (
                                                <span className="font-semibold text-gray-900">System</span>
                                            ) : (
                                                log.userName || log.userEmail || "Unknown"
                                            )}
                                            {log.role && !isSystem ? ` · ${log.role}` : ""}
                                            {log.device && !isSystem ? ` · ${log.device}` : ""}
                                        </p>
                                    </div>
                                    <div className="text-xs text-gray-800 flex-shrink-0 text-right">
                                        {formatTimestamp(log.timestamp)}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {!loading && filteredLogs.length > 0 && (
                    <div className="px-6 py-3 text-xs text-gray-800 border-t-2 border-gray-300">
                        Showing {filteredLogs.length} of {logs.length} recent events
                    </div>
                )}
            </div>

            {/* Proof-photo lightbox — click the thumbnail to open, click the
                image (or the zoom button) to toggle between fit-to-screen and
                full size, click the backdrop / X / Escape to close. */}
            {lightboxImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => {
                        setLightboxImage(null);
                        setLightboxZoomed(false);
                    }}
                >
                    <button
                        type="button"
                        onClick={() => {
                            setLightboxImage(null);
                            setLightboxZoomed(false);
                        }}
                        className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
                        title="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setLightboxZoomed((z) => !z);
                        }}
                        className="absolute top-4 left-4 flex items-center gap-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full px-3 py-2 text-xs font-medium transition-colors"
                        title={lightboxZoomed ? "Zoom out" : "Zoom in"}
                    >
                        {lightboxZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                        {lightboxZoomed ? "Zoom out" : "Zoom in"}
                    </button>

                    <div
                        className={`max-w-[95vw] max-h-[90vh] ${lightboxZoomed ? "overflow-auto" : "overflow-hidden"}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={`data:image/jpeg;base64,${lightboxImage}`}
                            alt="Proof of completion"
                            onClick={() => setLightboxZoomed((z) => !z)}
                            className={
                                lightboxZoomed
                                    ? "max-w-none h-auto cursor-zoom-out"
                                    : "max-w-[95vw] max-h-[90vh] object-contain cursor-zoom-in rounded-lg"
                            }
                        />
                    </div>
                </div>
            )}
        </div>
    );
}