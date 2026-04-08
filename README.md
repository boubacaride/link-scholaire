# SchoolFlow — Multi-Tenant School Management Platform

A SaaS platform for public and private schools to manage academic operations through role-based dashboards.

## Features

- **5 Role-Based Dashboards** — Platform Admin, School Admin, Teacher, Student, Parent
- **Learning Management System** — Lessons, assignments, classwork with submission tracking
- **Grade Management** — Track scores across all classes and subjects
- **Attendance Tracking** — Daily attendance records with analytics
- **Financial Management** (Private Schools) — Student fees and payroll
- **Real-Time Notifications** — Alerts for grades, submissions, and deadlines
- **Multi-Tenant Architecture** — School-level data isolation with Row-Level Security

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage + RLS)
- **Charts**: Recharts
- **Calendar**: React Big Calendar
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React

## Getting Started

```bash
npm install
npm run dev
```

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Open [http://localhost:3000](http://localhost:3000)

## License

Private — All rights reserved.
