import { pool } from "../config/database.js";

export const getApprovedDoctors = async () => {
    const result = await pool.query(
        `SELECT
        u.id::text AS doctor_id,
        u.name,
        dp.specialization,
        dp.qualification,
        dp.bio,
        dp.consultation_fee
     FROM public.users u
     JOIN public.doctor_profiles dp
       ON dp.user_id = u.id
     WHERE u.role = 'doctor'
       AND u.is_active = TRUE
       AND dp.approval_status = 'approved'
     ORDER BY u.name ASC`
    );

    return result.rows;
};