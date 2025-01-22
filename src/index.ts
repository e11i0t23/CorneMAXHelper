import { app, Tray, Menu, nativeImage, dialog, Notification } from "electron";
import { loadImage } from "@napi-rs/canvas";
import path from "path";

import { Config } from "./helpers";
import { Device } from "./device";

import { CODES, HALF } from "./types";

import { uploadImage } from "./uploadImage";

import { spotifyAuth, spotifyDeAuth } from "./modules/spotify";

import { screens } from "./screens";

import log from "electron-log/main";

log.initialize();
log.errorHandler.startCatching();

const userDataPath = app.getPath("userData");

let config: Config;
let tray: Tray;
let device: Device;

// Handle squirrel event
if (require("electron-squirrel-startup")) {
  console.log("quitting");
  app.quit();
}

// Single Instance Lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

/**
 * Create context menu for tray based on connection status
 *
 * @param {boolean} connected - Whether the device is connected
 * @returns {Menu} - The context menu for the tray
 */
const contextMenu = (connected: boolean, f?: boolean): Menu =>
  Menu.buildFromTemplate(
    [
          { label: connected ? "Connected" : "Disconnected"},
          (
            (config.config== undefined ? false : config.config['accessToken']) || f ? { label: 'Unlink Spotify', click: disconnectSpotify } : { label: 'Link Spotify', click: connectSpotify }
          ),
          ...(
            connected ? [
            { label: "Upload Master", click: () => uploadCustomImage(HALF.MASTER) }, 
            { label: "Upload Slave", click: () => uploadCustomImage(HALF.SLAVE) },
            {
              label: "Master",
              
              submenu: [
                ...screens.map((screen) => ({
                  label: screen.name,
                  type: "radio" as const,
                  checked: screen.code === device.master.screen,
                  click: () => device.updateScreen(screen.code, HALF.MASTER),
                })),
              ],
            },
            {
              label: "Slave",
              submenu: [
                ...screens.map((screen) => ({
                  label: screen.name,
                  type: "radio" as const,
                  checked: screen.code === device.slave.screen,
                  click: () => device.updateScreen(screen.code, HALF.SLAVE),
                })),
              ],
            },
             ] : []
          ),
          { label: "Quit", click: app.quit },
        ]

  );

let screen_master: number = 0;
let screen_slave: number = 0;


app.on("ready", async () => {
  // load config
  config = new Config(userDataPath);
  // Set Notification
  new Notification({'title':'Corne Max Helper Started'}).show()
  log.info("App Ready");
  
  // Initialize device class and modules
  // device sends self as first arg automatically to all modules
  device = new Device(config);

  // initialize tray
  const icon = nativeImage.createFromPath(path.join(__dirname, "./images/logoTemplate.png"));
  tray = new Tray(icon);
  tray.setToolTip("Corne Max Helper");
  tray.setContextMenu(contextMenu(false));
  log.info("Tray created");


  // update connection status in tray based on device connection events
  device.on("connected", () => {
    log.info("device connected");
    tray.setContextMenu(contextMenu(true));
  });
  device.on("disconnected", () => {
    log.info("device disconnected");
    tray.setContextMenu(contextMenu(false));
  });
});

// Initialize Spotify connection
const connectSpotify = () => {
  console.log("Connecting to Spotify");
  spotifyAuth(config);
  tray.setContextMenu(contextMenu(device.device != null, true))
};

// Delete Spotify connection
const disconnectSpotify = () => {
  console.log("Disconnecting to Spotify");
  spotifyDeAuth(config);
  tray.setContextMenu(contextMenu(device.device != null))
};

/**
 * Upload a custom image from system to device that will fill the entire area (w: 80, h: 160)
 *
 * @async
 * @param {number} half - The half of the keyboard to upload the image to
 * @returns {Promise<boolean>} - Whether the image was uploaded successfully
 */
const uploadCustomImage = async (half: number): Promise<boolean> => {
  const OF = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }] });
  if (OF.canceled) return false;
  if (OF.filePaths.length == 0) return false;
  const image = await loadImage(OF.filePaths[0]);
  return await uploadImage(device, CODES.IMG_FULLSIZE, half, image, 80, 160);
};
