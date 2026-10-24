
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
