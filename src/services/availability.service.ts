import { pool } from "../config/database.js";

interface CreateAvailabilityInput {
    doctorId: string;
    availabilityDate: string;
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    maxAppointments: number;
}

export const createDoctorAvailability = async (
    input: CreateAvailabilityInput
) => {
    const { doctorId, availabilityDate, startTime, endTime, slotDurationMinutes, maxAppointments, } = input;

    if (!/^\d+$/.test(doctorId)) {
        throw new Error("Invalid doctor ID");
    }

    if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0) {
        throw new Error("Slot duration must be a positive integer");
    }

    if (!Number.isInteger(maxAppointments) || maxAppointments <= 0) {
        throw new Error("Maximum appointments must be a positive integer");
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(availabilityDate) || !Number.isFinite(Date.parse(`${availabilityDate}T00:00:00Z`)) || new Date(`${availabilityDate}T00:00:00Z`).toISOString().slice(0, 10) !== availabilityDate) {
        throw new Error("Invalid availability date");
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
        throw new Error("End time must be after start time");
    }

    if (start.toISOString().slice(0, 10) !== availabilityDate ||
        end.toISOString().slice(0, 10) !== availabilityDate) {
        throw new Error("Availability times must fall on the selected date");
    }

    if (start <= new Date()) {
        throw new Error("Availability must start in the future");
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

    const durationMinutes = (end.getTime() - start.getTime()) / (60 * 1000);

    if (maxAppointments > Math.floor(durationMinutes / slotDurationMinutes)) {
        throw new Error("Maximum appointments exceeds available slots");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const availabilityResult = await client.query(
            `INSERT INTO public.doctor_availability (
        doctor_id,
        availability_date,
        start_time,
        end_time,
        slot_duration_minutes,
        max_appointments,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'available')
      RETURNING id`,
            [
                doctorId,
                availabilityDate,
                start.toISOString(),
                end.toISOString(),
                slotDurationMinutes,
                maxAppointments,
            ]
        );

        const availabilityId = availabilityResult.rows[0].id;

        const slotsToCreate = Math.min(
            Math.floor(durationMinutes / slotDurationMinutes),
            maxAppointments
        );

        for (let i = 0; i < slotsToCreate; i++) {
            const slotStart = new Date(
                start.getTime() + i * slotDurationMinutes * 60 * 1000
            );

            const slotEnd = new Date(
                slotStart.getTime() + slotDurationMinutes * 60 * 1000
            );

            await client.query(
                `INSERT INTO public.doctor_slots (
          doctor_id,
          availability_id,
          start_time,
          end_time,
          status
        )
        VALUES ($1, $2, $3, $4, 'available')`,
                [
                    doctorId,
                    availabilityId,
                    slotStart.toISOString(),
                    slotEnd.toISOString(),
                ]
            );
        }

        await client.query("COMMIT");

        return {
            availabilityId: String(availabilityId),
            doctorId,
            availabilityDate,
            slotDurationMinutes,
            maxAppointments,
            slotsCreated: slotsToCreate,
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};


export const markDoctorAvailabilityUnavailable = async (
    doctorId: string,
    availabilityId: string
) => {
    if (!/^\d+$/.test(doctorId) || !/^\d+$/.test(availabilityId)) {
        throw new Error("Invalid doctor or availability ID");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const availabilityResult = await client.query(
            `SELECT id, doctor_id, status
             FROM public.doctor_availability
             WHERE id = $1 AND doctor_id = $2
             FOR UPDATE`,
            [availabilityId, doctorId]
        );

        if (availabilityResult.rows.length === 0) {
            throw new Error("Availability not found");
        }

        if (availabilityResult.rows[0].status !== "available") {
            throw new Error("Availability is not available");
        }

        const affectedResult = await client.query(
            `SELECT a.id AS appointment_id,
                    a.patient_id,
                    a.slot_id
             FROM public.appointments a
             JOIN public.doctor_slots ds ON ds.id = a.slot_id
             WHERE ds.availability_id = $1
               AND a.status IN ('booked', 'confirmed')
             FOR UPDATE OF a, ds`,
            [availabilityId]
        );

        for (const appointment of affectedResult.rows) {
            await client.query(
                `UPDATE public.appointments
                 SET status = 'cancelled',
                     cancelled_by = $1,
                     cancelled_at = NOW(),
                     cancellation_reason = 'Doctor unavailable',
                     updated_at = NOW()
                 WHERE id = $2`,
                [doctorId, appointment.appointment_id]
            );

            await client.query(
                `UPDATE public.appointment_reminder_jobs
                 SET status = 'cancelled',
                     updated_at = NOW()
                 WHERE appointment_id = $1
                   AND status IN ('pending', 'processing')`,
                [appointment.appointment_id]
            );

            await client.query(
                `INSERT INTO public.notifications (
                    user_id, appointment_id, type, title, message
                 )
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    appointment.patient_id,
                    appointment.appointment_id,
                    "appointment_cancelled",
                    "Appointment Cancelled",
                    "Your doctor is unavailable. Please book another available appointment."
                ]
            );
        }

        await client.query(
            `UPDATE public.doctor_slots
             SET status = 'blocked'
             WHERE availability_id = $1`,
            [availabilityId]
        );

        await client.query(
            `UPDATE public.doctor_availability
             SET status = 'unavailable',
                 updated_at = NOW()
             WHERE id = $1`,
            [availabilityId]
        );

        await client.query("COMMIT");

        return {
            availabilityId,
            appointmentsCancelled: affectedResult.rows.length
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
