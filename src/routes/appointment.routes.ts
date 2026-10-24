
import { Router } from "express";
import { bookAppointmentController, completeAppointmentController, getDoctorAppointmentsController, getPatientAppointmentsController } from "../controllers/appointment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.post("/", requireAuth, requireRole("patient"), bookAppointmentController);
router.get("/my-booking-slots", requireAuth, requireRole("patient"), getPatientAppointmentsController);
router.get("/doctor", requireAuth, requireRole("doctor"), getDoctorAppointmentsController);
router.patch("/:appointmentId/complete", requireAuth, requireRole("doctor"), completeAppointmentController);
export default router;
