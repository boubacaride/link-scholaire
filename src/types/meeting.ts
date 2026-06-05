// Types for the Classe Virtuelle / video meeting module.
// Mirrors the schema in supabase/migrations/006_meetings.sql.

export type MeetingType =
  | "virtual_classroom"
  | "parent_teacher"
  | "staff"
  | "exam_review"
  | "general";

export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

export type ScreenSharePolicy = "host_only" | "all" | "none";

export type ParticipantRole = "host" | "co_host" | "participant" | "observer";

export type ParticipantStatus =
  | "invited"
  | "accepted"
  | "declined"
  | "joined"
  | "left";

export type MessageType = "text" | "file" | "system";

export interface Meeting {
  id: string;
  school_id: string;
  title: string;
  description: string | null;
  meeting_type: MeetingType;
  host_id: string;
  room_name: string;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string;
  passcode: string | null;
  waiting_room: boolean;
  recording_enabled: boolean;
  max_participants: number;
  allow_screen_share: ScreenSharePolicy;
  class_id: string | null;
  subject_id: string | null;
  status: MeetingStatus;
  started_at: string | null;
  ended_at: string | null;
  meeting_link: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joined_at: string | null;
  left_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface MeetingMessage {
  id: string;
  meeting_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  file_url: string | null;
  created_at: string;
}

export interface MeetingRecording {
  id: string;
  meeting_id: string;
  storage_path: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  created_at: string;
}

export interface CreateMeetingForm {
  title: string;
  description?: string;
  meeting_type: MeetingType;
  scheduled_at: string;
  duration_minutes: number;
  timezone?: string;
  passcode?: string;
  waiting_room: boolean;
  recording_enabled: boolean;
  max_participants?: number;
  allow_screen_share: ScreenSharePolicy;
  class_id?: string | null;
  subject_id?: string | null;
  invitee_profile_ids?: string[];
}

export interface MeetingConnectionDetails {
  token: string;
  url: string;
  roomName: string;
  displayName: string;
  isHost: boolean;
  canScreenShare: boolean;
}
