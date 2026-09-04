import { Context, Layer } from "effect";

export type DesktopConfiguration = Readonly<{
  userDataDirectory: string;
  developmentServerUrl: string | undefined;
}>;

export class DesktopConfigurationService extends Context.Service<
  DesktopConfigurationService,
  DesktopConfiguration
>()("@jaquelene/desktop/application/DesktopConfiguration") {
  static readonly layer = (configuration: DesktopConfiguration) =>
    Layer.succeed(this, this.of(configuration));
}
