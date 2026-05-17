export type UserRole =
  | "super_admin"
  | "management"
  | "admission_manager"
  | "counsellor"
  | "marketing"
  | "staff_viewer";

export type LeadStatus =
  | "inquiry_received"
  | "invalid"
  | "unable_to_reach"
  | "no_response"
  | "contacted_info_shared"
  | "not_interested"
  | "need_time_follow_up"
  | "refer_to_management"
  | "course_not_started"
  | "on_discussions"
  | "registered_closed"
  | "registered_paid_reg_fee"
  | "registered_dropped_out";

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

export type AdmissionStage =
  | "inquiry_received"
  | "contacted"
  | "counselling_done"
  | "registration_submitted"
  | "reg_fees_paid";

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
  phone: string;
  email: string | null;
  city: string | null;
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
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUp {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  type: FollowUpType;
  status: FollowUpStatus;
  scheduled_at: string;
  completed_at: string | null;
  notes: string | null;
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
  invalid: "Invalid",
  unable_to_reach: "Unable to Reach",
  no_response: "No Response",
  contacted_info_shared: "Contacted & Info Shared",
  not_interested: "Not Interested",
  need_time_follow_up: "Need Time: To Be Followed Up",
  refer_to_management: "Refer to Management",
  course_not_started: "Course Not Started",
  on_discussions: "On- Discussions",
  registered_closed: "Registered (Closed)",
  registered_paid_reg_fee: "Registered (Paid- Reg Fee)",
  registered_dropped_out: "Registered & Dropped-out",
};

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

export const ADMISSION_STAGE_LABELS: Record<AdmissionStage, string> = {
  inquiry_received: "Inquiry Received",
  contacted: "Contacted",
  counselling_done: "Counselling Done",
  registration_submitted: "Registration Submitted",
  reg_fees_paid: "Registration Fees Paid",
};
