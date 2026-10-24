import { Router } from "express";
import { registerDoctorController } from "../controllers/doctor.controller.js";
import { certificateUpload } from "../middleware/certificateUpload.middleware.js";
import { getApprovedDoctorsController } from "../controllers/doctorDirectory.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { calculateConsultationFeeController } from "../controllers/fee.controller.js";
import { requireRole } from "../middleware/role.middleware.js";
import { createAvailabilityController } from "../controllers/availability.controller.js";
import { getAvailableDoctorSlotsController } from "../controllers/slots.controller.js";

const router = Router();

router.get("/", requireAuth, getApprovedDoctorsController);
router.get("/:doctorId/fee", requireAuth, calculateConsultationFeeController);
router.post("/availability", requireAuth, requireRole("doctor"), createAvailabilityController);
router.get("/:doctorId/slots", getAvailableDoctorSlotsController);
router.post("/register", certificateUpload.single("certificate"), registerDoctorController);

export default router;