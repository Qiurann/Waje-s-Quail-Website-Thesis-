// Shared validation helpers for the Manage User forms (create/update).
// Keep this file the single source of truth for these rules so behavior
// stays consistent everywhere a password or a name is entered.

/* ===========================
   Password validation
=========================== */

const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

// Returns a list of human-readable messages for every unmet requirement.
// An empty array means the password is valid.
export function getPasswordErrors(password) {
    const errors = [];

    if (!password || password.length < 8) {
        errors.push("Password must be at least 8 characters long.");
    }
    if (!/[A-Z]/.test(password)) {
        errors.push("Password must include at least 1 uppercase letter (A-Z).");
    }
    if (!/[a-z]/.test(password)) {
        errors.push("Password must include at least 1 lowercase letter (a-z).");
    }
    if (!/[0-9]/.test(password)) {
        errors.push("Password must include at least 1 number (0-9).");
    }
    if (!SPECIAL_CHAR_REGEX.test(password)) {
        errors.push("Password must include at least 1 special character (e.g. !, @, #, $, %).");
    }

    return errors;
}

export function isPasswordValid(password) {
    return getPasswordErrors(password).length === 0;
}

/* ===========================
   Name validation
   (First Name / Middle Name / Last Name, or a single combined Name field)
=========================== */

// Letters, spaces, hyphen, apostrophe, and period only.
const NAME_CHAR_REGEX = /^[A-Za-z\s'.-]*$/;

// Strips any character that isn't allowed in a name as the user types,
// so numbers/emojis/unrelated symbols never make it into the field.
export function sanitizeNameInput(value) {
    return (value || "").replace(/[^A-Za-z\s'.-]/g, "");
}

// Validates a completed name field (e.g. on submit / paste). Returns an
// error message string, or null if the name is valid.
export function getNameError(value, fieldLabel = "Name") {
    const trimmed = (value || "").trim();

    if (!trimmed) {
        return `${fieldLabel} is required.`;
    }
    if (!NAME_CHAR_REGEX.test(value)) {
        return `${fieldLabel} can only contain letters, spaces, hyphens (-), apostrophes ('), and periods (.).`;
    }

    return null;
}