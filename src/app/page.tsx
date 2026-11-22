import { TradeApp } from "@/components/TradeApp";
import { getPageUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getPageUser();
  return <TradeApp user={user} />;
}
