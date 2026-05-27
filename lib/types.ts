export type UserRole =
  | "super_admin"
  | "management"
  | "admission_manager"
  | "counsellor"
  | "marketing"
  | "staff_viewer";

export type LeadStatus =
  | "inquiry_received"
  | "counselling_in_progress"
  | "counselling_completed"
  | "no_response"
  | "not_interested"
  | "invalid"
  | "course_not_started"
  | "registration_unpaid"
  | "registered_paid_reg_fee"
  // Legacy statuses kept for backward compatibility with existing data.
  | "unable_to_reach"
  | "contacted_info_shared"
  | "need_time_follow_up"
  | "refer_to_management"
  | "on_discussions"
  | "registered_closed"
  | "registered_dropped_out";

export type HighestQualification =
  | "o_level"
  | "a_level"
  | "30_year_above"
  | "other";

export type NotInterestedReason =
  | "financial_issues"
  | "employer_issues"
  | "class_schedule_issues"
  | "other";

export type CounsellingCheckKey =
  | "website_details"
  | "mer"
  | "policies"
  | "fee_structure"
  | "attendance";

export type CounsellingChecks = Partial<Record<CounsellingCheckKey, boolean>>;

export type LeadSource =
  | "tiktok_dm"
  | "print_media"
  | "tiktok_ads"
  | "meta_ads"
  | "refer_by_student"
  | "refer_by_assignees_friend"
  | "refer_by_agent"
  | "owwa"
  | "facebook_organic"
  | "website"
  | "direct_calls_whatsapp"
  | "walk_in";

export const DEFAULT_LEAD_SOURCE: LeadSource = "website";

export type FollowUpType =
  | "call"
  | "meeting"
  | "whatsapp"
  | "email"
  | "sms"
  | "task";

export type FollowUpStatus = "pending" | "completed" | "missed" | "cancelled";

export type FollowUpPriority = "low" | "normal" | "high" | "urgent";

export type AdmissionStage =
  | "inquiry_received"
  | "contacted"
  | "counselling_done"
  | "registration_submitted"
  | "reg_fees_paid";

export type AdmissionGoalStatus = "draft" | "active" | "completed" | "cancelled";

export type AdmissionGoalEventType =
  | "lead_qualified"
  | "application_submitted"
  | "admission_confirmed"
  | "visa_approved";

export type ActivityType =
  | "note"
  | "status_change"
  | "assignment"
  | "follow_up"
  | "communication"
  | "document"
  | "system";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface College {
  id: string;
  name: string;
  code: string | null;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  courses: string[];
  admission_capacity: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  college_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  nationality: string | null;
  nationality_other: string | null;
  highest_qualification: HighestQualification | null;
  highest_qualification_other: string | null;
  interested_course: string | null;
  source: LeadSource;
  status: LeadStatus;
  admission_stage: AdmissionStage | null;
  assigned_counsellor: string | null;
  notes: string | null;
  follow_up_date: string | null;
  lead_score: number;
  campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  is_duplicate: boolean;
  counselling_checks: CounsellingChecks;
  counselling_completed_at: string | null;
  not_interested_reason: NotInterestedReason | null;
  not_interested_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUp {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  assigned_user_id: string | null;
  type: FollowUpType;
  followup_type: FollowUpType;
  status: FollowUpStatus;
  scheduled_at: string;
  due_date: string;
  due_time: string;
  priority: FollowUpPriority;
  sequence: number | null;
  completed_at: string | null;
  notes: string | null;
  remarks: string | null;
  outcome: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  user_id: string | null;
  type: ActivityType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AdmissionGoal {
  id: string;
  title: string;
  target_count: number;
  achieved_count: number;
  start_date: string;
  end_date: string;
  course_name: string | null;
  college_id: string | null;
  intake: string | null;
  assigned_users: string[];
  status: AdmissionGoalStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmissionGoalLink {
  id: string;
  goal_id: string;
  lead_id: string;
  matched_by: "auto" | "manual";
  linked_at: string;
}

export interface AdmissionGoalEvent {
  id: string;
  goal_id: string;
  lead_id: string;
  event_type: AdmissionGoalEventType;
  event_at: string;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const ADMIN_ROLES: UserRole[] = [
  "super_admin",
  "management",
  "admission_manager",
];

export function isAdminRole(role: UserRole | null | undefined) {
  if (!role) return false;
  return ADMIN_ROLES.includes(role);
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  management: "Management",
  admission_manager: "Admission Manager",
  counsellor: "Counsellor",
  marketing: "Marketing",
  staff_viewer: "Staff Viewer",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  inquiry_received: "Inquiry Received",
  counselling_in_progress: "Counselling In-Progress",
  counselling_completed: "Counselling Completed",
  no_response: "No Response",
  not_interested: "Not Interested",
  invalid: "Invalid Contact",
  course_not_started: "Inactive Courses",
  registration_unpaid: "Registration (Unpaid)",
  registered_paid_reg_fee: "Registration (Paid)",
  // Legacy labels kept for historical rows.
  unable_to_reach: "Unable to Reach (legacy)",
  contacted_info_shared: "Contacted & Info Shared (legacy)",
  need_time_follow_up: "Need Time: Follow Up (legacy)",
  refer_to_management: "Refer to Management (legacy)",
  on_discussions: "On Discussions (legacy)",
  registered_closed: "Registered Closed (legacy)",
  registered_dropped_out: "Registered & Dropped-out (legacy)",
};

/** Pipeline statuses surfaced in the UI, in pipeline order. Legacy statuses are excluded. */
export const PIPELINE_LEAD_STATUSES: LeadStatus[] = [
  "inquiry_received",
  "counselling_in_progress",
  "counselling_completed",
  "no_response",
  "not_interested",
  "invalid",
  "course_not_started",
  "registration_unpaid",
  "registered_paid_reg_fee",
];

/** Statuses where the lead is considered to have entered counselling at least once. */
export const COUNSELLING_STATUSES: LeadStatus[] = [
  "counselling_in_progress",
  "counselling_completed",
];

/** Status moves where pending follow-ups must be deleted. */
export const STATUSES_THAT_CLEAR_PENDING_FOLLOWUPS: LeadStatus[] = [
  "no_response",
  "not_interested",
  "invalid",
  "course_not_started",
  "registration_unpaid",
  "registered_paid_reg_fee",
];

/** Statuses that do not require an ongoing pending follow-up. */
export const TERMINAL_LEAD_STATUSES: LeadStatus[] = [
  "no_response",
  "not_interested",
  "invalid",
  "unable_to_reach",
  "course_not_started",
  "registration_unpaid",
  "registered_paid_reg_fee",
  "registered_closed",
  "registered_dropped_out",
];

export function isTerminalLeadStatus(status: LeadStatus) {
  return TERMINAL_LEAD_STATUSES.includes(status);
}

export const HIGHEST_QUALIFICATION_LABELS: Record<HighestQualification, string> = {
  o_level: "'O' Level",
  a_level: "'A' Level",
  "30_year_above": "30 Years & Above",
  other: "Other",
};

export const NOT_INTERESTED_REASON_LABELS: Record<NotInterestedReason, string> = {
  financial_issues: "Financial Issues",
  employer_issues: "Employer Issues",
  class_schedule_issues: "Class Schedule Issues",
  other: "Other",
};

export const COUNSELLING_CHECK_LABELS: Record<CounsellingCheckKey, string> = {
  website_details: "Website Details",
  mer: "MER (Merit / Eligibility Requirements)",
  policies: "Policies",
  fee_structure: "Fee Structure",
  attendance: "Attendance Requirements",
};

export const COUNSELLING_CHECK_KEYS: CounsellingCheckKey[] = [
  "website_details",
  "mer",
  "policies",
  "fee_structure",
  "attendance",
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  tiktok_dm: "TikTok DM",
  print_media: "Print Media",
  tiktok_ads: "TikTok Ads",
  meta_ads: "META ads",
  refer_by_student: "Refer by Student",
  refer_by_assignees_friend: "Refer by Assignee's Friend",
  refer_by_agent: "Refer by Agent",
  owwa: "OWWA",
  facebook_organic: "Facebook Organic",
  website: "Website",
  direct_calls_whatsapp: "Direct - Calls/ WhatsApp",
  walk_in: "Walk-In",
};

export const FOLLOW_UP_TYPE_LABELS: Record<FollowUpType, string> = {
  call: "Call",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  task: "Task",
};

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  missed: "Missed",
  cancelled: "Cancelled",
};

export const FOLLOW_UP_PRIORITY_LABELS: Record<FollowUpPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const ADMISSION_STAGE_LABELS: Record<AdmissionStage, string> = {
  inquiry_received: "Inquiry Received",
  contacted: "Contacted",
  counselling_done: "Counselling Done",
  registration_submitted: "Registration Submitted",
  reg_fees_paid: "Registration Fees Paid",
};

export const ADMISSION_GOAL_STATUS_LABELS: Record<AdmissionGoalStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ADMISSION_GOAL_EVENT_LABELS: Record<AdmissionGoalEventType, string> = {
  lead_qualified: "Lead Qualified",
  application_submitted: "Application Submitted",
  admission_confirmed: "Admission Confirmed",
  visa_approved: "Visa Approved",
};
