import type { Config } from "../helpers";
import { string2bytes } from "../helpers";
import { CODES, HALF } from "../types";
import { uploadImage } from "../uploadImage";
import { loadImage } from "@napi-rs/canvas";
import { BrowserWindow } from "electron";
import { Device } from "../device";

let codeVerifier: string;
let nowPlaying: number | undefined;
let inauth = false;
let lastProgress: number = 0;

const clientId = process.env.CLIENT_ID || "";
const redirectUri = "http://localhost.com:3961/spotify-callback";

/**
 * Authenticate with Spotify
 *
 * @async
 * @param {Config} c - The configuration object
 * @returns {void}
 */
export const spotifyAuth = async (c: Config) => {
  // ensure only one auth window is open
  if (inauth) return;
  inauth = true;

  // Generate a code verifier and challenge
  codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  const scope = "user-read-playback-state";
  const authUrl = new URL("https://accounts.spotify.com/authorize");

  const params = {
    response_type: "code",
    client_id: clientId,
    scope,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
  };

  authUrl.search = new URLSearchParams(params).toString();

  // Open the auth window
  const win = new BrowserWindow({ width: 800, height: 600, icon: "./images/icon" });
  win.loadURL(authUrl.toString());
  win.show();
  // Handle the callback by wathcing for the redirect uri
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(redirectUri)) return;
    const urlParams = new URLSearchParams(url.replace(redirectUri + "?", ""));
    let code = urlParams.get("code");
    handleSpotifyCallback(code!, c);
    event.preventDefault();
    win.hide();
  });
};

/**
 * Generate a random string
 *
 * @param {number} length - The length of the string to generate
 * @returns {string} - The generated string
 */
const generateRandomString = (length: number): string => {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};

/**
 * Generate a SHA256 hash
 *
 * @async
 * @param {string} plain - The string to hash
 * @returns {Promise<ArrayBuffer>} - The hashed string
 */
const sha256 = async (plain: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
};

/**
 * Encode a string to base64
 *
 * @param {ArrayBuffer} input - The string to encode
 * @returns {string} - The encoded string
 */
const base64encode = (input: ArrayBuffer) => {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

/**
 * Handle the Spotify Auth callback and update the config
 *
 * @async
 * @param {string} code - The code from the callback
 * @param {Config} c - The configuration object
 * @returns {void}
 */
const handleSpotifyCallback = async (code: string, c: Config) => {
  const payload = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  };

  const body = await fetch("https://accounts.spotify.com/api/token", payload);
  const response = await body.json();
  c.updateConfig({ ...c.config, accessToken: response.access_token, refreshToken: response.refresh_token });
  inauth = false;
};

/**
 * Get the user's current playback
 *
 * @async
 * @param {Device} d - The device to write to
 * @param {Config} c - The configuration object
 * @returns {*}
 */
export const getUserPlayback = async (d: Device, c: Config) => {
  // If in the process of authenticating, return
  if (inauth) return false;
  let buffer: Uint8Array[] = [];
  // Get the user's current playback
  const payload = {
    method: "GET",
    headers: {
      Authorization: `Bearer ${c.config.accessToken}`,
    },
  };

  const body = await fetch("https://api.spotify.com/v1/me/player", payload);
  const response = await body.json();

  // Handle errors
  if (response.error) {
    // 401 is an expired token
    if (response.error.status == 401) {
      return refreshSpotifyToken(getUserPlayback, c, [d, c]);
    }
    return false;
  }
  // If no item is playing, return
  if (!response.item) return false;

  // Calculate the progress of the current item
  let progress = Math.round((response.progress_ms / response.item.duration_ms) * 100);
  if (Math.abs(progress - lastProgress) > 1) {
    d.write(CODES.PROGRESS, HALF.SLAVE, [progress]);
    lastProgress = progress;
  }
  // If the item playing is not the same as the last one uploaded, upload the new item
  if (response.item.id != nowPlaying) {
    nowPlaying = response.item.id;
    // Upload Album Art
    const image = await loadImage(response.item.album.images[2].url);
    uploadImage(d, CODES.IMAGE, HALF.SLAVE, image, 64, 64);
    // Upload Name
    d.write(CODES.NOW_PLAYING, 0x01, string2bytes(response.item.name));
  }
  return true;
};

/**
 * Refresh the Spotify token
 *
 * @async
 * @param {*} func - The function to call after the token is refreshed
 * @param {Config} c - The configuration object
 * @param {?any[]} [args] - The arguments to pass to the function
 * @returns {unknown} - The result of the function
 */
const refreshSpotifyToken = async (func: any, c: Config, args?: any[]) => {
  inauth = true;
  const url = "https://accounts.spotify.com/api/token";

  const payload: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: c.config.refreshToken as string,
      client_id: clientId,
    }),
  };

  const body = await fetch(url, payload);
  const response = await body.json();
  if (body.status == 200) {
    c.updateConfig({ ...c.config, accessToken: response.access_token, refreshToken: response.refresh_token });
    inauth = false;
    if (args) return func(...args);
    return func();
  } else {
    console.log(response);
    spotifyAuth(c);
  }
};
