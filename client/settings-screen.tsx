import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import { ExternalLink, SettingsAction, SettingsCard, SettingsInput, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text } from "react-native";
import { licenseSettings } from "../shared/settings";

export function LicenseSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(licenseSettings);
  const [draft, setDraft] = useState<string>();
  const [inputError, setInputError] = useState<string | null>(null);
  if (settings.status !== "ready") {
    return (
      <Text style={{ color: theme.colors.foregroundMuted, padding: 16 }}>
        {settings.status === "loading" ? "Loading settings" : settings.error}
      </Text>
    );
  }
  const save = () => {
    const parsed = licenseSettings.schema.safeParse({ licenseKey: draft ?? settings.values.licenseKey });
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? "The licence key is not valid");
      return;
    }
    setInputError(null);
    void settings.save(parsed.data, settings.revision).then((saved) => saved && setDraft(undefined));
  };
  return (
    <SettingsSection
      title="tldraw licence"
      info={
        <Text style={{ color: theme.colors.foregroundMuted }}>
          tldraw runs without a key only in development builds. For daily use, ask tldraw for a key that covers this
          plugin. <ExternalLink href="https://tldraw.dev/pricing">tldraw licensing</ExternalLink>
        </Text>
      }
    >
      <SettingsCard>
        <SettingsInput
          label="Licence key"
          hint="Open drawings reload with the new key. Empty means no key."
          initialValue={settings.values.licenseKey}
          secureTextEntry
          disabled={settings.saving}
          onChangeText={setDraft}
        />
        <SettingsAction
          label=""
          actionLabel="Save key"
          disabled={settings.saving || draft === undefined}
          error={inputError ?? settings.saveError}
          onPress={save}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
