import { useState } from "react";
import { addUser } from "../services/userService";
import { logActivity, getCurrentActor } from "../services/activityService";

export default function InviteUserModal({ close, reload }) {

    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({

        name: "",
        email: "",

        birthday: "",

        street: "",
        city: "",
        state: "",
        postalCode: ""

    });

    const handleChange = (e) => {

        setForm({

            ...form,

            [e.target.name]: e.target.value

        });

    };

    const handleSubmit = async (e) => {

        e.preventDefault();

        setLoading(true);

        try {

            await addUser(form);

            const actor = getCurrentActor();

            logActivity({
                type: "create",
                message: `${actor.userName || actor.userEmail || "Someone"} invited a new staff user: ${form.name} (${form.email})`,
                ...actor,
            });

            alert("Invitation created successfully.");

            reload();

            close();

        } catch (err) {

            alert(err.message);

        }

        setLoading(false);

    };

    return (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

            <div className="bg-white rounded-xl shadow-lg w-full max-w-xl p-8">

                <h2 className="text-2xl font-bold mb-6">

                    Invite New User

                </h2>

                <form
                    onSubmit={handleSubmit}
                    className="space-y-4"
                >

                    <input

                        type="text"

                        name="name"

                        placeholder="Full Name"

                        value={form.name}

                        onChange={handleChange}

                        required

                        className="w-full border rounded-lg p-3"

                    />

                    <input

                        type="email"

                        name="email"

                        placeholder="Email"

                        value={form.email}

                        onChange={handleChange}

                        required

                        className="w-full border rounded-lg p-3"

                    />

                    <input

                        type="date"

                        name="birthday"

                        value={form.birthday}

                        onChange={handleChange}

                        className="w-full border rounded-lg p-3"

                    />

                    <input

                        type="text"

                        name="street"

                        placeholder="Street"

                        value={form.street}

                        onChange={handleChange}

                        className="w-full border rounded-lg p-3"

                    />

                    <div className="grid grid-cols-2 gap-3">

                        <input

                            type="text"

                            name="city"

                            placeholder="City"

                            value={form.city}

                            onChange={handleChange}

                            className="border rounded-lg p-3"

                        />

                        <input

                            type="text"

                            name="state"

                            placeholder="Province"

                            value={form.state}

                            onChange={handleChange}

                            className="border rounded-lg p-3"

                        />

                    </div>

                    <input

                        type="text"

                        name="postalCode"

                        placeholder="Postal Code"

                        value={form.postalCode}

                        onChange={handleChange}

                        className="w-full border rounded-lg p-3"

                    />

                    <div className="flex justify-end gap-3 pt-5">

                        <button

                            type="button"

                            onClick={close}

                            className="px-5 py-2 rounded-lg border"

                        >

                            Cancel

                        </button>

                        <button

                            type="submit"

                            disabled={loading}

                            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg"

                        >

                            {

                                loading

                                    ? "Sending..."

                                    : "Send Invitation"

                            }

                        </button>

                    </div>

                </form>

            </div>

        </div>

    );

}
