// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

const additionalArgs = process.argv.slice(1);
const extractArg = (prefix: string) =>
  additionalArgs.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);

const theme = extractArg('--theme=') ?? additionalArgs[additionalArgs.length - 1] ?? 'light';
const styleNonce = extractArg('--styleNonce=');

contextBridge.exposeInMainWorld('electron', {
  invoke: ipcRenderer.invoke,
  on: (channel: string, callback: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) => {
    return ipcRenderer.on(channel, callback);
  },
  theme,
  styleNonce,
});
