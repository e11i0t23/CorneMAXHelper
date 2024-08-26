import type { Config } from "../helpers";
import { string2bytes } from "../helpers";
import { CODES, HALF } from "../types";
import { uploadImage } from "../uploadImage";
import { loadImage } from "@napi-rs/canvas";
import { BrowserWindow } from "electron";
import { Device } from "../device";

let codeVerifier: string
let nowPlaying: number | undefined

const clientId = process.env.CLIENT_ID || ""
const redirectUri = 'http://localhost.com:3961/spotify-callback';

export const spotifyAuth = async (c: Config) => {
    codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier)
    const codeChallenge = base64encode(hashed);

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

    const win = new BrowserWindow({ width: 800, height: 600, icon: "./images/icon"})

    win.loadURL(authUrl.toString())
    // win.webContents.openDevTools()
    win.webContents.on('will-navigate', (event, url) => {
        // console.log("will-navigate", url)
        if (!url.startsWith(redirectUri)) return
        const urlParams = new URLSearchParams(url.replace(redirectUri + '?', ''));
        // console.log(urlParams)
        let code = urlParams.get('code');
        handleSpotifyCallback(code!, c)
        event.preventDefault()
        win.hide()
    })
    // Load a remote URL
    // shell.openExternal(authUrl.toString())
}

const generateRandomString = (length:number) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}


const sha256 = async (plain:string) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(plain)
    return crypto.subtle.digest('SHA-256', data)
}

const base64encode = (input: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

const handleSpotifyCallback = async (code:string, c:Config) => {
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
    c.updateConfig({...c.config, accessToken: response.access_token, refreshToken: response.refresh_token})
}

export const getUserPlayback = async (d: Device, c: Config) => {
    let buffer: Uint8Array[] = []
    const payload = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${c.config.accessToken}`,
        },
    }

    const body = await fetch("https://api.spotify.com/v1/me/player", payload);

    const response = await body.json();
    if (response.error) {
        if (response.error.status == 401) {
            refreshSpotifyToken(getUserPlayback, c)
        }
        return
    }

    if (response.item.id != nowPlaying) {
        nowPlaying = response.item.id
        const image = await loadImage(response.item.album.images[2].url)
        uploadImage(d, CODES.IMAGE, HALF.SLAVE, image, 64, 64)

        // Upload Name
        d.write( CODES.NOW_PLAYING, 0x01, string2bytes(response.item.name))
    }
}

const refreshSpotifyToken = async (func: any, c: Config) => {
    const url = "https://accounts.spotify.com/api/token";

    const payload: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: c.config.refreshToken as string,
            client_id: clientId
        }),
    }

    const body = await fetch(url, payload);
    const response = await body.json();
    if (body.status == 200) {
        c.updateConfig({...c.config, accessToken: response.access_token, refreshToken: response.refresh_token})
        return func()
    } else {
        console.log(response)
        spotifyAuth(c)
    }

}