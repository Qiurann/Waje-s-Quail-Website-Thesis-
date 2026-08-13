import { useEffect, useState } from "react";
import { AlertTriangle, Wrench, Smartphone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { subscribeToAppStatus, setMaintenanceMode } from "../services/AppSettings";

const DEFAULT_MESSAGE =
    "We're making some updates to the farm management system. Please check back shortly.";

export default function AppSettings() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    // Nav link is owner-only, but that's just UI — guard the page itself too,
    // since Firestore rules only block a non-owner from *writing* app_status
    // (write: isOwner()), not reading it.
    if (user?.role !== "owner") {
        return (
            <div className="max-w-lg mx-auto text-center p-10">
                <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                    App Settings is only available to the farm owner.
                </p>
            </div>
        );
    }

    return <AppSettingsContent user={user} />;
}

function AppSettingsContent({ user }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [liveEnabled, setLiveEnabled] = useState(false); // what's actually saved
    const [liveMessage, setLiveMessage] = useState(DEFAULT_MESSAGE);
    const [liveUpdatedBy, setLiveUpdatedBy] = useState("");
    const [enabled, setEnabled] = useState(false); // the toggle's current position
    const [message, setMessage] = useState(DEFAULT_MESSAGE);

    useEffect(() => {
        const unsubscribe = subscribeToAppStatus((status) => {
            setLiveEnabled(status.maintenanceMode);
            setLiveMessage(status.message || DEFAULT_MESSAGE);
            setLiveUpdatedBy(status.updatedBy);
            setEnabled(status.maintenanceMode);
            setMessage(status.message || DEFAULT_MESSAGE);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const dirty = enabled !== liveEnabled || message !== liveMessage;

    const handleSave = async () => {
        setSaving(true);
        try {
            await setMaintenanceMode({
                enabled,
                message,
                updatedBy: user?.name || user?.email || "Unknown",
            });
            toast.success(
                enabled ? "Maintenance mode turned on" : "Maintenance mode turned off"
            );
        } catch (error) {
            console.error("Failed to update maintenance mode:", error);
            toast.error("Couldn't save — check your connection and try again.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-center p-10 text-gray-400 text-sm">Loading settings...</div>;
    }

    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">App Settings</h1>
                <p className="text-gray-500 mt-1 text-sm">
                    Controls that apply to the Waje's Quail Farm mobile app.
                </p>
            </div>

            <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-md p-6">
                <div className="flex items-start gap-4">
                    <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                            liveEnabled ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"
                        }`}
                    >
                        <Wrench className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="font-semibold text-gray-900">Maintenance Mode</p>
                                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                                    <Smartphone className="w-3.5 h-3.5" />
                                    Blocks the mobile app's login screen while it's on
                                </p>
                            </div>

                            {/* Toggle */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                onClick={() => setEnabled((v) => !v)}
                                className={`relative inline-flex h-8 w-14 flex-shrink-0 items-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                    enabled
                                        ? "bg-amber-500 border-amber-600 focus:ring-amber-500"
                                        : "bg-gray-300 border-gray-400 focus:ring-gray-400"
                                }`}
                            >
                                <span
                                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${
                                        enabled ? "translate-x-7" : "translate-x-0.5"
                                    }`}
                                />
                            </button>
                        </div>

                        <div
                            className={`mt-2 text-xs font-medium flex items-center gap-1.5 ${
                                liveEnabled ? "text-amber-600" : "text-green-600"
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${liveEnabled ? "bg-amber-500" : "bg-green-500"}`} />
                            Currently {liveEnabled ? "ON — the mobile app is blocked" : "OFF — the mobile app is accessible"}
                            {liveUpdatedBy ? ` · last changed by ${liveUpdatedBy}` : ""}
                        </div>
                    </div>
                </div>

                <div className="mt-5">
                    <label className="text-sm font-medium text-gray-700">
                        Message shown to users
                    </label>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        placeholder={DEFAULT_MESSAGE}
                        className="mt-1.5 w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#2D5016]/30 focus:border-[#2D5016] outline-none transition-all text-sm resize-none"
                    />
                </div>

                {enabled && !liveEnabled && (
                    <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                            Turning this on will immediately stop anyone from logging into the
                            mobile app. Staff already inside the app right now won't be kicked
                            out — this only blocks new sign-ins.
                        </span>
                    </div>
                )}

                <div className="mt-5 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="px-5 py-2.5 rounded-xl text-sm font-medium bg-[#2D5016] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#24400f] transition-colors"
                    >
                        {saving ? "Saving..." : "Save changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}