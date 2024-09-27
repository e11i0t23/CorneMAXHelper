import { app, Tray, Menu, nativeImage, dialog } from "electron";
import { loadImage } from "@napi-rs/canvas";
import path from "path";

import { Config } from "./helpers";
import { Device } from "./device";

import { CODES, HALF } from "./types";

import { uploadImage } from "./uploadImage";

import { spotifyAuth } from "./modules/spotify";

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
const contextMenu = (connected: boolean): Menu =>
  Menu.buildFromTemplate(
    connected
      ? [
          { label: "Connected" },
          // { label: 'Link Spotify', click: connectSpotify },
          { label: "Upload Master", click: () => uploadCustomImage(HALF.MASTER) },
          { label: "Upload Slave", click: () => uploadCustomImage(HALF.SLAVE) },
          { label: "Quit", click: app.quit },
          {
            label: "Master",

            submenu: [
              ...screens.map((screen) => ({
                label: screen.name,
                type: "radio" as const,
                checked: screen.code === screen_master,
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
                checked: screen.code === screen_slave,
                click: () => device.updateScreen(screen.code, HALF.SLAVE),
              })),
            ],
          },
        ]
      : [{ label: "Disconnected" }, { label: "Quit", click: app.quit }]
  );

let screen_master: number = 0;
let screen_slave: number = 3;

app.on("ready", async () => {
  log.info("App Ready");
  // load config
  config = new Config(userDataPath);

  // initialize tray
  const icon = nativeImage.createFromPath(path.join(__dirname, "./images/logoTemplate.png"));
  tray = new Tray(icon);
  tray.setToolTip("Mechboards Max Helper");
  tray.setContextMenu(contextMenu(false));
  log.info("Tray created");

  // Initialize device class and modules
  // device sends self as first arg automatically to all modules
  device = new Device(config);

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
