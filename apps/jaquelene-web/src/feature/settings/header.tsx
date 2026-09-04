import { Link } from "@tanstack/react-router";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

const settingsLandingDestination = {
  to: "/settings/general",
  replace: true,
} as const;

function SettingsItem({ linked }: { linked: boolean }) {
  if (linked) {
    return (
      <Breadcrumb.Item>
        <Breadcrumb.Link render={<Link {...settingsLandingDestination} />}>
          Settings
        </Breadcrumb.Link>
      </Breadcrumb.Item>
    );
  }

  return <Breadcrumb.Item>Settings</Breadcrumb.Item>;
}

function SettingsBreadcrumb({ linkSettings, page }: { linkSettings: boolean; page: string }) {
  return (
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <SettingsItem linked={linkSettings} />
        <Breadcrumb.Item>
          <Breadcrumb.Page>{page}</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>
  );
}

export function SettingsLandingHeader() {
  return (
    <ContentPane.Header>
      <ContentPane.HistoryBack />
      <SettingsBreadcrumb linkSettings={false} page="General" />
    </ContentPane.Header>
  );
}

export function SettingsHeader({ page }: { page: string }) {
  return (
    <ContentPane.Header>
      <ContentPane.Back
        render={<Link {...settingsLandingDestination} />}
        aria-label="Back to settings"
      />
      <SettingsBreadcrumb linkSettings page={page} />
    </ContentPane.Header>
  );
}
