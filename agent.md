College CRM – Master Development Notes
Project Overview

Build a centralized College CRM System for internal management of multiple colleges under one organization.

This is NOT a multi-tenant SaaS.

The system will manage leads for all colleges from a single platform, while allowing management to track:

Which college owns which leads
Lead statuses and movement
Admissions performance
Counsellor activities
Campaign sources
Conversion analytics

The platform should provide a single unified dashboard for management across all colleges.

Tech Stack
Frontend
Framework: Next.js (App Router)
Language: TypeScript
UI Library: Shadcn/UI 
Styling: Tailwind CSS
Charts: Shadcn-compatible chart components
Tables: Shadcn Data Table
Date & Time Pickers: Shadcn components only
Backend
Supabase: ( ## You can use Supabase MCP)
PostgreSQL
Authentication
Realtime
Storage
Row Level Security (if required later)
State & Data
React Query / TanStack Query
Zustand (optional for UI state)
Important UI Rules
STRICT UI RULES

ALWAYS use:

Shadcn components
Shadcn dialogs
Shadcn sheets
Shadcn dropdowns
Shadcn tables
Shadcn calendar/date picker
Shadcn chart components
Shadcn forms
Shadcn toast notifications

DO NOT:

Build custom UI components unless absolutely necessary
Mix multiple UI libraries
Use Material UI / Ant Design / Chakra UI
Use random Tailwind-only UI without Shadcn structure

UI must remain:

Consistent
Minimal
Enterprise-grade
Fast
Responsive
Clean dashboard-oriented design
Core CRM Modules

1. Authentication & Roles
Roles
Super Admin
Management
Admission Manager
Counsellor
Marketing Team
Staff Viewer
Features
Login
Role-based access
Password reset
Activity logging

2. College Management

Manage all colleges inside one CRM.

College Fields
College Name
Logo
Address
Contact Details
Website
Courses Offered
Admission Capacity
Active Status
Features
Add/Edit college
Assign users to college
View leads by college
College performance analytics

3. Lead Management

Main CRM module.

Lead Fields
Name
Phone
Email
City
Interested Course
Interested College
Source
Status
Assigned Counsellor
Notes
Follow-up Date
Lead Score
Documents
Lead Status Examples
New
Contacted
Interested
Follow-up Pending
Not Interested
Admission Confirmed
Lost
Features
Create lead
Import CSV
Bulk upload
Lead filtering
Lead search
Duplicate detection
Timeline activity
Notes history
Attachments
Lead transfer between colleges

4. Lead Assignment System
Features
Auto assignment
Manual assignment
Round-robin assignment
Counsellor workload balancing
Reassign leads

5. Follow-up & Task System
Features
Follow-up reminders
Call scheduling
Meeting scheduling
Task dashboard
Daily activity tracking
Pending follow-up alerts

6. Communication Module
Channels
WhatsApp
Email
SMS
Features
Message templates
Campaign sending
Communication history
Delivery tracking
Lead conversation timeline

7. Dashboard & Analytics
Management Dashboard

Show:

Total leads
Leads by college
Leads by source
Conversion rates
Counsellor performance
Daily admissions
Revenue projections
Campaign performance
Charts

Use ONLY Shadcn-compatible chart systems.

Recommended Charts
Bar chart
Area chart
Pie chart
Funnel chart
Line chart

8. Marketing Source Tracking
Sources
Facebook Ads
Google Ads
Organic SEO
WhatsApp Campaigns
Referral
Walk-in
Events
Features
ROI tracking
Source-wise conversion
Campaign performance
CPL analytics

9. Admission Pipeline

Track student admission journey.

Stages

Inquiry Recevied
Contacted
Counselling Done
Registration form Submitted
Reg Fees Paid
