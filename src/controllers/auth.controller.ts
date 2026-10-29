
import type { Request, Response } from "express";
import { loginUser, registerUser, } from "../services/auth.service.js";
import { pool } from "../config/database.js";

export const registerController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { name, email, password } = req.body ?? {};

        if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
            res.status(400).json({
                message: "Name, email, and password are required",
            });
            return;
        }

        const user = await registerUser(name, email, password);

        res.status(201).json({
            message: "Registration successful",
            data: user,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Registration failed";

        if (message === "An account with this email already exists") {
            res.status(409).json({ message });
            return;
        }

        if (message === "Name, email, and password are required" || message === "Password must be at least 8 characters") {
            res.status(400).json({ message });
            return;
        }

        console.error("Registration error:", error);
        res.status(500).json({ message: "Unable to register account" });
    }
};

export const loginController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { email, password } = req.body ?? {};

        if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
            res.status(400).json({
                message: "Email and password are required",
            });
            return;
        }

        const user = await loginUser(email, password);

        req.session.regenerate((sessionError) => {
            if (sessionError) {
                console.error("Session regeneration error:", sessionError);
                res.status(500).json({ message: "Unable to create session" });
                return;
            }

            req.session.userId = user.id;
            req.session.role = user.role;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Session save error:", saveError);
                    res.status(500).json({ message: "Unable to save session" });
                    return;
                }

                res.status(200).json({
                    message: "Login successful",
                    data: user,
                });
            });
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Login failed";

        if (message === "Invalid email or password") {
            res.status(401).json({ message: "Invalid email or password" });
            return;
        }

        if (message === "Your account is inactive") {
            res.status(403).json({ message });
            return;
        }

        console.error("Login error:", error);
        res.status(500).json({ message: "Unable to log in" });
    }
};


export const meController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {

        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.set("Pragma", "no-cache");
        res.set("Expires", "0");

        const userId = req.session.userId;

        if (!userId) {
            res.status(401).json({
                message: "Please log in to continue",
            });
            return;
        }

        const result = await pool.query(
            `SELECT id::text, name, email, role
                FROM public.users
                WHERE id = $1 AND is_active = TRUE`,
            [userId]
        );

        const user = result.rows[0];

        if (!user) {
            res.status(401).json({
                message: "User account is unavailable",
            });
            return;
        }

        res.status(200).json({
            message: "Current user retrieved successfully",
            data: user,
        });
    } catch (error) {
        console.error("Current user error:", error);

        res.status(500).json({
            message: "Unable to retrieve current user",
        });
    }
};

export const logoutController = (
    req: Request,
    res: Response
): void => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error);

            res.status(500).json({
                message: "Unable to logout",
            });
            return;
        }

        res.clearCookie("doctor_appointment_sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
        });

        res.status(200).json({
            message: "Logout successful",
        });
    });
};
