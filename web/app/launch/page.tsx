import { redirect } from "next/navigation";

/** The v4 launch now lives as a mode inside the unified /create screen. Keep this route working
 *  for old links (nav, the guide, shared URLs) by redirecting straight into v4 mode. */
export default function LaunchPage() {
  redirect("/create?mode=v4");
}
