import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The address of the signed-in wallet, or null. */
export async function GET() {
  return NextResponse.json({ address: currentAddress() });
}
