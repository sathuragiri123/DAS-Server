import { pool } from "../config/database.js";
import { supabase, storageBucket } from "../config/supabase.js";

export const getPendingDoctors = async () => {
    const result = await pool.query(
        `SELECT
        u.id::text AS doctor_id,
        u.name,
        u.email,
        dp.specialization,
        dp.qualification,
        dp.bio,
        dp.consultation_fee,
        dp.approval_status,
        dc.id::text AS certificate_id,
        dc.doctor_name AS certificate_doctor_name,
        dc.specialization AS certificate_specialization,
        dc.certificate_url AS certificate_path,
        dc.review_status AS certificate_review_status,
        dc.created_at AS applied_at
     FROM public.users u
     JOIN public.doctor_profiles dp
       ON dp.user_id = u.id
     LEFT JOIN public.doctor_certificates dc
       ON dc.doctor_id = u.id
     WHERE dp.approval_status = 'pending'
     ORDER BY dc.created_at ASC NULLS LAST`
    );

    return result.rows;
};

export const getDoctorCertificateUrl = async (
    certificatePath: string
): Promise<string> => {

    if (!storageBucket) {
        throw new Error("Storage bucket is not configured");
    }

    const { data, error } = await supabase.storage
        .from(storageBucket)
        .createSignedUrl(certificatePath, 60 * 5);

    if (error || !data?.signedUrl) {
        console.error("Certificate signed URL error:", error?.message);
        throw new Error("Unable to access doctor certificate");
    }

    return data.signedUrl;
};

export const reviewDoctorApplication = async (
    doctorId: string,
    decision: "approved" | "rejected",
    adminId: string
) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const doctorResult = await client.query(
            `SELECT
          u.id,
          dp.approval_status
       FROM public.users u
       JOIN public.doctor_profiles dp
         ON dp.user_id = u.id
       WHERE u.id = $1
         AND u.role = 'doctor'
       FOR UPDATE OF dp`,
            [doctorId]
        );

        if (doctorResult.rows.length === 0) {
            throw new Error("Doctor not found");
        }

        const certificateResult = await client.query(
            `SELECT id, review_status
       FROM public.doctor_certificates
       WHERE doctor_id = $1`,
            [doctorId]
        );

        if (decision === "approved") {
            if (certificateResult.rows.length === 0 || certificateResult.rows.some((certificate) => certificate.review_status !== "approved")) {
                throw new Error(
                    "All doctor certificates must be approved first"
                );
            }
        }

        const updateResult = await client.query(
            `UPDATE public.doctor_profiles
            SET approval_status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $3
       RETURNING user_id::text, approval_status, reviewed_by::text, reviewed_at`,
            [decision, adminId, doctorId]
        );

        await client.query(
            `INSERT INTO public.audit_logs
        (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [
                adminId,
                `doctor_application_${decision}`,
                "doctor_profile",
                doctorId,
                JSON.stringify({
                    previousStatus: doctorResult.rows[0].approval_status,
                    newStatus: decision,
                }),
            ]
        );

        await client.query("COMMIT");

        return {
            ...updateResult.rows[0],
            doctorId: String(doctorId),
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const reviewDoctorCertificate = async (
    certificateId: string,
    decision: "approved" | "rejected",
    adminId: string
) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const certificateResult = await client.query(
            `SELECT id, doctor_id, review_status
       FROM public.doctor_certificates
       WHERE id = $1
       FOR UPDATE`,
            [certificateId]
        );

        if (certificateResult.rows.length === 0) {
            throw new Error("Certificate not found");
        }

        const certificate = certificateResult.rows[0];

        const updateResult = await client.query(
            `UPDATE public.doctor_certificates
       SET review_status = $1,
           reviewed_by = $2,
           reviewed_at = NOW()
       WHERE id = $3
       RETURNING
         id::text,
         doctor_id::text,
         review_status,
         reviewed_by::text,
         reviewed_at`,
            [decision, adminId, certificateId]
        );

        await client.query(
            `INSERT INTO public.audit_logs
        (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [
                adminId,
                `doctor_certificate_${decision}`,
                "doctor_certificate",
                certificateId,
                JSON.stringify({
                    doctorId: String(certificate.doctor_id),
                    previousStatus: certificate.review_status,
                    newStatus: decision,
                }),
            ]
        );

        await client.query("COMMIT");

        return updateResult.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const updateCommissionSettings = async (
    mode: "fixed" | "percentage",
    value: number
) => {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error("Commission value must be a non-negative number");
    }

    if (mode === "percentage" && value > 100) {
        throw new Error("Percentage commission cannot exceed 100");
    }

    const result = await pool.query(
        `UPDATE public.app_settings
     SET setting_value = $1::jsonb,
         updated_at = NOW()
     WHERE setting_key = 'commission'
     RETURNING setting_key, setting_value`,
        [JSON.stringify({ mode, value })]
    );

    if (result.rows.length === 0) {
        throw new Error("Commission settings not found");
    }

    return result.rows[0];
};

export const getAdminDashboardStats = async () => {
    const result = await pool.query(
        `SELECT
            (SELECT COUNT(*)
             FROM public.users
             WHERE role = 'patient'
               AND is_active = TRUE) AS total_patients,

            (SELECT COUNT(*)
             FROM public.users u
             JOIN public.doctor_profiles dp ON dp.user_id = u.id
             WHERE u.role = 'doctor'
               AND u.is_active = TRUE
               AND dp.approval_status = 'approved') AS approved_doctors,

            (SELECT COUNT(*)
             FROM public.doctor_profiles dp
             JOIN public.users u ON u.id = dp.user_id
             WHERE u.role = 'doctor'
               AND dp.approval_status = 'pending') AS pending_doctors,

            (SELECT COUNT(*)
             FROM public.appointments) AS total_appointments,

            (SELECT COUNT(*)
             FROM public.appointments
             WHERE status IN ('booked', 'confirmed')) AS active_appointments,

            (SELECT COUNT(*)
             FROM public.appointments
             WHERE status = 'completed') AS completed_appointments,

            (SELECT COUNT(*)
             FROM public.appointments
             WHERE status = 'cancelled') AS cancelled_appointments`
    );

    const stats = result.rows[0];

    return {
        totalPatients: Number(stats.total_patients),
        approvedDoctors: Number(stats.approved_doctors),
        pendingDoctors: Number(stats.pending_doctors),
        totalAppointments: Number(stats.total_appointments),
        activeAppointments: Number(stats.active_appointments),
        completedAppointments: Number(stats.completed_appointments),
        cancelledAppointments: Number(stats.cancelled_appointments)
    };
};


export const getAdminPatients = async () => {
    const result = await pool.query(
        `SELECT
            id::text AS patient_id,
            name,
            email,
            is_active,
            created_at
         FROM public.users
         WHERE role = 'patient'
         ORDER BY created_at DESC`
    );

    return result.rows;
};

export const getCommissionSettings = async () => {
    const result = await pool.query(
        `SELECT setting_value
         FROM public.app_settings
         WHERE setting_key = 'commission'`
    );

    if (result.rows.length === 0) {
        throw new Error("Commission settings not found");
    }

    const setting = result.rows[0].setting_value;

    return {
        mode: setting.mode,
        value: Number(setting.value),
    };
};