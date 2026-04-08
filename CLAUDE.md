# SchoolFlow - Multi-Tenant School Management Platform

## Project Overview

A SaaS platform enabling public and private schools to manage academic operations through role-based dashboards. Schools pay for subscriptions and receive unique credentials. The platform provides student grade tracking, parent notifications, teacher class management, learning content delivery, and administrative oversight. Private schools also manage student fees and staff payroll.

---

## Tech Stack

- **Frontend**: React Native/Expo (mobile-first), Next.js 14 (admin/web dashboard)
- **Backend**: Node.js with Express (API-first)
- **Database**: Supabase (PostgreSQL with Row-Level Security for multi-tenancy)
- **Authentication**: JWT-based with per-school tenant isolation
- **File Storage**: Supabase Storage or AWS S3 (lessons, assignments, submissions)
- **Payments**: Stripe Connect (school fee collection + payroll disbursements)
- **Notifications**: Email service + SMS gateway
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts
- **Calendar**: React Big Calendar

---

## Architecture

- **Multi-tenant** design with school as primary tenant
- **Row-Level Security (RLS)** for data isolation between schools
- **Role-based access control**: platform admin, school admin, teacher, student, parent
- **School type flag** (`public` / `private`) gates financial features (fees, payroll)
- **Content submission system** with file upload handling
- **API-first backend** serving both mobile (Expo) and web (Next.js) clients

---

## Core Features by Role

### Platform Admin
- School credential provisioning and management
- Subscription billing and access control
- Platform-wide oversight and support

### School Administration (Private Schools Only)
- Employee and teacher management
- View teacher progress and performance metrics
- School account settings
- **Student Fees Tracking** — monitor paid/pending/overdue, payment history
- **Payroll Management** — manage salaries, process disbursements

### Teachers
- Manage assigned classes
- **Create and upload classroom content** — lessons, assignments, classwork
- **Track student submission status** — submitted, pending, overdue
- Grade student assignments and exams with automatic completion marking
- Monitor individual student progress across all classes
- Generate performance reports

### Students
- View grades across all enrolled classes
- **Access class content** — lessons, assignments, classwork posted by teachers
- **Submit assignments and classwork** through the platform
- **Complete online lessons** with completion confirmation (checkmark/badge)
- Track academic performance and submission status

### Parents (Private Schools)
- Link multiple children to single parent account
- Monitor grades for each linked student
- Receive alerts for missing homework and grade changes
- **View student submission status** for assignments and lessons
- View school fee balance, make payments

---

## Learning Management System

### Content Delivery
- Teachers upload lessons, assignments, classwork to specific classes
- Content types: documents, videos, images, text-based lessons
- Students access content in organized feed or calendar view

### Assignment Workflow
1. Teacher creates assignment with due date and submission requirements
2. Students submit work directly through platform
3. System marks assignment as submitted
4. Teacher reviews and grades submissions
5. Automatic notifications to students when graded

### Lesson Workflow
1. Teacher creates online lesson with instructions
2. Students complete lesson activities
3. System marks lesson as completed
4. Completion badge shown to student

### Submission Tracking
- Teacher dashboard shows per-student submission status
- Track overdue, completed, and pending submissions
- Automatic reminders to students for incomplete work

---

## Financial Management (Private Schools Only)

### Student Fees Module
- Track per-student fee amounts and due dates
- Record payment status (paid, pending, overdue)
- Generate fee statements for parents
- Payment history and reconciliation

### Payroll Module
- Manage staff salary structures
- Record teacher and employee payroll
- Process salary disbursements via Stripe Connect
- Track payment history and deductions

---

## Notification System

Parents receive automatic notifications via email and SMS for:
- Missed homework submissions
- Grade decreases or significant drops
- New assignments or lessons posted
- Assignment submission deadlines approaching
- Important school announcements
- School fee payment reminders (private schools)

---

## School Type Configuration

| Feature | Public Schools | Private Schools |
|---|---|---|
| Platform access | Free | Paid subscription |
| Grades & classes | Yes | Yes |
| Content delivery | Yes | Yes |
| Submissions | Yes | Yes |
| Fee tracking | No | Yes |
| Payroll | No | Yes |
| Parent payments | No | Yes |

---

## Key Workflows

1. School signup → specify type (public/private) → admin creates credentials
2. Private school setup → configure fee amounts and payroll structure
3. Teacher creates class → uploads lessons, assignments, classwork
4. Students access content → complete lessons → submit assignments
5. Teacher grades submissions → student receives notification
6. Grade updates and fee reminders trigger parent notifications
7. Payroll processing → salary disbursements through Stripe Connect

---

## Coding Conventions

- Use TypeScript strict mode throughout
- All database queries go through Supabase client with RLS enforced
- All forms use React Hook Form + Zod schemas for validation
- API responses follow consistent shape: `{ data, error, message }`
- File uploads go to Supabase Storage with signed URLs
- Financial amounts stored in cents (integer) — display as dollars
- Dates stored as ISO 8601 timestamps in UTC
- Multi-tenant queries MUST include school_id filter or rely on RLS
- Environment variables for all secrets — never hardcode API keys
- Mobile-first responsive design with Tailwind breakpoints

---

## Project Structure

```
link-scholaire/
├── CLAUDE.md                          # This file
├── next-dashboard-ui-completed/       # Web admin dashboard (Next.js)
│   └── next-dashboard-ui-completed/
│       ├── src/
│       │   ├── app/                   # Next.js app router pages
│       │   ├── components/            # Reusable UI components
│       │   └── lib/                   # Utilities, helpers, types
│       ├── public/                    # Static assets
│       ├── package.json
│       ├── tailwind.config.ts
│       └── tsconfig.json
├── mobile/                            # React Native/Expo app (to be created)
├── api/                               # Express backend API (to be created)
└── supabase/                          # Database migrations & functions (to be created)
```

---

## Next Steps

1. Database schema design — schools, users, classes, content, submissions, grades, fees, payroll
2. Supabase project setup with RLS policies for multi-tenancy
3. Authentication system with role-based JWT tokens
4. File upload and storage integration
5. Stripe Connect integration for fees and payroll
6. Core API endpoints (Express)
7. Web dashboard buildout (Next.js)
8. Mobile app scaffolding (Expo)
9. Notification system (email + SMS)
