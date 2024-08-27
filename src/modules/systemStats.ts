import type { Device } from "../device";
import { CODES, HALF } from "../types";
import { string2bytes } from "../helpers";

import si from "systeminformation";
import dayjs from "dayjs";

let lastMem: number = 50;
let lastCPU: number = 50;
let lastGPU: number = 50;
let lastTime: string = "00:00";

const diffVal = 3;

/**
 * Sync system stats to the keyboard
 *
 * @async
 * @param {Device} d - The device to sync the stats to
 * @param {HALF} half - The half of the keyboard to sync the stats to
 */
export const syncSystemStats = async (d: Device, half: HALF) => {
  // mem
  let mem = await si.mem();
  let memUsage = Math.round((mem.active / (mem.used + mem.free)) * 100);
  if (Math.abs(memUsage - lastMem) > diffVal) {
    d.write(CODES.RAM, half, [memUsage]);
    lastMem = memUsage;
  }
  // cpu
  let cpu = await si.currentLoad();
  let cpuUsage = Math.round(cpu.currentLoad);
  if (Math.abs(cpuUsage - lastCPU) > diffVal) {
    d.write(CODES.CPU, half, [cpuUsage]);
    lastCPU = cpuUsage;
  }
  // // gpu
  let gpu = await si.graphics();
  let gpuUsage = Math.round(gpu.controllers[0].utilizationGpu || 0);
  if (Math.abs(gpuUsage - lastGPU) > diffVal) {
    d.write(CODES.GPU, half, [gpuUsage]);
    lastGPU = gpuUsage;
  }
  // time
  let date = new Date(); // time now
  let time = dayjs(date).format("hh:mm");
  if (time !== lastTime) {
    d.write(CODES.TIME, HALF.SLAVE, string2bytes(time));
    lastTime = time;
  }
};
