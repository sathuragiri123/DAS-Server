
import { Router } from "express";
import { getAdminNotificationsController, getUserNotificationsController, markNotificationAsReadController } from "../controllers/notifications.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", requireAuth, getUserNotificationsController);
router.patch("/:notificationId/read", requireAuth, markNotificationAsReadController);
router.get("/admin", requireAuth, requireRole("admin"), getAdminNotificationsController);

export default router;
