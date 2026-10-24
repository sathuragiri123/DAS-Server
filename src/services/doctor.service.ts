
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";

interface RegisterDoctorInput {
    name: string;
    email: string;
    password: string;
    specialization: string;
    qualification: string;
    bio?: string;
    consultationFee: number;
    doctorNameOnCertificate: string;
    certificateSpecialization: string;
    certificatePath: string;
}

export const registerDoctor = async (
    input: RegisterDoctorInput
) => {
    const client = await pool.connect();

    try {
        const name = input.name.trim();
        const email = input.email.trim().toLowerCase();
        const specialization = input.specialization.trim();
        const qualification = input.qualification.trim();

        if (!name || !email || !input.password || !specialization || !qualification || !input.doctorNameOnCertificate.trim() || !input.certificateSpecialization.trim()) {
            throw new Error("All required fields must be provided");
        }

        if (input.password.length < 8) {
            throw new Error("Password must be at least 8 characters");
        }

        if (!Number.isFinite(input.consultationFee) || input.consultationFee < 0) {
            throw new Error("Consultation fee must be a valid non-negative number");
        }

        const passwordHash = await bcrypt.hash(input.password, 12);

        await client.query("BEGIN");

        const userResult = await client.query(
            `INSERT INTO public.users
        (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'doctor')
       RETURNING id::text, name, email, role`,
            [name, email, passwordHash]
        );

        const user = userResult.rows[0];

        await client.query(
            `INSERT INTO public.doctor_profiles
        (
          user_id,
          specialization,
          qualification,
          bio,
          consultation_fee,
          approval_status
        )
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [
                user.id,
                specialization,
                qualification,
                input.bio?.trim() || null,
                input.consultationFee,
            ]
        );

        await client.query(
            `INSERT INTO public.doctor_certificates
        (
          doctor_id,
          doctor_name,
          specialization,
          certificate_url,
          review_status
        )
       VALUES ($1, $2, $3, $4, 'pending')`,
            [
                user.id,
                input.doctorNameOnCertificate.trim(),
                input.certificateSpecialization.trim(),
                input.certificatePath,
            ]
        );

        await client.query("COMMIT");

        return user;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
