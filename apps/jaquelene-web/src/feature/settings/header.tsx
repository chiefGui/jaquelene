import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

const settingsLandingDestination = {
  to: "/settings/general",
  replace: true,
} as const;

function SettingsBreadcrumb({ children, page }: { children: ReactNode; page: string }) {
  return (
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>{children}</Breadcrumb.Item>
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

      <SettingsBreadcrumb page="General">Settings</SettingsBreadcrumb>
    </ContentPane.Header>
  );
}

export function SettingsSubpageHeader({ page }: { page: string }) {
  return (
    <ContentPane.Header>
      <ContentPane.Back
        render={<Link {...settingsLandingDestination} />}
        aria-label="Back to settings"
      />

      <SettingsBreadcrumb page={page}>
        <Breadcrumb.Link render={<Link {...settingsLandingDestination} />}>
          Settings
        </Breadcrumb.Link>
      </SettingsBreadcrumb>
    </ContentPane.Header>
  );
}
