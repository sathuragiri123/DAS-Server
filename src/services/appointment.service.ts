
import { pool } from "../config/database.js";
import { createNotification } from "./notification.service.js";
import { scheduleAppointmentReminders } from "./reminder.service.js";

interface BookAppointmentInput {
    patientId: string;
    doctorId: string;
    slotId: string;
}

const isDuplicateActiveSlotError = (error: unknown): boolean => {
    if (typeof error === "object" && error !== null && "code" in error && "constraint" in error) {
        const dbError = error as {
            code: string;
            constraint: string;
        };

        return (
            dbError.code === "23505" &&
            dbError.constraint === "appointments_active_slot_unique"
        );
    }

    return false;
};


export const bookAppointment = async ({
    patientId,
    doctorId,
    slotId,
}: BookAppointmentInput) => {
    if (!/^\d+$/.test(patientId) || !/^\d+$/.test(doctorId) || !/^\d+$/.test(slotId)) {
        throw new Error("Invalid patient, doctor, or slot ID");
    }

    const patientResult = await pool.query(
        `SELECT id
     FROM public.users
     WHERE id = $1
       AND role = 'patient'
       AND is_active = TRUE`,
        [patientId]
    );

    if (patientResult.rows.length === 0) {
        throw new Error("Active patient not found");
    }

    const slotResult = await pool.query(
        `SELECT
       ds.id,
       ds.doctor_id,
       ds.status AS slot_status,
       da.status AS availability_status,
       ds.start_time
     FROM public.doctor_slots ds
     JOIN public.doctor_availability da
       ON da.id = ds.availability_id
      AND da.doctor_id = ds.doctor_id
     JOIN public.doctor_profiles dp
       ON dp.user_id = ds.doctor_id
     JOIN public.users u
       ON u.id = ds.doctor_id
     WHERE ds.id = $1
       AND ds.doctor_id = $2
       AND u.role = 'doctor'
       AND u.is_active = TRUE
       AND dp.approval_status = 'approved'`,
        [slotId, doctorId]
    );

    if (slotResult.rows.length === 0) {
        throw new Error("Available doctor slot not found");
    }

    const slot = slotResult.rows[0];

    if (slot.slot_status !== "available" || slot.availability_status !== "available") {
        throw new Error("Slot is not available");
    }

    if (new Date(slot.start_time).getTime() <= Date.now()) {
        throw new Error("Cannot book a slot in the past");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const lockedSlotResult = await client.query(
            `SELECT
         ds.id,
         ds.doctor_id,
         ds.status AS slot_status,
         da.status AS availability_status,
         ds.start_time
       FROM public.doctor_slots ds
       JOIN public.doctor_availability da
         ON da.id = ds.availability_id
        AND da.doctor_id = ds.doctor_id
       WHERE ds.id = $1
         AND ds.doctor_id = $2
       FOR UPDATE OF ds, da`,
            [slotId, doctorId]
        );

        if (lockedSlotResult.rows.length === 0) {
            throw new Error("Available doctor slot not found");
        }

        const lockedSlot = lockedSlotResult.rows[0];

        if (lockedSlot.slot_status !== "available" || lockedSlot.availability_status !== "available") {
            throw new Error("Slot is not available");
        }

        if (new Date(lockedSlot.start_time).getTime() <= Date.now()) {
            throw new Error("Cannot book a slot in the past");
        }

        const existingAppointment = await client.query(
            `SELECT id
       FROM public.appointments
       WHERE slot_id = $1
         AND status IN ('booked', 'confirmed')
       LIMIT 1`,
            [slotId]
        );

        if (existingAppointment.rows.length > 0) {
            throw new Error("Slot is already booked");
        }

        const feeResult = await client.query(
            `SELECT
         dp.consultation_fee,
         s.setting_value AS commission
       FROM public.doctor_profiles dp
       JOIN public.users u ON u.id = dp.user_id
       CROSS JOIN public.app_settings s
       WHERE dp.user_id = $1
         AND u.role = 'doctor'
         AND u.is_active = TRUE
         AND dp.approval_status = 'approved'
         AND s.setting_key = 'commission'`,
            [doctorId]
        );

        if (feeResult.rows.length === 0) {
            throw new Error("Doctor fee or commission settings not found");
        }

        const doctorFee = Number(feeResult.rows[0].consultation_fee);
        const commission = feeResult.rows[0].commission;
        const commissionValue = Number(commission.value);

        if (!Number.isFinite(doctorFee) || doctorFee < 0 || !Number.isFinite(commissionValue) || commissionValue < 0 || (commission.mode !== "fixed" && commission.mode !== "percentage") || (commission.mode === "percentage" && commissionValue > 100)) {
            throw new Error("Invalid fee or commission settings");
        }

        const commissionFee = commission.mode === "percentage" ? (doctorFee * commissionValue) / 100 : commissionValue;

        const totalFee = doctorFee + commissionFee;

        const appointmentResult = await client.query(
            `INSERT INTO public.appointments (
         patient_id,
         doctor_id,
         slot_id,
         doctor_fee,
         commission_fee,
         total_fee,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'booked')
       RETURNING id, patient_id, doctor_id, slot_id,
                 doctor_fee, commission_fee, total_fee, status`,
            [
                patientId,
                doctorId,
                slotId,
                doctorFee.toFixed(2),
                commissionFee.toFixed(2),
                totalFee.toFixed(2),
            ]
        );

        await client.query(
            `UPDATE public.doctor_slots
       SET status = 'booked'
       WHERE id = $1`,
            [slotId]
        );

        await client.query("COMMIT");

        const bookedAppointment = appointmentResult.rows[0];

        try {
            await scheduleAppointmentReminders(
                String(bookedAppointment.id),
                lockedSlot.start_time
            );
        } catch (error) {
            console.error(
                "Failed to schedule appointment reminders:",
                error
            );
        }

        try {
            await createNotification({
                userId: String(patientId),
                appointmentId: String(bookedAppointment.id),
                type: "appointment_booked",
                title: "Appointment Confirmed",
                message: "Your doctor appointment has been booked successfully.",
            });
        } catch (error) {
            console.error("Failed to create booking notification:", error);
        }

        return bookedAppointment;
    } catch (error) {
        await client.query("ROLLBACK");

        if (isDuplicateActiveSlotError(error)) {
            throw new Error("Slot is already booked");
        }

        throw error;
    } finally {
        client.release();
    }
};



export const getPatientAppointments = async (patientId: string) => {
    if (!/^\d+$/.test(patientId)) {
        throw new Error("Invalid patient ID");
    }

    const result = await pool.query(
        `SELECT
       a.id AS appointment_id,
       a.doctor_id,
       u.name AS doctor_name,
       dp.specialization,
       dp.qualification,
       a.slot_id,
       ds.start_time,
       ds.end_time,
       da.availability_date,
       a.doctor_fee,
       a.commission_fee,
       a.total_fee,
       a.status,
       a.created_at
     FROM public.appointments a
     JOIN public.users u
       ON u.id = a.doctor_id
     JOIN public.doctor_profiles dp
       ON dp.user_id = a.doctor_id
     JOIN public.doctor_slots ds
       ON ds.id = a.slot_id
      AND ds.doctor_id = a.doctor_id
     JOIN public.doctor_availability da
       ON da.id = ds.availability_id
      AND da.doctor_id = ds.doctor_id
     WHERE a.patient_id = $1
     ORDER BY ds.start_time DESC`,
        [patientId]
    );

    return result.rows.map((appointment) => ({
        appointmentId: String(appointment.appointment_id),
        doctorId: String(appointment.doctor_id),
        doctorName: appointment.doctor_name,
        specialization: appointment.specialization,
        qualification: appointment.qualification,
        slotId: String(appointment.slot_id),
        appointmentDate: appointment.availability_date,
        startTime: appointment.start_time,
        endTime: appointment.end_time,
        doctorFee: appointment.doctor_fee,
        commissionFee: appointment.commission_fee,
        totalFee: appointment.total_fee,
        status: appointment.status,
        bookedAt: appointment.created_at,
    }));
};


export const completeAppointment = async (
    doctorId: string,
    appointmentId: string
) => {
    if (!/^\d+$/.test(doctorId) || !/^\d+$/.test(appointmentId)) {
        throw new Error("Invalid doctor or appointment ID");
    }

    const result = await pool.query(
        `UPDATE public.appointments AS a
     SET status = 'completed',
         updated_at = NOW()
     FROM public.doctor_slots AS ds
     WHERE a.id = $1
       AND a.doctor_id = $2
       AND a.slot_id = ds.id
       AND ds.end_time <= NOW()
       AND a.status IN ('booked', 'confirmed')
     RETURNING a.id, a.patient_id, a.doctor_id, a.status`,
        [appointmentId, doctorId]
    );


    if (result.rows.length === 0) {

        const existing = await pool.query(
            `SELECT a.id, a.doctor_id, a.status, ds.end_time
     FROM public.appointments AS a
     JOIN public.doctor_slots AS ds ON ds.id = a.slot_id
     WHERE a.id = $1`,
            [appointmentId]
        );


        if (existing.rows.length === 0) {
            throw new Error("Appointment not found");
        }

        if (String(existing.rows[0].doctor_id) !== doctorId) {
            throw new Error("Appointment does not belong to this doctor");
        }

        if (
            new Date(existing.rows[0].end_time).getTime() > Date.now()
        ) {
            throw new Error(
                "Appointment cannot be completed before its scheduled end time"
            );
        }

        throw new Error(
            "Appointment cannot be completed from its current status"
        );
    }

    const appointment = result.rows[0];

    try {
        await createNotification({
            userId: String(appointment.patient_id),
            appointmentId: String(appointment.id),
            type: "appointment_completed",
            title: "Appointment Completed",
            message: "Your doctor has marked the appointment as completed.",
        });
    } catch (error) {
        console.error(
            "Failed to create appointment completion notification:",
            error
        );
    }

    return {
        appointmentId: String(appointment.id),
        patientId: String(appointment.patient_id),
        doctorId: String(appointment.doctor_id),
        status: appointment.status,
    };
};

export const getDoctorAppointments = async (doctorId: string) => {
    if (!/^\d+$/.test(doctorId)) {
        throw new Error("Invalid doctor ID");
    }

    const result = await pool.query(
        `SELECT
       a.id AS appointment_id,
       a.patient_id,
       p.name AS patient_name,
       a.slot_id,
       ds.start_time,
       ds.end_time,
       da.availability_date,
       a.doctor_fee,
       a.commission_fee,
       a.total_fee,
       a.status,
       a.created_at
     FROM public.appointments a
     JOIN public.users p
       ON p.id = a.patient_id
     JOIN public.doctor_slots ds
       ON ds.id = a.slot_id
      AND ds.doctor_id = a.doctor_id
     JOIN public.doctor_availability da
       ON da.id = ds.availability_id
      AND da.doctor_id = ds.doctor_id
     WHERE a.doctor_id = $1
     ORDER BY ds.start_time ASC`,
        [doctorId]
    );

    return result.rows.map((appointment) => ({
        appointmentId: String(appointment.appointment_id),
        patientId: String(appointment.patient_id),
        patientName: appointment.patient_name,
        slotId: String(appointment.slot_id),
        appointmentDate: appointment.availability_date,
        startTime: appointment.start_time,
        endTime: appointment.end_time,
        doctorFee: appointment.doctor_fee,
        commissionFee: appointment.commission_fee,
        totalFee: appointment.total_fee,
        status: appointment.status,
        bookedAt: appointment.created_at,
    }));
};


export const requestAppointmentReschedule = async (
    patientId: string,
    appointmentId: string,
    proposedSlotId: string
) => {
    if (!/^\d+$/.test(patientId) || !/^\d+$/.test(appointmentId) || !/^\d+$/.test(proposedSlotId)) {
        throw new Error("Invalid patient, appointment, or slot ID");
    }

    const appointmentResult = await pool.query(
        `SELECT
            a.id,
            a.patient_id,
            a.doctor_id,
            a.status,
            ds.start_time
         FROM public.appointments a
         JOIN public.doctor_slots ds ON ds.id = a.slot_id
         WHERE a.id = $1`,
        [appointmentId]
    );

    if (appointmentResult.rows.length === 0) {
        throw new Error("Appointment not found");
    }

    const appointment = appointmentResult.rows[0];

    if (String(appointment.patient_id) !== patientId) {
        throw new Error("Appointment does not belong to this patient");
    }

    if (!["booked", "confirmed"].includes(appointment.status)) {
        throw new Error("Appointment cannot be rescheduled from its current status");
    }

    const startTime = new Date(appointment.start_time).getTime();

    if (startTime - Date.now() < 24 * 60 * 60 * 1000) {
        throw new Error("Appointments cannot be rescheduled within 24 hours");
    }

    const slotResult = await pool.query(
        `SELECT ds.id, ds.doctor_id, ds.start_time, ds.status,
                da.status AS availability_status
         FROM public.doctor_slots ds
         JOIN public.doctor_availability da ON da.id = ds.availability_id
         WHERE ds.id = $1`,
        [proposedSlotId]
    );

    if (slotResult.rows.length === 0) {
        throw new Error("Proposed slot not found");
    }

    const proposedSlot = slotResult.rows[0];

    if (String(proposedSlot.doctor_id) !== String(appointment.doctor_id)) {
        throw new Error("Rescheduling must use the same doctor");
    }

    if (proposedSlot.status !== "available" || proposedSlot.availability_status !== "available" || new Date(proposedSlot.start_time).getTime() <= Date.now()) {
        throw new Error("Proposed slot is not available");
    }

    const existingRequest = await pool.query(
        `SELECT id
         FROM public.appointment_reschedule_requests
         WHERE appointment_id = $1
           AND status = 'pending'`,
        [appointmentId]
    );

    if (existingRequest.rows.length > 0) {
        throw new Error("A reschedule request is already pending");
    }

    const requestResult = await pool.query(
        `INSERT INTO public.appointment_reschedule_requests (
            appointment_id,
            proposed_slot_id,
            status
         )
         VALUES ($1, $2, 'pending')
         RETURNING id, appointment_id, proposed_slot_id, status, created_at`,
        [appointmentId, proposedSlotId]
    );

    return requestResult.rows[0];
};

export const confirmAppointmentReschedule = async (
    patientId: string,
    appointmentId: string,
    requestId: string
) => {
    if (!/^\d+$/.test(patientId) || !/^\d+$/.test(appointmentId) || !/^\d+$/.test(requestId)) {
        throw new Error("Invalid patient, appointment, or request ID");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const requestResult = await client.query(
            `SELECT
                r.id,
                r.appointment_id,
                r.proposed_slot_id,
                r.status AS request_status,
                a.patient_id,
                a.doctor_id,
                a.slot_id AS old_slot_id,
                a.doctor_fee,
                a.commission_fee,
                a.total_fee,
                a.status AS appointment_status,
                old_slot.start_time AS old_start_time
             FROM public.appointment_reschedule_requests r
             JOIN public.appointments a ON a.id = r.appointment_id
             JOIN public.doctor_slots old_slot ON old_slot.id = a.slot_id
             WHERE r.id = $1
               AND r.appointment_id = $2
             FOR UPDATE OF r, a`,
            [requestId, appointmentId]
        );

        if (requestResult.rows.length === 0) {
            throw new Error("Reschedule request not found");
        }

        const request = requestResult.rows[0];

        if (String(request.patient_id) !== patientId) {
            throw new Error("Appointment does not belong to this patient");
        }

        if (request.request_status !== "pending") {
            throw new Error("Reschedule request is not pending");
        }

        if (!["booked", "confirmed"].includes(request.appointment_status)) {
            throw new Error("Appointment cannot be rescheduled from its current status");
        }

        if (new Date(request.old_start_time).getTime() - Date.now() < 24 * 60 * 60 * 1000) {
            throw new Error("Appointments cannot be rescheduled within 24 hours");
        }

        const slotResult = await client.query(
            `SELECT
                ds.id,
                ds.doctor_id,
                ds.start_time,
                ds.status,
                da.status AS availability_status
             FROM public.doctor_slots ds
             JOIN public.doctor_availability da
               ON da.id = ds.availability_id
             WHERE ds.id = $1
             FOR UPDATE OF ds, da`,
            [request.proposed_slot_id]
        );

        if (slotResult.rows.length === 0) {
            throw new Error("Proposed slot not found");
        }

        const slot = slotResult.rows[0];

        if (String(slot.doctor_id) !== String(request.doctor_id)) {
            throw new Error("Rescheduling must use the same doctor");
        }

        if (slot.status !== "available" || slot.availability_status !== "available" || new Date(slot.start_time).getTime() <= Date.now()) {
            throw new Error("Proposed slot is not available");
        }

        const bookingCheck = await client.query(
            `SELECT id
             FROM public.appointments
             WHERE slot_id = $1
               AND status IN ('booked', 'confirmed')
             FOR UPDATE`,
            [request.proposed_slot_id]
        );

        if (bookingCheck.rows.length > 0) {
            throw new Error("Proposed slot is already booked");
        }

        const newAppointmentResult = await client.query(
            `INSERT INTO public.appointments (
                patient_id,
                doctor_id,
                slot_id,
                rescheduled_from_id,
                doctor_fee,
                commission_fee,
                total_fee,
                status
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked')
             RETURNING id, patient_id, doctor_id, slot_id,
                       rescheduled_from_id, doctor_fee,
                       commission_fee, total_fee, status`,
            [
                patientId,
                request.doctor_id,
                request.proposed_slot_id,
                appointmentId,
                request.doctor_fee,
                request.commission_fee,
                request.total_fee
            ]
        );

        const newAppointment = newAppointmentResult.rows[0];

        await client.query(
            `UPDATE public.appointments
             SET status = 'cancelled',
                 cancelled_by = $1,
                 cancelled_at = NOW(),
                 cancellation_reason = 'Rescheduled by patient',
                 updated_at = NOW()
             WHERE id = $2`,
            [patientId, appointmentId]
        );

        await client.query(
            `UPDATE public.doctor_slots
             SET status = 'available'
             WHERE id = $1`,
            [request.old_slot_id]
        );

        await client.query(
            `UPDATE public.doctor_slots
             SET status = 'booked'
             WHERE id = $1`,
            [request.proposed_slot_id]
        );

        await client.query(
            `UPDATE public.appointment_reschedule_requests
             SET status = 'confirmed',
                 responded_at = NOW()
             WHERE id = $1`,
            [requestId]
        );

        await client.query(
            `UPDATE public.appointment_reminder_jobs
             SET status = 'cancelled',
                 updated_at = NOW()
             WHERE appointment_id = $1
               AND status = 'pending'`,
            [appointmentId]
        );

        await client.query("COMMIT");


        try {
            await scheduleAppointmentReminders(
                String(newAppointment.id),
                slot.start_time
            );

            await createNotification({
                userId: patientId,
                appointmentId: String(newAppointment.id),
                type: "appointment_rescheduled",
                title: "Appointment Rescheduled",
                message: "Your appointment has been rescheduled successfully."
            });
        } catch (error) {
            console.error("Failed to schedule reminders or notify patient after rescheduling:", error);
        }
        return newAppointment
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};


export const getDoctorDashboardStats = async (doctorId: string) => {
    if (!/^\d+$/.test(doctorId)) {
        throw new Error("Invalid doctor ID");
    }

    const result = await pool.query(
        `SELECT
            COUNT(*) AS total_appointments,

            COUNT(*) FILTER (
                WHERE a.status IN ('booked', 'confirmed')
                  AND ds.start_time > NOW()
            ) AS upcoming_appointments,

            COUNT(*) FILTER (
                WHERE a.status = 'completed'
            ) AS completed_appointments,

            COUNT(*) FILTER (
                WHERE a.status = 'cancelled'
            ) AS cancelled_appointments,

            COUNT(*) FILTER (
                WHERE a.status = 'no_show'
            ) AS no_show_appointments

         FROM public.appointments a
         JOIN public.doctor_slots ds
           ON ds.id = a.slot_id
         WHERE a.doctor_id = $1`,
        [doctorId]
    );

    const stats = result.rows[0];

    return {
        totalAppointments: Number(stats.total_appointments),
        upcomingAppointments: Number(stats.upcoming_appointments),
        completedAppointments: Number(stats.completed_appointments),
        cancelledAppointments: Number(stats.cancelled_appointments),
        noShowAppointments: Number(stats.no_show_appointments)
    };
};

export const getPatientDashboardStats = async (patientId: string) => {
    if (!/^\d+$/.test(patientId)) {
        throw new Error("Invalid patient ID");
    }

    const result = await pool.query(
        `SELECT
            COUNT(*) AS total_appointments,

            COUNT(*) FILTER (
                WHERE a.status IN ('booked', 'confirmed')
                  AND ds.start_time > NOW()
            ) AS upcoming_appointments,

            COUNT(*) FILTER (
                WHERE a.status = 'completed'
            ) AS completed_appointments,

            COUNT(*) FILTER (
                WHERE a.status = 'cancelled'
            ) AS cancelled_appointments

         FROM public.appointments a
         JOIN public.doctor_slots ds
           ON ds.id = a.slot_id
         WHERE a.patient_id = $1`,
        [patientId]
    );

    const stats = result.rows[0];

    return {
        totalAppointments: Number(stats.total_appointments),
        upcomingAppointments: Number(stats.upcoming_appointments),
        completedAppointments: Number(stats.completed_appointments),
        cancelledAppointments: Number(stats.cancelled_appointments)
    };
};