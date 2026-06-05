import { NextRequest, NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MeetingConnectionDetails } from "@/types/meeting";

// POST /api/meetings/token
// Body: { meetingId: string }
// Returns LiveKit connection details for the authenticated user.
//
// Flow:
//   1. Auth via Supabase session cookie → profile.id
//   2. Load meeting (RLS guarantees visibility)
//   3. Determine host / participant / observer status
//   4. Enforce waiting room (returns 403 waiting_for_host until admitted)
//   5. Mark participant as joined; flip meeting to 'live' if host opens it
//   6. Mint LiveKit JWT with capability grants matching the role + policy

export async function POST(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: "LiveKit is not configured on the server." },
      { status: 500 },
    );
  }

  let body: { meetingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const meetingId = body.meetingId;
  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json(
      { error: "'meetingId' is required." },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Resolve profile (one row per user per school)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role, avatar_url")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 403 },
    );
  }

  // Load meeting (RLS filters non-members automatically)
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select(
      "id, host_id, room_name, status, waiting_room, allow_screen_share, title",
    )
    .eq("id", meetingId)
    .single();

  if (meetingError || !meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    return NextResponse.json(
      { error: `Meeting is ${meeting.status}.` },
      { status: 400 },
    );
  }

  const isHost = meeting.host_id === profile.id;

  // Find the user's participant row (host typically does NOT have one — they
  // are the host. Auto-invite trigger explicitly skips host_id.)
  let participantRole: "host" | "co_host" | "participant" | "observer" = "participant";
  let participantStatus: string | null = null;

  if (!isHost) {
    const { data: participant, error: participantError } = await supabase
      .from("meeting_participants")
      .select("role, status")
      .eq("meeting_id", meeting.id)
      .eq("user_id", profile.id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { error: "Not authorized to join this meeting." },
        { status: 403 },
      );
    }

    participantRole = participant.role;
    participantStatus = participant.status;

    // Waiting room: a non-host must be 'accepted' or 'joined' before
    // receiving a token. Otherwise the host hasn't admitted them yet.
    if (
      meeting.waiting_room &&
      participantStatus !== "accepted" &&
      participantStatus !== "joined"
    ) {
      // Record their intent to join so the host can see them in the queue
      // (the realtime subscription on participants will surface this row).
      await supabase
        .from("meeting_participants")
        .update({ status: "invited" })
        .eq("meeting_id", meeting.id)
        .eq("user_id", profile.id);

      return NextResponse.json(
        { error: "waiting_for_host", waiting: true },
        { status: 403 },
      );
    }
  }

  // Permission matrix
  const canPublish = participantRole !== "observer";
  const canScreenShare = isHost
    ? meeting.allow_screen_share !== "none"
    : meeting.allow_screen_share === "all";

  // Mint LiveKit JWT
  const displayName = `${profile.first_name} ${profile.last_name}`.trim();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: profile.id,
    name: displayName,
  });
  at.addGrant({
    roomJoin: true,
    room: meeting.room_name,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: canScreenShare
      ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [TrackSource.CAMERA, TrackSource.MICROPHONE],
    roomAdmin: isHost || participantRole === "co_host",
  });

  const token = await at.toJwt();

  // Side effects: mark participant joined, flip meeting to 'live' if host opens
  const now = new Date().toISOString();

  if (isHost) {
    if (meeting.status === "scheduled") {
      await supabase
        .from("meetings")
        .update({ status: "live", started_at: now })
        .eq("id", meeting.id);
    }
  } else {
    await supabase
      .from("meeting_participants")
      .update({ status: "joined", joined_at: now })
      .eq("meeting_id", meeting.id)
      .eq("user_id", profile.id);
  }

  const response: MeetingConnectionDetails = {
    token,
    url: livekitUrl,
    roomName: meeting.room_name,
    displayName,
    isHost,
    canScreenShare,
  };

  return NextResponse.json(response);
}
