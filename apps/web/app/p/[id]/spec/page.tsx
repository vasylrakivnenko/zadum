import { SpecWorkspace } from "@/components/SpecWorkspace";

export const dynamic = "force-dynamic";

/**
 * /p/[id]/spec — the spec workspace. Like the other project pages this one only unwraps the route params;
 * the data is loaded in the browser through lib/client so a refine can update the page without a round trip
 * through the server component tree.
 */
export default async function SpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SpecWorkspace id={id} />;
}
