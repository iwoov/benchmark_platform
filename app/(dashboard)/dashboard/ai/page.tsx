import { AiSettingsConsole } from "@/components/dashboard/ai-settings-console";
import { getAiSettingsData } from "@/lib/ai/settings";

export const dynamic = "force-dynamic";

export default async function AdminAiSettingsPage() {
  const data = await getAiSettingsData();

  return (
    <AiSettingsConsole
      databaseEnabled={data.databaseEnabled}
      providers={data.providers}
      endpointOptions={data.endpointOptions}
      models={data.models}
    />
  );
}
