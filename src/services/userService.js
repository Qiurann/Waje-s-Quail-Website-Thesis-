import {
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "firebase/firestore";

import { db } from "../firebase";

/* ===========================
   Get All Users
=========================== */

export const getUsers = async () => {

    const snapshot = await getDocs(
        collection(db, "user_access")
    );

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

};

/* ===========================
   Get Single User
=========================== */

export const getUser = async (email) => {

    const ref = doc(db, "user_access", email);

    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    return {

        id: snap.id,

        ...snap.data()

    };

};

/* ===========================
   Add User
=========================== */

export const addUser = async (user) => {

    const ref = doc(db, "user_access", user.email);

    const exist = await getDoc(ref);

    if (exist.exists()) {

        throw new Error("User already exists.");

    }

    await setDoc(ref, {

        name: user.name,

        email: user.email,

        birthday: user.birthday,

        address: {

            street: user.street,

            city: user.city,

            state: user.state,

            postalCode: user.postalCode

        },

        role: "staff",

        status: "invited",

        setupCompleted: false,

        profilePic: "",

        invitedAt: serverTimestamp(),

        invitedBy: "Owner"

    });

};

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
   Deactivate User
=========================== */

export const deactivateUser = async (

    email

) => {

    await updateDoc(

        doc(db, "user_access", email),

        {

            status: "inactive"

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