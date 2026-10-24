
import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../services/auth.service.js";

export const requireRole = (...allowedRoles: UserRole[]) => {
    return (
        req: Request,
        res: Response,
        next: NextFunction
    ): void => {
        if (!req.session.userId || !req.session.role) {
            res.status(401).json({
                message: "Please log in to continue",
            });
            return;
        }

        if (!allowedRoles.includes(req.session.role)) {
            res.status(403).json({
                message: "You do not have permission to access this resource",
            });
            return;
        }

        next();
    };
};

