
import { pool } from "../config/database.js";

export const scheduleAppointmentReminders = async (
    appointmentId: string,
    appointmentStartTime: Date | string
) => {
    if (!/^\d+$/.test(appointmentId)) {
        throw new Error("Invalid appointment ID");
    }

    const startTime = new Date(appointmentStartTime);

    if (Number.isNaN(startTime.getTime())) {
        throw new Error("Invalid appointment start time");
    }

    const reminderTypes = [
        { type: "24_hours", offsetMs: 24 * 60 * 60 * 1000 },
        { type: "1_hour", offsetMs: 60 * 60 * 1000 },
        { type: "15_minutes", offsetMs: 15 * 60 * 1000 },
    ];

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        for (const reminder of reminderTypes) {
            const scheduledAt = new Date(
                startTime.getTime() - reminder.offsetMs
            );

            if (scheduledAt.getTime() <= Date.now()) {
                continue;
            }

            await client.query(
                `INSERT INTO public.appointment_reminder_jobs (
                    appointment_id,
                    reminder_type,
                    scheduled_at
                )
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING`,
                [appointmentId, reminder.type, scheduledAt]
            );
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
