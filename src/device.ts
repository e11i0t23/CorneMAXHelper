import HID, { HIDAsync } from "node-hid";
import { usb, WebUSB } from "usb";
import { HALF, CODES, Half } from "./types";
import { EventEmitter } from "events";

import log from "electron-log/node";
import { Config } from "./helpers";
import { screens } from "./screens";
import { uploadImage } from "./uploadImage";

import { setTimeout } from "timers/promises";

log.errorHandler.startCatching();

const webusb = new WebUSB({
  allowAllDevices: true,
});

/**
 * Device class to handle communication with the keyboard
 *
 * @export
 * @class Device
 * @typedef {Device}
 * @extends {EventEmitter}
 */
export class Device extends EventEmitter {
  device: HIDAsync | null;
  config: Config;
  master: Half = {
    screen: 0,
    intervalIDs: [],
  };

  slave: Half = {
    screen: 0,
    intervalIDs: [],
  };

  /**
   * @constructor
   * @param {ModuleSync[]} modules - The modules to sync to the device
   */
  constructor(config: Config) {
    super();
    this.config = config;
    console.log(this.config.config)
    this.master.screen = this.config.config.masterScreen
    this.slave.screen = this.config.config.slaveScreen
    this.connectToDevice();

    // Initialise USB event listeners to detect when the keyboard is connected
    usb.on("attach", async (attached) => {
      if (this.device) return;
      if (!(attached.deviceDescriptor.idVendor == Number(0x4653) && attached.deviceDescriptor.idProduct == Number(0x0001))) return;
      log.info("Keyboard attached, connecting to device");
      this.connectToDevice();
    });

    // Initialise USB event listeners to detect when the keyboard is disconnected
    usb.on("detach", (device) => {
      if (device.deviceDescriptor.idVendor == Number(0x4653) && device.deviceDescriptor.idProduct == Number(0x0001)) {
        this.device = null;
        log.info("Device Discconected");
        this.emit("disconnected");
        [...this.slave.intervalIDs, ...this.master.intervalIDs].forEach((id) => {
          clearInterval(id);
        });
      }
    });
  }

  /**
   * Attempt to connect to the HID device
   *
   * @async
   * @returns {Promise<boolean>} - Whether the device was connected successfully
   */
  connectToDevice = async () => {
    // The slave side takes a second to power up so we account for this
    await setTimeout(3000)
    // Get all HID devices
    var devices = await HID.devicesAsync();
    // Filter for the keyboard device
    var device = devices.find((device) => device.vendorId == 0x4653 && device.productId == 0x0001 && device.usagePage == 0xff60 && device.usage == 0x61);
    // if no device found, return false
    if (!device) return false;
    try {
      if (!device.path) throw "no device path";
      // Open the HID device
      this.device = await HID.HIDAsync.open(device.path);
      if (!this.device) return false;
      log.info("Connected to device");
      this.emit("connected");
      // load the modules to be sysnced
      this.updateScreen(this.master.screen, HALF.MASTER);
      this.updateScreen(this.slave.screen, HALF.SLAVE);
      // upload the master and slave gifs
      uploadImage(this, CODES.IMG_GIF, HALF.MASTER, new Uint8Array(this.config.config.masterGif), 80, 100, true)
      uploadImage(this, CODES.IMG_GIF, HALF.SLAVE, new Uint8Array(this.config.config.slaveGif), 80, 100, true)

      return true;
    } catch (error) {
      console.error("Device Error: ", error);
      return false;
    }
  };

  updateScreen = (screen: number, half: HALF) => {
    log.info(`Updating Screen ${screen} on ${half == HALF.MASTER ? "Master" : "Slave"}`);
    (half == HALF.MASTER ? this.master.intervalIDs : this.slave.intervalIDs).forEach((id) => {
      clearInterval(id);
    });
    (half == HALF.MASTER ? this.master : this.slave).screen = screen;
    this.write(CODES.SCREEN, half, [screens[screen].code]);
    screens[screen].modules.forEach((m) => {
      (half == HALF.MASTER ? this.master.intervalIDs : this.slave.intervalIDs).push(setInterval(m, screens[screen].frequency, this, half, this.config));
    });
    this.config.updateField((half == HALF.MASTER ? 'masterScreen' : 'accessToken'), screen) 
  };

  /**
   * Write to HID Device, adding in the default config bytes
   *
   * @async
   * @param {CODES} command - The command code to write
   * @param {HALF} half - The half of the keyboard to write to
   * @param {(number[] | Buffer | Uint8Array)} data - The data to write
   * @returns {Promise<boolean>} - Whether the write was successful
   */
  write = async (command: CODES, half: HALF, data: number[] | Buffer | Uint8Array): Promise<boolean> => {
    if (!this.device) return false;
    var buffer: any[] = [];
    if (process.platform == "win32") buffer.push(0xff);
    buffer.push(0x07, 0x00, command, half, ...data);
    return (await this.device.write(buffer)) > data.length;
  };
}
