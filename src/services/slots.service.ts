
import { pool } from "../config/database.js";

export const getAvailableDoctorSlots = async (
    doctorId: string,
    date: string
) => {
    if (!/^\d+$/.test(doctorId)) {
        throw new Error("Invalid doctor ID");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        throw new Error("Invalid date");
    }

    const doctorResult = await pool.query(
        `SELECT 1
     FROM public.users u
     JOIN public.doctor_profiles dp ON dp.user_id = u.id
     WHERE u.id = $1
       AND u.role = 'doctor'
       AND u.is_active = TRUE
       AND dp.approval_status = 'approved'`,
        [doctorId]
    );

    if (doctorResult.rows.length === 0) {
        throw new Error("Approved doctor not found");
    }

    const result = await pool.query(
        `SELECT
       ds.id AS slot_id,
       ds.start_time,
       ds.end_time,
       CASE
         WHEN da.status <> 'available' THEN 'unavailable'
         WHEN ds.status <> 'available' THEN 'booked'
         WHEN EXISTS (
           SELECT 1
           FROM public.appointments a
           WHERE a.slot_id = ds.id
             AND a.status = 'booked'
         ) THEN 'booked'
         ELSE 'available'
       END AS slot_status
     FROM public.doctor_slots ds
     JOIN public.doctor_availability da
       ON da.id = ds.availability_id
      AND da.doctor_id = ds.doctor_id
     WHERE ds.doctor_id = $1
       AND da.availability_date = $2
     ORDER BY ds.start_time`,
        [doctorId, date]
    );

    return result.rows.map((slot) => ({
        slotId: String(slot.slot_id),
        startTime: slot.start_time,
        endTime: slot.end_time,
        status: slot.slot_status,
    }));
};
