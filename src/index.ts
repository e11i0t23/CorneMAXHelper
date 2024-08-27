import { app, Tray, Menu, nativeImage, dialog } from "electron";
import { loadImage } from "@napi-rs/canvas";
import path from "path";

import { Config } from "./helpers";
import { Device } from "./device";

import { CODES, HALF } from "./types";

import { uploadImage } from "./uploadImage";

import { spotifyAuth, getUserPlayback } from "./modules/spotify";
import { syncSystemStats } from "./modules/systemStats";

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
const contextMenu = (connected: boolean): Menu =>
  Menu.buildFromTemplate(
    connected
      ? [
          { label: "Connected" },
          // { label: 'Link Spotify', click: connectSpotify },
          { label: "Upload Master", click: () => uploadCustomImage(HALF.MASTER) },
          { label: "Upload Slave", click: () => uploadCustomImage(HALF.SLAVE) },
          { label: "Quit", click: app.quit },
        ]
      : [{ label: "Disconnected" }, { label: "Quit", click: app.quit }]
  );

app.on("ready", async () => {
  // load config
  config = new Config(userDataPath);

  // initialize tray
  const icon = nativeImage.createFromPath(path.join(__dirname, "./images/logoTemplate.png"));
  tray = new Tray(icon);
  tray.setToolTip("Mechboards Max Helper");
  tray.setContextMenu(contextMenu(false));
  console.log("Tray created");

  // Initialize device class and modules
  // device sends self as first arg automatically to all modules
  device = new Device([
    { f: getUserPlayback, freq: 5000, args: [config] },
    { f: syncSystemStats, freq: 5000, args: [HALF.MASTER] },
  ]);

  // update connection status in tray based on device connection events
  device.on("connected", () => {
    tray.setContextMenu(contextMenu(true));
  });
  device.on("disconnected", () => {
    tray.setContextMenu(contextMenu(false));
  });
});

// Initialize Spotify connection
const connectSpotify = () => {
  console.log("Connecting to Spotify");
  spotifyAuth(config);
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
