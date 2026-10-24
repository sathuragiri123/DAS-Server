
import { pool } from "../config/database.js";
import { createNotification } from "./notification.service.js";

export const processDueReminders = async () => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `SELECT
                r.id,
                r.appointment_id,
                r.reminder_type,
                a.patient_id,
                a.status AS appointment_status,
                ds.start_time,
                u.name AS doctor_name
             FROM public.appointment_reminder_jobs r
             JOIN public.appointments a
               ON a.id = r.appointment_id
             JOIN public.doctor_slots ds
               ON ds.id = a.slot_id
             JOIN public.users u
               ON u.id = a.doctor_id
             WHERE r.status = 'pending'
               AND r.scheduled_at <= NOW()
               AND a.status IN ('booked', 'confirmed')
             ORDER BY r.scheduled_at
             LIMIT 50
             FOR UPDATE OF r SKIP LOCKED`
        );

        await client.query("COMMIT");

        let processed = 0;

        for (const job of result.rows) {
            const reminderLabel: Record<string, string> = {
                "24_hours": "24 hours",
                "1_hour": "1 hour",
                "15_minutes": "15 minutes",
            };

            try {
                await createNotification({
                    userId: String(job.patient_id),
                    appointmentId: String(job.appointment_id),
                    type: "appointment_reminder",
                    title: "Upcoming Appointment",
                    message: `Your appointment with ${job.doctor_name} starts in ${reminderLabel[job.reminder_type] ?? "soon"}.`,
                });

                await pool.query(
                    `UPDATE public.appointment_reminder_jobs
                     SET status = 'sent',
                         sent_at = NOW(),
                         attempts = attempts + 1,
                         last_error = NULL,
                         updated_at = NOW()
                     WHERE id = $1
                       AND status = 'pending'`,
                    [job.id]
                );

                processed++;
            } catch (error) {
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : "Unknown notification error";

                await pool.query(
                    `UPDATE public.appointment_reminder_jobs
                     SET attempts = attempts + 1,
                         last_error = $2,
                         updated_at = NOW()
                     WHERE id = $1
                       AND status = 'pending'`,
                    [job.id, errorMessage]
                );
            }
        }

        return { processed };
    } finally {
        client.release();
    }
};
