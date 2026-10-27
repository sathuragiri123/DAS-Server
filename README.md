Doctor Appointment System — Server
Backend API for the Doctor Appointment System. It provides authentication, role-based access, doctor availability, appointment management, prescriptions, notifications, admin settings, and database access.
Tech stack
- Node.js
- Express
- TypeScript
- PostgreSQL
- pg for database access
- express-session for session-based authentication
Confirm the exact dependencies and scripts against server/package.json. This README intentionally does not assume package scripts that may differ in your project.

Prerequisites
- Node.js version supported by the project
- npm
- Access to the configured PostgreSQL database
- Environment variables configured locally
Setup
From the repository root:
cd server
npm install
Create a .env file in the server directory. Use the variable names already referenced by your source code. A typical configuration may look like:
PORT=5000
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=replace_with_a_long_random_secret
CLIENT_URL=http://localhost:5173
NODE_ENV=development
Notes:
- DATABASE_URL should point to your existing PostgreSQL database.
- Use a strong, private SESSION_SECRET.
- If your code uses additional variables (for example, upload/storage credentials), configure those too.
- Never commit .env files, database credentials, session secrets, or private keys.
Run locally
Check server/package.json for the project's exact scripts. Common examples are:
npm run dev
For a production build, if these scripts exist in package.json:
npm run build
npm start
Use the scripts defined by your project rather than adding scripts solely to match these examples.
API and authentication
- The frontend calls the backend through the API helper in client/src/services/api.ts.
- Authentication uses a session cookie. The browser must send credentials with requests, and the server must configure CORS for the frontend origin.
- Protected endpoints should validate the session and enforce role-based authorization on the server. Hiding a page in the frontend is not a substitute for API authorization.
- The /auth/me endpoint (or the route configured in your app) should return the current authenticated user's details for session checks.
The API route prefix and exact endpoints depend on the route mounting in server/src/server.ts (or the project's entry point).
Main application areas
- Authentication and role-based access: patient, doctor, and admin
- Doctor registration and approval
- Doctor availability management
- Appointment booking and status management
- Prescriptions
- Notifications and appointment reminders
- Admin dashboards and configuration
- File uploads, where configured
Database
Configure DATABASE_URL for the existing PostgreSQL database. Do not run destructive schema or reset commands against a shared or production database unless you have a verified backup and intend to reset it.
Security checklist
- Keep .env out of version control.
- Use HTTPS in production.
- Configure CORS with the exact frontend origin.
- Set secure session cookies in production and ensure proxy settings are correct for the hosting provider.
- Use a strong session secret.
- Validate input and authorize each protected API request on the backend.
- If uploads are used in production, store files in persistent object storage or a persistent disk; ephemeral application filesystems may be cleared during redeploys.
- Do not log passwords, session IDs, or sensitive patient data.
Troubleshooting
- Database connection fails: verify DATABASE_URL, network access, and database credentials.
- Browser blocks requests: check CORS origin, credentials settings, and the frontend API base URL.
- Session is not retained: verify cookie settings, HTTPS, credentials: "include" (or the equivalent in the API helper), and cross-origin cookie policy.
- Build or start command fails: inspect the scripts in server/package.json and use the command expected by the hosting platform.
Deployment
Deploy the server as a Node.js web service and configure the environment variables in the hosting provider's dashboard. Set the frontend origin in the server's CORS configuration. Use the actual build/start scripts from server/package.json.
