export type UiStaticPort = {
  tryServeAsset(pathname: string): Response | null;
  renderAppShell(): Response | null;
};

export const noopUiStaticPort: UiStaticPort = {
  tryServeAsset: () => null,
  renderAppShell: () => null,
};
