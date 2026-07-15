import { redirect } from "next/navigation";

/** Discover is now the home page. Keep the old route working for shared links. */
export default function DiscoverPage() {
  redirect("/");
}
