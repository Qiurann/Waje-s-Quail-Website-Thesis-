import { useState } from "react";
import { updateUser } from "../services/userService";
import { logActivity, getCurrentActor } from "../services/activityService";
import { sanitizeNameInput, getNameError } from "../utils/validation";

// The <input type="date"> element only accepts "yyyy-MM-dd". Some existing
// records (saved from elsewhere, e.g. "2026/06/05") don't match that, which
// makes the browser reject the value and log a console error. Normalize
// whatever we get into "yyyy-MM-dd", or drop it if it can't be parsed.
function toDateInputValue(raw) {
    if (!raw) return "";

    if (typeof raw?.toDate === "function") {
        raw = raw.toDate();
    }

    if (raw instanceof Date) {
        if (isNaN(raw.getTime())) return "";
        return raw.toLocaleDateString("en-CA");
    }

    if (typeof raw === "string") {
        const slashMatch = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
        if (slashMatch) {
            return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            return raw;
        }

        const parsed = new Date(raw);
        if (!isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString("en-CA");
        }
    }

    return "";
}

export default function EditUserModal({ user, close, reload }) {

    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({
        name: user.name || "",
        birthday: toDateInputValue(user.birthday),
        role: user.role || "staff",
        // A single status field now represents the whole lifecycle. If the
        // account's mobile access was previously deactivated, that takes
        // priority in the dropdown regardless of the underlying
        // approved/pending/invited value (which is preserved under the
        // hood so it can be restored when the account is re-activated).
        status: user.isActive === false
            ? "deactivated"
            : (user.status === "inactive" ? "approved" : (user.status || "approved")),
        street: user.address?.street || "",
        city: user.address?.city || "",
        state: user.address?.state || "",
        postalCode: user.address?.postalCode || ""
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;

        // Only letters, spaces, hyphens, apostrophes, and periods are
        // allowed in the name field — strip anything else as it's typed
        // (also covers pasted text).
        const nextValue = name === "name" ? sanitizeNameInput(value) : value;

        setForm({
            ...form,
            [name]: type === "checkbox" ? checked : nextValue
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();

        const nameError = getNameError(form.name, "Name");
        if (nameError) {
            alert(nameError);
            return;
        }

        setLoading(true);

        try {

            // "Deactivated" isn't a real lifecycle value on its own — it's
            // the approved/pending/invited status with mobile access turned
            // off. Selecting it just flips isActive off and leaves the
            // underlying status where it was; picking any other option
            // turns access back on and sets that status.
            const isDeactivating = form.status === "deactivated";
            const nextStatus = isDeactivating
                ? (user.status === "inactive" ? "approved" : (user.status || "approved"))
                : form.status;

            const updateData = {
                name: form.name,
                birthday: form.birthday,
                role: form.role,
                status: nextStatus,
                isActive: !isDeactivating,
                address: {
                    street: form.street,
                    city: form.city,
                    state: form.state,
                    postalCode: form.postalCode
                }
            };

            await updateUser(user.email, updateData);

            // Build a human-readable summary of what changed for the audit trail.
            const changedFields = [];
            if (form.name !== (user.name || "")) changedFields.push("name");
            if (form.birthday !== toDateInputValue(user.birthday)) changedFields.push("birthday");
            if (form.role !== (user.role || "staff")) changedFields.push("role");
            const previousEffectiveStatus = user.isActive === false ? "deactivated" : (user.status || "approved");
            if (form.status !== previousEffectiveStatus) changedFields.push("status");
            if (form.street !== (user.address?.street || "")) changedFields.push("street");
            if (form.city !== (user.address?.city || "")) changedFields.push("city");
            if (form.state !== (user.address?.state || "")) changedFields.push("province");
            if (form.postalCode !== (user.address?.postalCode || "")) changedFields.push("postal code");

            const actor = getCurrentActor();

            // TEMP DEBUG — proves whether this exact file is the one running.
            console.log("FIX-V2 ACTIVE — logActivity payload:", {
                type: "update",
                module: "Staff",
                actor,
            });

            logActivity({
                type: "update",
                module: "Staff",
                message: `${actor.userName || actor.userEmail || "Someone"} updated user ${form.name || user.email} (${user.email})`,
                targetUserName: form.name || user.name || "",
                targetUserEmail: user.email,
                details: changedFields.length
                    ? `Changed: ${changedFields.join(", ")}`
                    : "No field changes detected",
                ...actor,
            });

            alert("FIX-V2 ACTIVE — User updated successfully.");
            reload();
            close();

        } catch (err) {
            console.error(err);
            alert("Unable to update user.");
        }

        setLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-8 max-h-[90vh] overflow-y-auto">

                <h2 className="text-2xl font-bold mb-6 text-gray-900">
                    Edit User
                </h2>

                <form
                    onSubmit={handleSave}
                    className="space-y-4"
                >

                    <input
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Full Name"
                        className="w-full border rounded-lg p-3 text-gray-900 placeholder-gray-400"
                    />

                    <input
                        value={user.email}
                        disabled
                        className="w-full border rounded-lg p-3 bg-gray-100 text-gray-700"
                    />

                    <input
                        type="date"
                        name="birthday"
                        value={form.birthday}
                        onChange={handleChange}
                        className="w-full border rounded-lg p-3 text-gray-900"
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <select
                            name="role"
                            value={form.role}
                            onChange={handleChange}
                            className="border rounded-lg p-3 text-gray-900"
                        >
                            <option value="staff">
                                Staff
                            </option>
                        </select>

                        <select
                            name="status"
                            value={form.status}
                            onChange={handleChange}
                            className="border rounded-lg p-3 text-gray-900"
                        >
                            <option value="approved">
                                Approved
                            </option>
                            <option value="deactivated">
                                Deactivated
                            </option>
                        </select>
                    </div>

                    <input
                        name="street"
                        value={form.street}
                        onChange={handleChange}
                        placeholder="Street"
                        className="w-full border rounded-lg p-3 text-gray-900 placeholder-gray-400"
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <input
                            name="city"
                            value={form.city}
                            onChange={handleChange}
                            placeholder="City"
                            className="border rounded-lg p-3 text-gray-900 placeholder-gray-400"
                        />

                        <input
                            name="state"
                            value={form.state}
                            onChange={handleChange}
                            placeholder="Province"
                            className="border rounded-lg p-3 text-gray-900 placeholder-gray-400"
                        />
                    </div>

                    <input
                        name="postalCode"
                        value={form.postalCode}
                        onChange={handleChange}
                        placeholder="Postal Code"
                        className="w-full border rounded-lg p-3 text-gray-900 placeholder-gray-400"
                    />

                    <div className="flex justify-end gap-3 pt-5">
                        <button
                            type="button"
                            onClick={close}
                            className="border rounded-lg px-5 py-2 text-gray-700"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-6 py-2"
                        >
                            {
                                loading
                                    ? "Saving..."
                                    : "Save Changes"
                            }
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}