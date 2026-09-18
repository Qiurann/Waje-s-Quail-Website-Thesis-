import {
    collection,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    deleteDoc
} from "firebase/firestore";

import { db } from "../firebase";

/* ===========================
   Get All Users
=========================== */

export const getUsers = async () => {

    const snapshot = await getDocs(
        collection(db, "user_access")
    );

    // user_access documents carry a plaintext `password` field (see
    // Login.jsx). Nothing on the User Management page displays or needs
    // it, so it's dropped here rather than left sitting in the browser's
    // in-memory state (and inspectable via React/Redux devtools) for
    // every staff member on every page load.
    return snapshot.docs.map(doc => {
        const { password: _password, ...safeData } = doc.data();
        return {
            id: doc.id,
            ...safeData
        };
    });

};

/* ===========================
   Get Single User
=========================== */

export const getUser = async (email) => {

    const ref = doc(db, "user_access", email);

    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    // See getUsers() above for why the plaintext password field is
    // dropped here rather than passed through to the caller.
    const { password: _password, ...safeData } = snap.data();

    return {

        id: snap.id,

        ...safeData

    };

};

// NOTE: staff account creation ("Invite/Add User") is a mobile-only flow —
// see NavigationHelper.savePendingUser() in the Android app. The website no
// longer creates staff accounts, only manages (approve/deactivate/edit/
// delete) the ones invited from mobile.

/* ===========================
   Update User
=========================== */

export const updateUser = async (

    email,

    data

) => {

    await updateDoc(

        doc(db, "user_access", email),

        data

    );

};

/* ===========================
   Approve User
=========================== */

export const approveUser = async (

    email

) => {

    await updateDoc(

        doc(db, "user_access", email),

        {

            status: "approved"

        }

    );

};

/* ===========================
   Deactivate User — shown in the UI as the "Deactivated" status
   (replacing the old separate approved/pending/invited status +
   Active/Inactive mobile-access toggle with one combined status).
   Deactivated accounts cannot sign in to the mobile app. Website login
   is owner-only and unaffected by this flag.
=========================== */

export const deactivateUser = async (

    email

) => {

    await updateDoc(

        doc(db, "user_access", email),

        {

            isActive: false

        }

    );

};

/* ===========================
   Activate User — restores the "Deactivated" status back to an
   active/usable account (mobile app access).
=========================== */

export const activateUser = async (

    email

) => {

    await updateDoc(

        doc(db, "user_access", email),

        {

            isActive: true

        }

    );

};

/* ===========================
   Delete User
=========================== */

export const removeUser = async (

    email

) => {

    await deleteDoc(

        doc(db, "user_access", email)

    );

};