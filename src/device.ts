import HID, { HIDAsync } from 'node-hid'
import {usb, WebUSB} from 'usb'
import type { ModuleSync } from './types';
import {EventEmitter} from 'events'

const webusb = new WebUSB({
    allowAllDevices: true
});

export class Device extends EventEmitter {
    device: HIDAsync | null;
    intervalIDs: any[] = []
    modules: ModuleSync[] = []

    constructor(modules: ModuleSync[]) {
        super();
        this.modules = modules;
        this.connectToDevice()

        usb.on("attach", async (attached) => {
            if (this.device) return
            if (!(attached.deviceDescriptor.idVendor == Number(0x4653) && attached.deviceDescriptor.idProduct == Number(0x0001))) return
            console.log('Keyboard attached, connecting to device')
            this.connectToDevice()
        })
        
        usb.on('detach', (device) => {
            console.log("something disconnected")
            if (device.deviceDescriptor.idVendor == Number(0x4653) && device.deviceDescriptor.idProduct == Number(0x0001)) {
                this.device = null;
                // tray.setContextMenu(contextMenu())
                console.log("Discconected device")
                this.emit("disconnected")
                this.intervalIDs.forEach((id) => {
                    clearInterval(id)
                })

        
            }
        });
        
    }

    connectToDevice = async () => {
        // See if the keyboard is already connected to the PC, if it is connect to the HID device otherwise watch for its connection
        var devices = await HID.devicesAsync();
        // console.log(devices.filter(device => device.vendorId == 18003))
        var device = devices.find(device => device.vendorId == 0x4653 && device.productId == 0x0001 && device.usagePage == 0xFF60 && device.usage == 0x61);
        // device = devices.find(device => device.vendorId == 18003 && device.productId == 1 && device.usagePage == 65376 && device.usage == 116);
        if (!device) return
        try {
            if (!device.path) throw("not string")
            this.device = await HID.HIDAsync.open(device.path);
            // console.log(hiddev.getDeviceInfo())
            if (!this.device) return
            console.log('Connected to device')
            this.emit("connected")
            this.modules.forEach((m) => {
                this.intervalIDs.push(setInterval(m.f, m.freq, this, ...m.args))
            })
            // tray.setContextMenu(contextMenu())
            return true
    
        } catch (error) {
            console.error(error)
            // setTimeout(connectToDevice, 1000)
        }
    
    }

    write = (msg: number[] | Buffer) => {
        if (this.device) this.device.write(msg)
    }
    
}