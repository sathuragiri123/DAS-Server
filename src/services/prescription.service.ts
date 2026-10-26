
import { pool } from "../config/database.js";
import { createNotification } from "./notification.service.js";

type CreatePrescriptionInput = {
    appointmentId: string;
    doctorId: string;
    diagnosis?: string | null;
    medicines: string;
    instructions?: string | null;
};



export const createPrescription = async (
    input: CreatePrescriptionInput
) => {
    const {
        appointmentId,
        doctorId,
        diagnosis,
        medicines,
        instructions,
    } = input;

    if (!/^\d+$/.test(appointmentId) || !/^\d+$/.test(doctorId)) {
        throw new Error("Invalid appointment or doctor ID");
    }

    if (typeof medicines !== "string" || !medicines.trim()) {
        throw new Error("Medicines are required");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const appointmentResult = await client.query(
            `SELECT id, patient_id, doctor_id, status
             FROM public.appointments
             WHERE id = $1
             FOR UPDATE`,
            [appointmentId]
        );

        if (appointmentResult.rows.length === 0) {
            throw new Error("Appointment not found");
        }

        const appointment = appointmentResult.rows[0];

        if (String(appointment.doctor_id) !== doctorId) {
            throw new Error("Appointment does not belong to this doctor");
        }

        if (!["booked", "confirmed"].includes(appointment.status)) {
            throw new Error(
                "Prescription cannot be added to this appointment status"
            );
        }

        const existingPrescription = await client.query(
            `SELECT id
             FROM public.prescriptions
             WHERE appointment_id = $1`,
            [appointmentId]
        );

        if (existingPrescription.rows.length > 0) {
            throw new Error(
                "A prescription already exists for this appointment"
            );
        }

        const result = await client.query(
            `INSERT INTO public.prescriptions (
                appointment_id,
                patient_id,
                doctor_id,
                diagnosis,
                medicines,
                instructions
             )
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING
                id,
                appointment_id,
                patient_id,
                doctor_id,
                diagnosis,
                medicines,
                instructions,
                created_at,
                updated_at`,
            [
                appointmentId,
                appointment.patient_id,
                doctorId,
                diagnosis?.trim() || null,
                medicines.trim(),
                instructions?.trim() || null,
            ]
        );

        const completedAppointment = await client.query(
            `UPDATE public.appointments
             SET status = 'completed',
                 updated_at = NOW()
             WHERE id = $1
               AND doctor_id = $2
               AND status IN ('booked', 'confirmed')
             RETURNING id`,
            [appointmentId, doctorId]
        );

        if (completedAppointment.rows.length === 0) {
            throw new Error(
                "Appointment could not be marked as completed"
            );
        }

        await client.query("COMMIT");

        try {
            await createNotification({
                userId: String(appointment.patient_id),
                appointmentId: String(appointment.id),
                type: "appointment_completed",
                title: "Appointment Completed",
                message: "Your doctor has marked the appointment as completed.",
            });
        } catch (error) {
            console.error("Failed to create appointment completion notification:", error);
        }

        return result.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};




export const getPatientPrescriptions = async (patientId: string) => {
    if (!/^\d+$/.test(patientId)) {
        throw new Error("Invalid patient ID");
    }

    const result = await pool.query(
        `SELECT
            p.id,
            p.appointment_id,
            p.diagnosis,
            p.medicines,
            p.instructions,
            p.created_at,
            p.updated_at,
            u.name AS doctor_name,
            dp.specialization,
            ds.start_time AS appointment_start_time
         FROM public.prescriptions p
         JOIN public.appointments a
            ON a.id = p.appointment_id
         JOIN public.users u
            ON u.id = p.doctor_id
         JOIN public.doctor_profiles dp
            ON dp.user_id = p.doctor_id
         JOIN public.doctor_slots ds
            ON ds.id = a.slot_id
         WHERE p.patient_id = $1
         ORDER BY p.created_at DESC`,
        [patientId]
    );

    return result.rows;
};
