import HID, { HIDAsync } from "node-hid";
import { usb, WebUSB } from "usb";
import type { CODES, HALF, ModuleSync } from "./types";
import { EventEmitter } from "events";

import log from "electron-log/node"

log.errorHandler.startCatching()

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
  intervalIDs: any[] = [];
  modules: ModuleSync[] = [];

  /**
   * @constructor
   * @param {ModuleSync[]} modules - The modules to sync to the device
   */
  constructor(modules: ModuleSync[]) {
    super();
    this.modules = modules;
    this.connectToDevice();

    // Initialise USB event listeners to detect when the keyboard is connected
    usb.on("attach", async (attached) => {
      if (this.device) return;
      if (!(attached.deviceDescriptor.idVendor == Number(0x4653) && attached.deviceDescriptor.idProduct == Number(0x0001))) return;
      console.log("Keyboard attached, connecting to device");
      this.connectToDevice();
    });

    // Initialise USB event listeners to detect when the keyboard is disconnected
    usb.on("detach", (device) => {
      if (device.deviceDescriptor.idVendor == Number(0x4653) && device.deviceDescriptor.idProduct == Number(0x0001)) {
        this.device = null;
        console.log("Device Discconected");
        this.emit("disconnected");
        this.intervalIDs.forEach((id) => {
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
      console.log("Connected to device");
      this.emit("connected");
      // load the modules to be sysnced
      this.modules.forEach((m) => {
        this.intervalIDs.push(setInterval(m.f, m.freq, this, ...m.args));
      });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
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
