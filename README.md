# Attendance Management System (MERN)

A full-stack attendance tracking system with live-selfie + geolocation punch in/out,
role-based dashboards (Employee / Manager / Admin), an overtime approval workflow,
attendance validation, and reporting.

**Stack:** React (Vite) + Redux Toolkit/RTK Query · Node.js + Express · MongoDB (Mongoose) · JWT auth · Winston + Morgan logging.

---

## 1. Project Structure

```
attendance-system/
├── backend/                 # Express REST API
│   ├── config/               # DB connection, Winston logger
│   ├── controllers/          # Route handler logic
│   ├── middleware/           # auth (JWT+RBAC), validation, error handling
│   ├── models/                # User, Attendance, Overtime (Mongoose schemas)
│   ├── routes/                # Express routers per resource
│   ├── utils/                  # helpers (hours calc, tokens, seed script)
│   └── server.js
└── frontend/                 # React + Vite SPA
    └── src/
        ├── app/store.js        # Redux store
        ├── features/api/       # RTK Query API slices (auth/attendance/overtime/user)
        ├── features/auth/      # auth slice (token/user + localStorage)
        ├── components/         # CameraCapture, ProtectedRoute, Layout, etc.
        └── pages/               # Role-specific dashboard pages
```

---

## 2. Local Setup (run this first)

### Prerequisites
- Node.js 18+
- A MongoDB connection string — easiest is a **free MongoDB Atlas cluster** (takes 5 minutes: create account → free M0 cluster → Database Access user → Network Access "Allow from anywhere" → copy connection string).

### Backend
```bash
cd backend
cp .env.example .env
# edit .env and paste your MONGO_URI + a random JWT_SECRET
npm install
npm run seed     # creates admin@demo.com / manager@demo.com / employee@demo.com (password123)
npm run dev       # starts on http://localhost:5000
```

### Frontend
```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:5000/api
npm install
npm run dev              # starts on http://localhost:5173
```

Open `http://localhost:5173`, log in with one of the seeded accounts, and try the flow:
1. Log in as **employee@demo.com** → allow camera + location → Punch In → (optionally) request overtime → Punch Out.
2. Log in as **manager@demo.com** → Team Attendance / Overtime Approvals / Validate Selfies.
3. Log in as **admin@demo.com** → All Users / All Attendance / Overtime Approvals / Validate Selfies / Reports.

> Camera and Geolocation APIs require a **secure context**. `localhost` is exempt from HTTPS requirements, so this works locally over plain HTTP. In production it works automatically because Vercel/Netlify/Render all serve over HTTPS.

---

## 3. Architecture Overview

- **Auth:** JWT issued on login/register, stored in Redux + localStorage, attached via RTK Query's `prepareHeaders`. Backend `protect` middleware verifies the token and loads the user; `authorize(...roles)` enforces RBAC per route.
- **Data model:**
  - `User` — name/email/password(hashed with bcrypt)/role(employee|manager|admin)/manager (self-reference for team grouping).
  - `Attendance` — one document per user per calendar day (`{user, date}` unique index), embedding `punchIn`/`punchOut` (time, selfie, location), computed `totalHours`/`status`, and a `validation` sub-object (status/remarks/verifiedBy).
  - `Overtime` — linked to a specific attendance record, with its own approval workflow status.
- **RBAC is enforced twice:** frontend `ProtectedRoute` hides irrelevant routes/UI per role, and backend middleware independently re-checks every request — the frontend guard is only a UX convenience, never the security boundary.
- **Selfie storage:** captured as a base64 JPEG data URL directly from `getUserMedia` + `<canvas>` (no `<input type="file">` anywhere) and stored inline on the Attendance document. This avoids needing S3/Cloudinary for a 24-hour build — see Assumptions below for the production trade-off.
- **Working hours logic:** `totalHours = punchOut - punchIn` (in hours), and `status` is derived as `Completed` if `>= STANDARD_SHIFT_HOURS` (default 8, configurable via env) else `Incomplete`.
- **Overtime workflow:** Employee submits a request tied to today's attendance → Manager (their own team) or Admin (anyone) approves/rejects with optional remarks → status reflected back on both the Overtime record and visible against that attendance day.
- **Validation workflow:** Manager/Admin view punch-in/out selfies + GPS coordinates and mark each day's attendance `Valid`/`Invalid` with remarks — separate from the `Completed`/`Incomplete` hours status.
- **Reports:** a single `/api/reports/daily` endpoint auto-scopes its query by the requester's role (employee → own records, manager → team, admin → everyone) rather than trusting a client-supplied scope; the frontend table adds CSV and print-to-PDF export on top.
- **Logging:** Morgan logs every HTTP request into Winston, which writes to console + `logs/combined.log` + `logs/error.log`.
- **Error handling:** a single `asyncHandler` wrapper + centralized Express error middleware normalizes Mongoose cast/validation/duplicate-key errors into clean JSON `{success:false, message}` responses.

---

## 4. Features Implemented


- ✅ Register/Login with hashed passwords + JWT, RBAC on both frontend routes and backend endpoints
- ✅ Punch In/Out with live camera selfie (no upload) + geolocation capture
- ✅ Total working hours + Completed/Incomplete status
- ✅ Overtime request → Manager/Admin approve/reject → status reflected on the record
- ✅ Employee / Manager / Admin dashboards
- ✅ Manager/Admin selfie viewing + Valid/Invalid marking + remarks
- ✅ Daily/range attendance report, role-scoped, with selfie/location/hours/status
---

## 5. Deployment

### Backend → Render
1. Push this repo to GitHub.
2. On [render.com](https://render.com) → New → Web Service → connect the repo, root directory `backend`.
3. Build command: `npm install` · Start command: `npm start`.
4. Add environment variables from `.env.example` (MONGO_URI, JWT_SECRET, CLIENT_URL=your Vercel URL, etc).
5. Deploy — note the URL, e.g. `https://your-app.onrender.com`.

### Frontend → Vercel
1. On [vercel.com](https://vercel.com) → New Project → import the repo, root directory `frontend`.
2. Framework preset: Vite. Build command `npm run build`, output dir `dist`.
3. Add environment variable `VITE_API_URL=https://your-app.onrender.com/api`.
4. Deploy — then go back to Render and set `CLIENT_URL` to this Vercel URL so CORS allows it, and redeploy the backend.

### One-time production data
SSH isn't available on Render free tier, so run the seed script locally against your Atlas URI once (`MONGO_URI=<atlas-uri> npm run seed` from `backend/`) to create your first admin/manager/employee accounts, or just sign up through the UI (see Assumptions).

---

## 6. Assumptions Made

1. **Selfies are stored as base64 inline in MongoDB**, not on S3/Cloudinary — acceptable for a 24-hour assessment build and keeps deployment free of extra services, but is not what I'd do for a real production system with high photo volume (would move to object storage + store only the URL).
2. **One attendance record per user per calendar day** (server date, `YYYY-MM-DD`), enforced by a unique compound index — the system assumes a single shift/day rather than multiple punch cycles.
3. **Signup allows self-selecting any role, including admin** — the assessment brief doesn't specify an invite/approval flow for admin accounts, so public signup exposes `employee`/`manager`/`admin` directly rather than gating admin behind a seed script or an existing admin's approval; a real production system would restrict this (invite-only or approval-gated).
4. **A "team" is any employee whose `manager` field points at that manager** — for employees, selecting a manager/admin from the dropdown at signup is required (no "no manager" option), since every employee should report to someone; manager/admin accounts don't select one. Reassignment later is done by an admin.
5. **Overtime requests are tied to the current day's attendance** and require punch-in to already exist; only one pending request per day is allowed.
6. **Geofencing is off by default** since it needs a real office lat/lng — toggle `GEOFENCE_ENABLED=true` and set coordinates/radius in `.env` to enforce it.
7. Standard shift length (8h) and the Completed/Incomplete threshold are the same value, configurable via `STANDARD_SHIFT_HOURS`.

---

## 7. Demo Credentials (after running `npm run seed`)

| Role     | Email              | Password    |
|----------|--------------------|-------------|
| Admin    | admin@demo.com     | password123 |
| Manager  | manager@demo.com   | password123 |
| Employee | employee@demo.com  | password123 |
