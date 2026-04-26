import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { autoUpdater } from 'electron-updater';
import { CoreProcess } from './main/coreProcess';

// Squirrel.Windows イベント処理
if (process.platform === 'win32') {
  const squirrelEvent = process.argv[1];
  if (squirrelEvent) {
    const appFolder = path.resolve(process.execPath, '..');
    const rootFolder = path.resolve(appFolder, '..');
    const updateExe = path.join(rootFolder, 'Update.exe');
    const exeName = path.basename(process.execPath);

    const spawnUpdate = (args: string[]) => {
      try {
        spawn(updateExe, args, { detached: true });
      } catch (e) {
        // ignore
      }
    };

    if (squirrelEvent === '--squirrel-install' || squirrelEvent === '--squirrel-updated') {
      spawnUpdate(['--createShortcut', exeName]);
      app.quit();
    } else if (squirrelEvent === '--squirrel-uninstall') {
      spawnUpdate(['--removeShortcut', exeName]);
      app.quit();
    } else if (squirrelEvent === '--squirrel-obsolete') {
      app.quit();
    }
  }
}

const core = new CoreProcess();

function setupAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('core-event', {
      event: 'update',
      status: 'available',
      version: info.version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('core-event', {
      event: 'update',
      status: 'up-to-date',
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('core-event', {
      event: 'update',
      status: 'downloading',
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('core-event', {
      event: 'update',
      status: 'ready',
    });
    setTimeout(() => {
      core.stop();
      autoUpdater.quitAndInstall();
    }, 2000);
  });

  // 起動時にも自動チェック
  autoUpdater.checkForUpdates().catch((err) => {
    console.log('[Updater] Check failed:', err.message);
  });
}

const createWindow = () => {
  // getUserMedia のカメラ許可を自動承認（OS の許可ダイアログは別途表示される）
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // getUserMedia でカメラ許可ダイアログを出すために必要
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // コアプロセス起動
  core.start();

  // コアからのイベントをレンダラーに転送
  core.on((event) => {
    if (event.event === 'detection') {
      // ログ抑制
    } else {
      console.log('[Main] Core event:', JSON.stringify(event));
    }
    mainWindow.webContents.send('core-event', event);
  });

  ipcMain.on('core-command', (_event, cmd) => {
    core.send(cmd);
  });

  ipcMain.handle('dialog-open-video', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '入力動画を選択',
      filters: [{ name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] }],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog-save-video', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '出力動画の保存先を選択',
      defaultPath: 'detection_output.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.on('renderer-ready', () => {
    console.log('[Main] Renderer ready, sending core ready state');
    mainWindow.webContents.send('core-event', { event: 'ready' });
    // カメラ一覧も再取得（readyより前に来ていた場合の救済）
    core.send({ cmd: 'list_cameras' });
  });

  // アップデートIPC（本番/開発 両方で登録）
  autoUpdater.on('error', (err) => {
    console.log('[Updater] Error:', err.message);
    mainWindow.webContents.send('core-event', {
      event: 'update',
      status: 'error',
      message: err.message,
    });
  });

  ipcMain.on('check-for-update', () => {
    mainWindow.webContents.send('core-event', {
      event: 'update',
      status: 'checking',
    });
    autoUpdater.checkForUpdates()
      .then((result) => {
        if (!result) {
          mainWindow.webContents.send('core-event', {
            event: 'update',
            status: 'error',
            message: '開発モードではアップデート確認できません',
          });
        }
      })
      .catch((err) => {
        console.log('[Updater] Check failed:', err.message);
        mainWindow.webContents.send('core-event', {
          event: 'update',
          status: 'error',
          message: err.message,
        });
      });
  });

  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    core.stop();
    autoUpdater.quitAndInstall();
  });

  // 自動更新（本番ビルドのみ）
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    setupAutoUpdater(mainWindow);
  }
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  core.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
