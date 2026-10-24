import { Router } from "express";
import { getDoctorCertificateController, getPendingDoctorsController, reviewDoctorCertificateController, reviewDoctorApplicationController, updateCommissionSettingsController } from "../controllers/admin.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/doctors/pending", requireAuth, requireRole("admin"), getPendingDoctorsController);
router.get("/doctors/certificates/:certificateId", requireAuth, requireRole("admin"), getDoctorCertificateController);
router.patch("/doctors/certificates/:certificateId/review", requireAuth, requireRole("admin"), reviewDoctorCertificateController);
router.patch("/doctors/:doctorId/review", requireAuth, requireRole("admin"), reviewDoctorApplicationController)
router.patch("/settings/commission", requireAuth, requireRole("admin"), updateCommissionSettingsController);

export default router;