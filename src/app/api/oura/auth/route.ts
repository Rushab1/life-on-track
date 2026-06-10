import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signState } from "@/lib/oauthState";

const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID;
const SCOPES = "daily heartrate personal";

function getRedirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/oura/callback`;
}

export async function GET(req: Request): Promise<Response> {
  if (!OURA_CLIENT_ID) {
    return NextResponse.redirect(new URL("/?oura=unconfigured", req.url));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: OURA_CLIENT_ID,
    redirect_uri: getRedirectUri(req),
    scope: SCOPES,
    state: signState(user.id),
  });

  return NextResponse.redirect(
    `https://cloud.ouraring.com/oauth/authorize?${params}`,
  );
}
