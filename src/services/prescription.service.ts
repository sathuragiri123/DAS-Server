
import { pool } from "../config/database.js";

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
    const { appointmentId, doctorId, diagnosis, medicines, instructions, } = input;

    if (!/^\d+$/.test(appointmentId) || !/^\d+$/.test(doctorId)) {
        throw new Error("Invalid appointment or doctor ID");
    }

    if (typeof medicines !== "string" || !medicines.trim()) {
        throw new Error("Medicines are required");
    }

    const appointmentResult = await pool.query(
        `SELECT id, patient_id, doctor_id, status
         FROM public.appointments
         WHERE id = $1`,
        [appointmentId]
    );

    if (appointmentResult.rows.length === 0) {
        throw new Error("Appointment not found");
    }

    const appointment = appointmentResult.rows[0];

    if (String(appointment.doctor_id) !== doctorId) {
        throw new Error("Appointment does not belong to this doctor");
    }

    if (appointment.status !== "completed") {
        throw new Error(
            "Prescription can only be added to a completed appointment"
        );
    }

    const existingPrescription = await pool.query(
        `SELECT id
         FROM public.prescriptions
         WHERE appointment_id = $1`,
        [appointmentId]
    );

    if (existingPrescription.rows.length > 0) {
        throw new Error("A prescription already exists for this appointment");
    }

    const result = await pool.query(
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

    return result.rows[0];
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
