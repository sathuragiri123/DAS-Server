
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { supabase, storageBucket } from "../config/supabase.js";

const allowedTypes = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
} as const;

export const uploadDoctorCertificate = async (
    file: Express.Multer.File,
): Promise<string> => {

    if (!storageBucket) {
        throw new Error("SUPABASE_STORAGE_BUCKET is missing");
    }

    if (!file || !file.buffer || file.buffer.length === 0) {
        throw new Error("A certificate file is required");
    }

    if (file.buffer.length > 5 * 1024 * 1024) {
        throw new Error("Certificate file must not exceed 5 MB");
    }

    const detected = await fileTypeFromBuffer(file.buffer);

    if (!detected || !(detected.mime in allowedTypes)) {
        throw new Error("Certificate must be a valid PDF, JPEG, or PNG file");
    }

    const extension = allowedTypes[detected.mime as keyof typeof allowedTypes];

    const storagePath = `doctor-certificates/${randomUUID()}.${extension}`;

    const { error } = await supabase.storage
        .from(storageBucket)
        .upload(storagePath, file.buffer, {
            contentType: detected.mime,
            upsert: false,
        });

    if (error) {
        console.error("Certificate upload failed:", error.message);
        throw new Error("Unable to upload certificate");
    }

    return storagePath;
};

export const deleteDoctorCertificate = async (
    storagePath: string
): Promise<void> => {

    if (!storageBucket) {
        throw new Error("SUPABASE_STORAGE_BUCKET is missing");
    }

    const { error } = await supabase.storage
        .from(storageBucket)
        .remove([storagePath]);

    if (error) {
        console.error("Certificate cleanup failed:", error.message);
        throw new Error("Unable to clean up uploaded certificate");
    }
};
