import { getExceptionMessage, Job } from '@first2apply/core';
import { dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import { json2csv } from 'json-2-csv';
import os from 'os';

import { F2aAutoUpdater } from './autoUpdater';
import { JobScanner } from './jobScanner';
import { OverlayBrowserView } from './overlayBrowserView';
import { getStripeConfig } from './stripeConfig';
import { F2aSupabaseApi } from './supabaseApi';

type MethodArg<T> = T extends (arg: infer A, ...rest: unknown[]) => unknown ? A : never;

/**
 * Helper methods used to centralize error handling.
 */
async function _apiCall<T>(method: () => Promise<T>) {
  try {
    const data = await method();
    return { data };
  } catch (error) {
    console.error(getExceptionMessage(error));
    return { error: getExceptionMessage(error, true) };
  }
}

/**
 * IPC handlers that expose methods to the renderer process
 * used to interact with the Supabase instance hosted on the node process.
 */
export function initRendererIpcApi({
  supabaseApi,
  jobScanner,
  autoUpdater,
  overlayBrowserView,
  nodeEnv,
}: {
  supabaseApi: F2aSupabaseApi;
  jobScanner: JobScanner;
  autoUpdater: F2aAutoUpdater;
  overlayBrowserView: OverlayBrowserView;
  nodeEnv: string;
}) {
  ipcMain.handle('get-os-type', () =>
    _apiCall(async () => {
      return os.platform();
    }),
  );

  ipcMain.handle(
    'signup-with-email',
    async (_, payload: MethodArg<F2aSupabaseApi['signupWithEmail']>) =>
      _apiCall(() => supabaseApi.signupWithEmail(payload)),
  );

  ipcMain.handle(
    'login-with-email',
    async (_, payload: MethodArg<F2aSupabaseApi['loginWithEmail']>) =>
      _apiCall(() => supabaseApi.loginWithEmail(payload)),
  );

  ipcMain.handle(
    'send-password-reset-email',
    async (_, payload: MethodArg<F2aSupabaseApi['sendPasswordResetEmail']>) =>
      _apiCall(() => supabaseApi.sendPasswordResetEmail(payload)),
  );

  ipcMain.handle(
    'change-password',
    async (_, payload: MethodArg<F2aSupabaseApi['updatePassword']>) =>
      _apiCall(() => supabaseApi.updatePassword(payload)),
  );

  ipcMain.handle('logout', async () => _apiCall(() => supabaseApi.logout()));

  ipcMain.handle('get-user', async () => _apiCall(() => supabaseApi.getUser()));

  ipcMain.handle('create-link', async (_, payload: MethodArg<F2aSupabaseApi['createLink']>) =>
    _apiCall(async () => {
      const { link, newJobs } = await supabaseApi.createLink(payload);

      // intentionally not awaited to not have the user wait until JDs are in
      jobScanner.scanJobs(newJobs).catch((error) => {
        console.error(getExceptionMessage(error));
      });

      return { link };
    }),
  );

  ipcMain.handle('update-link', async (_, payload: MethodArg<F2aSupabaseApi['updateLink']>) =>
    _apiCall(() => supabaseApi.updateLink(payload)),
  );

  ipcMain.handle('list-links', async () => _apiCall(() => supabaseApi.listLinks()));

  ipcMain.handle('delete-link', async (_, { linkId }: { linkId: number }) =>
    _apiCall(() => supabaseApi.deleteLink(linkId)),
  );

  ipcMain.handle('list-jobs', async (_, payload: MethodArg<F2aSupabaseApi['listJobs']>) =>
    _apiCall(() => supabaseApi.listJobs(payload)),
  );

  ipcMain.handle('update-job-status', async (_, payload: MethodArg<F2aSupabaseApi['updateJobStatus']>) =>
    _apiCall(() => supabaseApi.updateJobStatus(payload)),
  );

  ipcMain.handle('update-job-labels', async (_, payload: MethodArg<F2aSupabaseApi['updateJobLabels']>) =>
    _apiCall(() => supabaseApi.updateJobLabels(payload)),
  );

  ipcMain.handle('list-sites', async () => _apiCall(() => supabaseApi.listSites()));

  ipcMain.handle(
    'update-job-scanner-settings',
    async (_, payload: MethodArg<JobScanner['updateSettings']>) =>
      _apiCall(async () => jobScanner.updateSettings(payload)),
  );

  // handler used to fetch the cron schedule
  ipcMain.handle('get-job-scanner-settings', async () => _apiCall(async () => jobScanner.getSettings()));

  ipcMain.handle(
    'open-external-url',
    async (_, payload: MethodArg<typeof shell.openExternal>) =>
      _apiCall(async () => shell.openExternal(payload)),
  );

  ipcMain.handle('scan-job-description', async (_, payload: { job: Job }) =>
    _apiCall(async () => {
      const [updatedJob] = await jobScanner.scanJobs([payload.job]);
      return { job: updatedJob };
    }),
  );
  ipcMain.handle('get-app-state', async () =>
    _apiCall(async () => {
      const isScanning = await jobScanner.isScanning();
      const newUpdate = await autoUpdater.getNewUpdate();
      return { isScanning, newUpdate };
    }),
  );
  ipcMain.handle('apply-app-update', async () =>
    _apiCall(async () => {
      await autoUpdater.applyUpdate();
      return {};
    }),
  );

  ipcMain.handle('create-user-review', async (_, payload: MethodArg<F2aSupabaseApi['createReview']>) =>
    _apiCall(() => supabaseApi.createReview(payload)),
  );

  ipcMain.handle('get-user-review', async () => _apiCall(async () => supabaseApi.getUserReview()));

  ipcMain.handle('update-user-review', async (_, payload: MethodArg<F2aSupabaseApi['updateReview']>) =>
    _apiCall(async () => supabaseApi.updateReview(payload)),
  );

  ipcMain.handle('get-job-by-id', async (_, jobId: MethodArg<F2aSupabaseApi['getJob']>) =>
    _apiCall(async () => {
      const job = await supabaseApi.getJob(jobId);
      return { job };
    }),
  );

  ipcMain.handle('export-jobs-csv', async (_, payload: { status: Job['status'] }) =>
    _apiCall(async () => {
      const res = await dialog.showSaveDialog({
        properties: ['createDirectory'],
        filters: [{ name: 'CSV Jobs', extensions: ['csv'] }],
      });
      const filePath = res.filePath;
      if (res.canceled) return;

      // load all jobs with pagination
      const batchSize = 300;
      let allJobs: Job[] = [];
      let after: string | undefined;
      do {
        const { jobs, nextPageToken } = await supabaseApi.listJobs({
          status: payload.status,
          limit: batchSize,
          after,
        });
        allJobs = allJobs.concat(jobs);
        after = nextPageToken;
      } while (after);

      // cherry-pick the fields we want to export
      const sanitizedJobs = allJobs.map((job: Job) => ({
        title: job.title,
        company: job.companyName,
        location: job.location,
        salary: job.salary,
        job_type: job.jobType,
        job_status: job.status,
        external_url: job.externalUrl,
      }));

      const csvJobs = json2csv(sanitizedJobs);
      fs.writeFileSync(filePath, csvJobs);
    }),
  );

  ipcMain.handle('change-all-job-status', async (_, payload: MethodArg<F2aSupabaseApi['changeAllJobStatus']>) =>
    _apiCall(async () => {
      const job = await supabaseApi.changeAllJobStatus(payload);
      return { job };
    }),
  );

  ipcMain.handle('get-profile', async () =>
    _apiCall(async () => {
      const profile = await supabaseApi.getProfile();
      return { profile };
    }),
  );

  ipcMain.handle('get-stripe-config', async () =>
    _apiCall(async () => {
      const config = await getStripeConfig(nodeEnv);
      return { config };
    }),
  );

  ipcMain.handle('create-note', async (_, payload: MethodArg<F2aSupabaseApi['createNote']>) =>
    _apiCall(() => supabaseApi.createNote(payload)),
  );

  ipcMain.handle('list-notes', async (_, jobId: MethodArg<F2aSupabaseApi['listNotes']>) =>
    _apiCall(() => supabaseApi.listNotes(jobId)),
  );

  ipcMain.handle('update-note', async (_, payload: MethodArg<F2aSupabaseApi['updateNote']>) =>
    _apiCall(() => supabaseApi.updateNote(payload)),
  );

  ipcMain.handle('add-file-to-note', async (_, payload: MethodArg<F2aSupabaseApi['addFileToNote']>) =>
    _apiCall(() => supabaseApi.addFileToNote(payload)),
  );

  ipcMain.handle('delete-note', async (_, noteId: MethodArg<F2aSupabaseApi['deleteNote']>) =>
    _apiCall(() => supabaseApi.deleteNote(noteId)),
  );

  ipcMain.handle('get-advanced-matching-config', async () =>
    _apiCall(() => supabaseApi.getAdvancedMatchingConfig()),
  );

  ipcMain.handle('update-advanced-matching-config', async (_, payload: MethodArg<F2aSupabaseApi['updateAdvancedMatchingConfig']>) =>
    _apiCall(() => supabaseApi.updateAdvancedMatchingConfig(payload)),
  );

  ipcMain.handle('scan-link', async (_, payload: MethodArg<JobScanner['scanLink']>) =>
    _apiCall(() => jobScanner.scanLink(payload)),
  );

  ipcMain.handle('open-overlay-browser-view', async (_, url: MethodArg<OverlayBrowserView['open']>) => {
    return _apiCall(async () => overlayBrowserView.open(url));
  });
  ipcMain.handle('close-overlay-browser-view', async () => {
    return _apiCall(async () => overlayBrowserView.close());
  });
  ipcMain.handle('overlay-browser-can-view-go-back', async () => {
    return _apiCall(async () => overlayBrowserView.canGoBack());
  });
  ipcMain.handle('overlay-browser-view-go-back', async () => {
    return _apiCall(async () => overlayBrowserView.goBack());
  });
  ipcMain.handle('overlay-browser-can-view-go-forward', async () => {
    return _apiCall(async () => overlayBrowserView.canGoForward());
  });
  ipcMain.handle('overlay-browser-view-go-forward', async () => {
    return _apiCall(async () => overlayBrowserView.goForward());
  });
  ipcMain.handle('finish-overlay-browser-view', async () => {
    return _apiCall(async () => overlayBrowserView.finish());
  });
  ipcMain.handle('overlay-browser-view-navigate', async (_, url: MethodArg<OverlayBrowserView['navigate']>) => {
    return _apiCall(async () => overlayBrowserView.navigate(url));
  });
}
