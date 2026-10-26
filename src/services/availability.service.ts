import { pool } from "../config/database.js";

interface CreateAvailabilityInput {
    doctorId: string;
    availabilityDate: string;
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    maxAppointments: number;
}

interface MarkTimeRangeUnavailableInput {
    doctorId: string;
    availabilityDate: string;
    startTime: string;
    endTime: string;
    reason?: string;
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

        const followupsResult = await client.query(
            `SELECT id, appointment_id, patient_id
     FROM public.doctor_unavailability_followups
     WHERE doctor_id = $1
       AND notified_availability_id IS NULL
     ORDER BY id
     FOR UPDATE`,
            [doctorId]
        );

        const notifiedPatients = new Set<string>();

        for (const followup of followupsResult.rows) {
            const patientId = String(followup.patient_id);

            if (!notifiedPatients.has(patientId)) {
                await client.query(
                    `INSERT INTO public.notifications (
                user_id,
                appointment_id,
                type,
                title,
                message
            )
            VALUES ($1, $2, $3, $4, $5)`,
                    [
                        patientId,
                        followup.appointment_id,
                        "new_slots_available",
                        "New Appointment Slots Available",
                        `Your doctor has opened new appointment slots for ${availabilityDate}. Please view the available slots and book one if suitable.`,
                    ]
                );

                notifiedPatients.add(patientId);
            }

            await client.query(
                `UPDATE public.doctor_unavailability_followups
                SET notified_availability_id = $1,
                notified_at = NOW()
                WHERE id = $2`,
                [availabilityId, followup.id]
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
            patientsNotified: notifiedPatients.size,
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

export const markDoctorTimeRangeUnavailable = async (
    input: MarkTimeRangeUnavailableInput
) => {
    const {
        doctorId,
        availabilityDate,
        startTime,
        endTime,
        reason,
    } = input;

    if (!/^\d+$/.test(doctorId)) {
        throw new Error("Invalid doctor ID");
    }

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(availabilityDate) ||
        !Number.isFinite(Date.parse(`${availabilityDate}T00:00:00Z`)) ||
        new Date(`${availabilityDate}T00:00:00Z`)
            .toISOString()
            .slice(0, 10) !== availabilityDate
    ) {
        throw new Error("Invalid availability date");
    }

    if (
        !/^\d{2}:\d{2}$/.test(startTime) ||
        !/^\d{2}:\d{2}$/.test(endTime)
    ) {
        throw new Error("Invalid time format");
    }

    const startParts = startTime.split(":").map(Number);
    const endParts = endTime.split(":").map(Number);

    if (
        startParts[0] > 23 ||
        startParts[1] > 59 ||
        endParts[0] > 23 ||
        endParts[1] > 59
    ) {
        throw new Error("Invalid time format");
    }

    const startMinutes = startParts[0] * 60 + startParts[1];
    const endMinutes = endParts[0] * 60 + endParts[1];

    if (endMinutes <= startMinutes) {
        throw new Error("End time must be after start time");
    }

    const startDateTime = new Date(
        `${availabilityDate}T${startTime}:00+05:30`
    );
    const endDateTime = new Date(
        `${availabilityDate}T${endTime}:00+05:30`
    );

    if (startDateTime <= new Date()) {
        throw new Error("Unavailable period must start in the future");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const availabilityResult = await client.query(
            `SELECT id
             FROM public.doctor_availability
             WHERE doctor_id = $1
               AND availability_date = $2
               AND status = 'available'
               AND start_time < $4
               AND end_time > $3
             FOR UPDATE`,
            [
                doctorId,
                availabilityDate,
                startDateTime.toISOString(),
                endDateTime.toISOString(),
            ]
        );

        if (availabilityResult.rows.length === 0) {
            throw new Error(
                "No available schedule overlaps the selected time range"
            );
        }

        const availabilityIds = availabilityResult.rows.map(
            (row) => String(row.id)
        );

        const overlappingSlots = await client.query(
            `SELECT ds.id, ds.availability_id
             FROM public.doctor_slots ds
             JOIN public.doctor_availability da
               ON da.id = ds.availability_id
             WHERE ds.doctor_id = $1
               AND ds.availability_id = ANY($2::bigint[])
               AND ds.start_time < $4
               AND ds.end_time > $3
             FOR UPDATE OF ds`,
            [
                doctorId,
                availabilityIds,
                startDateTime.toISOString(),
                endDateTime.toISOString(),
            ]
        );

        const slotIds = overlappingSlots.rows.map(
            (row) => String(row.id)
        );

        if (slotIds.length === 0) {
            throw new Error(
                "No appointment slots overlap the selected time range"
            );
        }

        const affectedAppointments = await client.query(
            `SELECT id, patient_id
             FROM public.appointments
             WHERE doctor_id = $1
               AND slot_id = ANY($2::bigint[])
               AND status IN ('booked', 'confirmed')
             FOR UPDATE`,
            [doctorId, slotIds]
        );

        for (const appointment of affectedAppointments.rows) {
            await client.query(
                `UPDATE public.appointments
                 SET status = 'cancelled',
                     cancelled_by = $1,
                     cancelled_at = NOW(),
                     cancellation_reason = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [
                    doctorId,
                    reason?.trim() || "Doctor unavailable",
                    appointment.id,
                ]
            );

            await client.query(
                `UPDATE public.appointment_reminder_jobs
                 SET status = 'cancelled',
                     updated_at = NOW()
                 WHERE appointment_id = $1
                   AND status IN ('pending', 'processing')`,
                [appointment.id]
            );

            await client.query(
                `INSERT INTO public.notifications (
                    user_id,
                    appointment_id,
                    type,
                    title,
                    message
                 )
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    appointment.patient_id,
                    appointment.id,
                    "appointment_cancelled",
                    "Appointment Cancelled",
                    `Your doctor's schedule has changed. Reason: ${reason?.trim() || "Doctor unavailable"
                    }. Please select another available appointment.`,
                ]
            );

            await client.query(
                `INSERT INTO public.doctor_unavailability_followups 
                (appointment_id, patient_id, doctor_id )
                VALUES ($1, $2, $3)
                ON CONFLICT (appointment_id) DO NOTHING`,
                [
                    appointment.id,
                    appointment.patient_id,
                    doctorId,
                ]
            );
        }

        await client.query(
            `UPDATE public.doctor_slots
             SET status = 'blocked'
             WHERE id = ANY($1::bigint[])`,
            [slotIds]
        );

        await client.query("COMMIT");

        return {
            availabilityDate,
            startTime,
            endTime,
            slotsBlocked: slotIds.length,
            appointmentsCancelled: affectedAppointments.rows.length,
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};


export const getMyDoctorAvailability = async (doctorId: string) => {
    if (!/^\d+$/.test(doctorId)) {
        throw new Error("Invalid doctor ID");
    }

    const result = await pool.query(
        `SELECT
            da.id,
            da.availability_date,
            da.start_time,
            da.end_time,
            da.slot_duration_minutes,
            da.max_appointments,
            da.status,
            COUNT(ds.id)::int AS total_slots,
            COUNT(ds.id) FILTER (
                WHERE ds.status = 'available'
            )::int AS available_slots,
            COUNT(ds.id) FILTER (
                WHERE ds.status = 'blocked'
            )::int AS blocked_slots
         FROM public.doctor_availability da
         LEFT JOIN public.doctor_slots ds
            ON ds.availability_id = da.id
         WHERE da.doctor_id = $1
         GROUP BY da.id
         ORDER BY da.availability_date DESC, da.start_time DESC`,
        [doctorId]
    );

    return result.rows;
};
