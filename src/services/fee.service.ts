import { pool } from "../config/database.js";

export const calculateConsultationFee = async (
    doctorId: string
) => {
    const doctorResult = await pool.query(
        `SELECT consultation_fee
     FROM public.doctor_profiles dp
     JOIN public.users u ON u.id = dp.user_id
     WHERE u.id = $1
       AND u.role = 'doctor'
       AND u.is_active = TRUE
       AND dp.approval_status = 'approved'`,
        [doctorId]
    );

    if (doctorResult.rows.length === 0) {
        throw new Error("Approved doctor not found");
    }

    const settingsResult = await pool.query(
        `SELECT setting_value
     FROM public.app_settings
     WHERE setting_key = 'commission'`
    );

    if (settingsResult.rows.length === 0) {
        throw new Error("Commission settings not found");
    }

    const doctorFee = Number(doctorResult.rows[0].consultation_fee);
    const commission = settingsResult.rows[0].setting_value;

    const commissionValue = Number(commission.value);

    if (!Number.isFinite(doctorFee) || !Number.isFinite(commissionValue) || doctorFee < 0 || commissionValue < 0 || (commission.mode !== "fixed" && commission.mode !== "percentage")) {
        throw new Error("Invalid fee or commission settings");
    }

    const commissionAmount = commission.mode === "percentage" ? (doctorFee * commissionValue) / 100 : commissionValue;

    return {
        doctorId,
        doctorFee: doctorFee.toFixed(2),
        commissionMode: commission.mode,
        commissionValue,
        commissionAmount: commissionAmount.toFixed(2),
        totalFee: (doctorFee + commissionAmount).toFixed(2),
    };
};