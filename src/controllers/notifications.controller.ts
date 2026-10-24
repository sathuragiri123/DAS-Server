
import type { Request, Response } from "express";
import { getUserNotifications, markNotificationAsRead } from "../services/notification.service.js";

export const getUserNotificationsController = async (
    req: Request,
    res: Response
) => {
    try {
        const userId = String(req.session.userId);

        const notifications = await getUserNotifications(userId);

        res.status(200).json({
            message: "Notifications retrieved successfully",
            data: notifications,
        });
    } catch (error) {
        console.error("Get notifications error:", error);

        res.status(500).json({
            message: "Failed to retrieve notifications",
        });
    }
};


export const markNotificationAsReadController = async (
    req: Request,
    res: Response
) => {
    try {
        const userId = String(req.session.userId);
        const notificationId = String(req.params.notificationId);

        const notification = await markNotificationAsRead(userId, notificationId);

        res.status(200).json({
            message: "Notification marked as read",
            data: notification,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Notification not found") {
            res.status(404).json({
                message: "Notification not found",
            });
            return;
        }

        if (error instanceof Error && error.message === "Invalid user or notification ID") {
            res.status(400).json({
                message: error.message,
            });
            return;
        }

        console.error("Mark notification as read error:", error);

        res.status(500).json({
            message: "Failed to update notification",
        });
    }
};
