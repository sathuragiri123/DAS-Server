
import "express-session";
import type { UserRole } from "../services/auth.service.js";

declare module "express-session" {
    interface SessionData {
        userId?: string;
        role?: UserRole;
    }
}
