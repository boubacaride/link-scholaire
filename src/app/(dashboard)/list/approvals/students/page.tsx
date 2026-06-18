"use client";

import ApprovalsDashboard from "@/components/timeoff/ApprovalsDashboard";

// Admin "Student Time-off Approvals" — student requests only (submitted by
// university students themselves or by parents on behalf of K-12 children).
const StudentApprovalsPage = () => <ApprovalsDashboard kind="student" />;

export default StudentApprovalsPage;
