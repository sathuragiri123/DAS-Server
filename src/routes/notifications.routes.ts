
import { Router } from "express";
import { getUserNotificationsController, markNotificationAsReadController } from "../controllers/notifications.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, getUserNotificationsController);
router.patch("/:notificationId/read", requireAuth, markNotificationAsReadController);

export default router;
