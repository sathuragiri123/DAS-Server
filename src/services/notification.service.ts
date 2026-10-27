
import { pool } from "../config/database.js";

interface CreateNotificationInput {
    userId: string;
    appointmentId?: string;
    type: string;
    title: string;
    message: string;
}

export const createNotification = async ({
    userId,
    appointmentId,
    type,
    title,
    message,
}: CreateNotificationInput) => {
    if (!/^\d+$/.test(userId)) {
        throw new Error("Invalid notification user ID");
    }

    if (appointmentId !== undefined && !/^\d+$/.test(appointmentId)) {
        throw new Error("Invalid notification appointment ID");
    }

    if (!type.trim() || !title.trim() || !message.trim()) {
        throw new Error("Notification type, title, and message are required");
    }

    const result = await pool.query(
        `INSERT INTO public.notifications (
       user_id,
       appointment_id,
       type,
       title,
       message
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, appointment_id, type,
               title, message, is_read, created_at`,
        [
            userId,
            appointmentId ?? null,
            type.trim(),
            title.trim(),
            message.trim(),
        ]
    );

    const notification = result.rows[0];

    return {
        id: String(notification.id),
        userId: String(notification.user_id),
        appointmentId: notification.appointment_id
            ? String(notification.appointment_id)
            : null,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        isRead: notification.is_read,
        createdAt: notification.created_at,
    };
};

export const getUserNotifications = async (userId: string) => {
    if (!/^\d+$/.test(userId)) {
        throw new Error("Invalid user ID");
    }

    const result = await pool.query(
        `SELECT
            id,
            appointment_id,
            type,
            title,
            message,
            is_read,
            read_at,
            created_at
         FROM public.notifications
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
    );

    return result.rows.map((notification) => ({
        id: String(notification.id),
        appointmentId: notification.appointment_id
            ? String(notification.appointment_id)
            : null,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        isRead: notification.is_read,
        readAt: notification.read_at,
        createdAt: notification.created_at,
    }));
};


export const markNotificationAsRead = async (
    userId: string,
    notificationId: string
) => {
    if (!/^\d+$/.test(userId) || !/^\d+$/.test(notificationId)) {
        throw new Error("Invalid user or notification ID");
    }

    const result = await pool.query(
        `UPDATE public.notifications
         SET is_read = TRUE,
             read_at = NOW()
         WHERE id = $1
           AND user_id = $2
           AND is_read = FALSE
         RETURNING id, is_read, read_at`,
        [notificationId, userId]
    );

    if (result.rows.length === 0) {
        const existing = await pool.query(
            `SELECT id
             FROM public.notifications
             WHERE id = $1
               AND user_id = $2`,
            [notificationId, userId]
        );

        if (existing.rows.length === 0) {
            throw new Error("Notification not found");
        }

        return {
            id: String(existing.rows[0].id),
            isRead: true,
        };
    }

    return {
        id: String(result.rows[0].id),
        isRead: result.rows[0].is_read,
        readAt: result.rows[0].read_at,
    };
};


export const getAdminNotifications = async (adminId: string) => {
    if (!/^\d+$/.test(adminId)) {
        throw new Error("Invalid admin ID");
    }

    const result = await pool.query(
        `SELECT
            id,
            appointment_id,
            type,
            title,
            message,
            is_read,
            read_at,
            created_at
         FROM public.notifications
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [adminId]
    );

    return result.rows.map((notification) => ({
        id: String(notification.id),
        appointmentId: notification.appointment_id
            ? String(notification.appointment_id)
            : null,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        isRead: notification.is_read,
        readAt: notification.read_at,
        createdAt: notification.created_at,
    }));
};
