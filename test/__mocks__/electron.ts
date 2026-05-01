// Minimal electron mock for tests that import modules depending on electron
export const app = {
  getPath: (name: string) => `/tmp/cluely-test-${name}`,
  getName: () => 'cluely-test',
  getVersion: () => '0.0.0',
  isPackaged: false,
  on: () => {},
  whenReady: () => Promise.resolve(),
};

export const ipcMain = {
  handle: () => {},
  on: () => {},
};

export const BrowserWindow = class {
  static getAllWindows() { return []; }
};

export const shell = {};
export const nativeImage = {
  createFromPath: () => ({ resize: () => ({}) }),
};
export const Menu = { buildFromTemplate: () => ({}) };
export const Tray = class {};
export const desktopCapturer = { getSources: async () => [] };

export default { app, ipcMain, BrowserWindow, shell, nativeImage, Menu, Tray, desktopCapturer };
