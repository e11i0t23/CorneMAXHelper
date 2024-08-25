require("dotenv").config
const { app, Tray, Menu, nativeImage, BrowserWindow, shell, protocol, session, dialog } = require('electron')
const HID = require('node-hid')
const {usb, WebUSB} = require('usb')
const si = require('systeminformation');
const dayjs = require('dayjs')
// const { SpotifyApi } = require('@spotify/web-api-ts-sdk');
const { convertImageBlob } = require("./converter");
const { ImageMode, OutputMode, CODES, HALF } = require('./enums');
const { loadImage } = require('@napi-rs/canvas');
const path = require("path")
const {readFileSync} = require("fs")
const {loadConfigFile, saveNewConfig} = require("./helpers")


const userPath = app.getPath("userData")

const clientId = process.env.CLIENT_ID
const redirectUri = 'http://localhost.com:3961/spotify-callback';

let config
let tray
let intervalIDDev
let intervalIDSync
let intervalIDSpotify
let hiddev
let codeVerifier
let nowPlaying
let connected = false

const webusb = new WebUSB({
    allowAllDevices: true
});

const connectSpotify = () => {
    console.log('Connecting to Spotify')
    // const sdk = SpotifyApi.performUserAuthorization(client_id, "http://localhost.com:3961/spotify-callback", ["user-read-playback-state"], (accesstoken) => {
    //     console.log(accesstoken)
    // });
    spotifyAuth()
}

if (require('electron-squirrel-startup')) {
    console.log("quitting")
    app.quit()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

const contextMenu = () => Menu.buildFromTemplate(connected ? [
    { label: "Connected"  },
    // { label: 'Link Spotify', click: connectSpotify },
    { label: 'Upload Master', click: () => uploadImage(0x00) },
    { label: 'Upload Slave', click: () => uploadImage(0x01) },
    { label: 'Quit', click: app.quit }
]: [
    { label: "Disconnected" },
    { label: 'Quit', click: app.quit }
])

app.on("ready", async () => {
    config = await loadConfigFile(userPath)
    // const partition = 'persist:electron'
    // const ses = session.fromPartition(partition)
    // console.log(path.join(path.dirname(), "logo.png"))
    const icon = nativeImage.createFromPath( path.join(__dirname, "../logoTemplate.png"))
    tray = new Tray(icon)
    tray.setToolTip('Mechboards Max Helper')
    tray.setContextMenu(contextMenu())
    console.log('Tray created')

    // ses.protocol.handle('mechboards', (request) => {
    //     console.log(request.url)
    //     const filePath = request.url.slice('mechboards://'.length)
    //     return
    // })

    connectToDevice()
})

const connectToDevice = async () => {

    // See if the keyboard is already connected to the PC, if it is connect to the HID device otherwise watch for its connection
    var devices = await HID.devicesAsync();
    // console.log(devices.filter(device => device.vendorId == 18003))
    device = devices.find(device => device.vendorId == 0x4653 && device.productId == 0x0001 && device.usagePage == 0xFF60 && device.usage == 0x61);
    // device = devices.find(device => device.vendorId == 18003 && device.productId == 1 && device.usagePage == 65376 && device.usage == 116);
    if (!device) return false
    try {
        hiddev = await HID.HIDAsync.open(device.path);
        // console.log(hiddev.getDeviceInfo())
        if (!hiddev) return false
        connected = true;
        console.log('Connected to device')
        intervalIDSync = setInterval(sync, 5000)
        intervalIDSpotify = setInterval(getUserPlayback, 10000)
        // getUserPlayback()
        tray.setContextMenu(contextMenu())
        return true

    } catch (error) {
        console.error(error)
        setTimeout(connectToDevice, 1000)
    }

}

// webusb.addEventListener('connect', async (device) => {
//     device = device.device
//     if (connected) return
//     if (!(device.vendorId == Number(0x4653) && device.productId == Number(0x0001))) return
//     console.log('Keyboard attached, connecting to device')
//     connectToDevice()

// });

usb.on("attach", async (device) => {

    if (connected) return
    if (!(device.deviceDescriptor.idVendor == Number(0x4653) && device.deviceDescriptor.idProduct == Number(0x0001))) return
    console.log('Keyboard attached, connecting to device')
    connectToDevice()
})

usb.on('detach', (device) => {
    console.log("something disconnected")
    if (device.deviceDescriptor.idVendor == Number(0x4653) && device.deviceDescriptor.idProduct == Number(0x0001)) {
        connected = false;
        hiddev.close()
        hiddev = null;
        tray.setContextMenu(contextMenu())
        console.log("Discconected device")
        try {
            clearInterval(intervalIDSync)
            clearInterval(intervalIDSpotify)
        } catch (error) { }

    }
});
// webusb.addEventListener('disconnect', (device) => {
//     console.log("something disconnected")
//     device = device.device
//     if (device.vendorId == Number(0x4653) && device.productId == Number(0x0001)) {
//         connected = false;
//         hiddev.close()
//         hiddev = null;
//         tray.setContextMenu(contextMenu())
//         console.log("Discconected device")
//         try {
//             clearInterval(intervalIDSync)
//             clearInterval(intervalIDSpotify)
//         } catch (error) { }

//     }
// });

function string2bytes(str) {
    let utf8Encode = new TextEncoder();
    return utf8Encode.encode(str);
}

const sync = async () => {
    half = HALF.MASTER
    // mem
    mem = await si.mem()
    hiddev.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.RAM, half, Math.round(mem.active / (mem.used + mem.free) * 100)]))
    // cpu
    cpu = await si.currentLoad()
    hiddev.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.CPU, half, (Math.round(cpu.currentLoad) )]))
    // // gpu
    gpu = await si.graphics()
    hiddev.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.GPU, half, (Math.round(gpu.controllers[0].utilizationGpu) )]))
    // time
    var d = new Date(); // for now
    hiddev.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.TIME, half, ...string2bytes(`${dayjs(d).format("hh:mm")}`)]))
    // hiddev.write([0xFF, CODES.TIME, ...string2bytes(`${dayjs(d).format("hh:mm")}`)])
}

const spotifyAuth = async () => {


    codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier)
    const codeChallenge = base64encode(hashed);
    // const redirectUri = 'http://localhost.com:3961/spotify-callback';

    const scope = 'user-read-playback-state';
    const authUrl = new URL("https://accounts.spotify.com/authorize")


    const params = {
        response_type: 'code',
        client_id: clientId,
        scope,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
    }

    authUrl.search = new URLSearchParams(params).toString();

    const win = new BrowserWindow({ width: 800, height: 600 })

    win.loadURL(authUrl.toString())
    // win.webContents.openDevTools()
    win.webContents.on('will-navigate', (event, url) => {
        // console.log("will-navigate", url)
        if (!url.startsWith(redirectUri)) return
        const urlParams = new URLSearchParams(url.replace(redirectUri + '?', ''));
        // console.log(urlParams)
        let code = urlParams.get('code');
        handleSpotifyCallback(code)
        event.preventDefault()
        win.hide()
    })
    // Load a remote URL
    // shell.openExternal(authUrl.toString())
}

const generateRandomString = (length) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}


const sha256 = async (plain) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(plain)
    return crypto.subtle.digest('SHA-256', data)
}

const base64encode = (input) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

const handleSpotifyCallback = async (code) => {
    console.log(code)
    const payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        }),
    }

    const body = await fetch("https://accounts.spotify.com/api/token", payload);
    const response = await body.json();
    // console.log(response)
    config.accessToken = response.access_token;
    config.refreshToken = response.refresh_token;
    console.log("access " + config.accessToken)
    console.log("refresh " + config.refreshToken)
    saveNewConfig(userPath, config)
}

const getUserPlayback = async () => {
    let buffer = []
    const payload = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${config.accessToken}`,
        },
    }

    const body = await fetch("https://api.spotify.com/v1/me/player", payload);
    // console.log(body)
    const response = await body.json();
    if (response.error) {
        console.log(response.error)
        if (response.error.status == 401) {
            refreshSpotifyToken(getUserPlayback)
        }
        return
    }
    // console.log(response)
    // console.log(response.item.album.images)
    if (response.item.id != nowPlaying) {
        nowPlaying = response.item.id
                const image = await loadImage(response.item.album.images[2].url)
        const convertedImage = await convertImageBlob(image, {
            dith: false,
            cf: ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
            outputFormat: OutputMode.BIN,
            binaryFormat: ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
            swapEndian: false,
            outName: "image",
            useLegacyFooterOrder: false,
            use565A8alpha: false,
            overrideWidth: 64,
            overrideHeight: 64,
        })
        const imageBytesArray = new Uint8Array(convertedImage)
        // console.log(imageBytesArray)
        for (let i = 0; i < imageBytesArray.length; i += 26) {
            x = i / 26
            // console.log("test")
            buffer[x] = new Uint8Array([0xFF, 0x07, 0x00, CODES.IMAGE, 0x01, ...splitUint16(x), ...imageBytesArray.slice(i, i + 26)])
            // buffer[x] = new Uint8Array([0xFF, CODES.IMAGE, ...splitUint16(x), ...imageBytesArray.slice(i, i + 28)])
            // console.log(buffer[x])
            setTimeout(hiddev.write, x, buffer[x])
            //hiddev.write([0xFF, CODES.IMAGE, (x <= 255 ? x : 0xFF), (x <= 255 ? 0x00 : (x - 255)), ...imageBytesArray.slice(i, i + 28)])
        }
        // data = [0xFF, CODES.NOW_PLAYING, ...string2bytes(response.item.name)]
        // console.log(data.length)
        // console.log(response.item.name)
        hiddev.write([0xFF, 0x07, 0x00, CODES.NOW_PLAYING, 0x01, ...string2bytes(response.item.name)])
        // hiddev.write([0xFF, CODES.NOW_PLAYING, ...string2bytes(response.item.name)])
        // hiddev.write([0xFF, CODES.IMAGE, ...imageBytesArray])
    }
}

function splitUint16(value) {
    // Ensure the value is within the range of uint16
    const uint16Value = value & 0xFFFF;

    // Split the uint16 value into two uint8 values
    const highByte = (uint16Value >> 8) & 0xFF; // High byte (most significant 8 bits)
    const lowByte = uint16Value & 0xFF;         // Low byte (least significant 8 bits)
    // console.log(value, uint16Value, highByte, lowByte)
    return [highByte, lowByte];
}


const refreshSpotifyToken = async (func) => {
    const url = "https://accounts.spotify.com/api/token";

    const payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: config.refreshToken,
            client_id: clientId
        }),
    }

    const body = await fetch(url, payload);
    const response = await body.json();
    if (body.status == 200) {

        console.log('access_token', response.accessToken);
        console.log('refresh_token', response.refreshToken)
        config.accessToken = response.accessToken;
        config.refreshToken = response.refreshToken;
        saveNewConfig(userPath, config)
        return func()
    } else {
        console.log(response)
        spotifyAuth()
    }

}


const uploadImage = async (half) => {
    let buffer = []
    const OF = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] })
    if (OF.canceled) return
    if (OF.filePaths.length == 0) return
    const image = await loadImage(OF.filePaths[0])
    const convertedImage = await convertImageBlob(image, {
        dith: false,
        cf: ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
        outputFormat: OutputMode.BIN,
        binaryFormat: ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
        swapEndian: false,
        outName: "image",
        useLegacyFooterOrder: false,
        use565A8alpha: false,
        overrideWidth: 80,
        overrideHeight: 160,
    })
    // remove first 4 bytes that are nonsense
    const convertImageFix = convertedImage.slice(4)
    const imageBytesArray = new Uint8Array(convertImageFix)
    // console.log(imageBytesArray)
    for (let i = 0; i < imageBytesArray.length; i += 26) {
        x = i / 26
        buffer[x] = new Uint8Array([0xFF, 0x07, 0x00, CODES.IMG_FULLSIZE, half, ...splitUint16(x), ...imageBytesArray.slice(i, i + 26)])
        // buffer[x] = new Uint8Array([0xFF, 0xFF, code, ...splitUint16(x), ...imageBytesArray.slice(i, i + 28)])
        setTimeout(hiddev.write, x, buffer[x])
    }
}