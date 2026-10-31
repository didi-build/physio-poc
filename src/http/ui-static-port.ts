export type UiStaticPort = {
  tryServeAsset(pathname: string): Promise<Response | null>;
  renderAppShell(): Promise<Response | null>;
};

export const noopUiStaticPort: UiStaticPort = {
  tryServeAsset: async () => null,
  renderAppShell: async () => null,
};
