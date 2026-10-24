
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";

export type UserRole = "patient" | "doctor" | "admin";

export interface PublicUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
}

interface DatabaseUser extends PublicUser {
    password_hash: string;
    is_active: boolean;
}

export const registerUser = async (
    name: string,
    email: string,
    password: string
): Promise<PublicUser> => {
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail || !password) {
        throw new Error("Name, email, and password are required");
    }

    if (password.length < 8) {
        throw new Error("Password must be at least 8 characters");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
        const result = await pool.query<PublicUser>(
            `INSERT INTO public.users (name, email, password_hash, role)
            VALUES ($1, $2, $3, 'patient')
            RETURNING id::text, name, email, role`,
            [normalizedName, normalizedEmail, passwordHash]
        );

        return result.rows[0]!;
    } catch (error: unknown) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
            throw new Error("An account with this email already exists");
        }

        throw error;
    }
};

export const loginUser = async (
    email: string,
    password: string
): Promise<PublicUser> => {
    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query<DatabaseUser>(
        `SELECT
       id::text,
       name,
       email,
       role,
       password_hash,
       is_active
     FROM public.users
     WHERE LOWER(email) = $1
     LIMIT 1`,
        [normalizedEmail]
    );

    const user = result.rows[0];

    if (!user) {
        throw new Error("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
    );

    if (!passwordMatches) {
        throw new Error("Invalid email or password");
    }

    if (!user.is_active) {
        throw new Error("Your account is inactive");
    }

    const { password_hash: _passwordHash, is_active: _isActive, ...publicUser } = user;

    return publicUser;
};
