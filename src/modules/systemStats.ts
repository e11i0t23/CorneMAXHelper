import type { Device } from "../device";
import { CODES, HALF } from "../types"
import { string2bytes } from "../helpers";

import si from 'systeminformation';
import dayjs from 'dayjs'

export const syncSystemStats = async (d: Device, half: HALF) => {
    // mem
    let mem = await si.mem()
    d.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.RAM, half, Math.round(mem.active / (mem.used + mem.free) * 100)]) as Buffer)
    // cpu
    let cpu = await si.currentLoad()
    d.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.CPU, half, (Math.round(cpu.currentLoad))]) as Buffer)
    // // gpu
    let gpu = await si.graphics()
    d.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.GPU, half, (Math.round(gpu.controllers[0].utilizationGpu || 0))]) as Buffer)
    // time
    let data = new Date(); // for now
    d.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.TIME, half, ...string2bytes(`${dayjs(data).format("hh:mm")}`)]) as Buffer)

}