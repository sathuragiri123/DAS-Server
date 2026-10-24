
import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/database.js";

export const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const userId = req.session.userId;
    const sessionRole = req.session.role;

    if (!userId || !sessionRole) {
        res.status(401).json({
            message: "Please log in to continue",
        });
        return;
    }

    try {
        const result = await pool.query<{
            role: string;
            is_active: boolean;
        }>(
            `SELECT role, is_active
       FROM public.users
       WHERE id = $1`,
            [userId]
        );

        const user = result.rows[0];

        if (!user || !user.is_active || user.role !== sessionRole) {
            req.session.destroy((error) => {
                if (error) {
                    console.error("Session destruction error:", error);
                }
            });

            res.status(401).json({
                message: "Your session is invalid. Please log in again.",
            });
            return;
        }

        next();
    } catch (error) {
        console.error("Authentication middleware error:", error);

        res.status(500).json({
            message: "Unable to verify your session",
        });
    }
};
