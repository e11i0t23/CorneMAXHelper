const ImageMode = {
    /*Helper ARGB formats. Used internally*/
    ICF_TRUE_COLOR_ARGB8332: 0,
    ICF_TRUE_COLOR_ARGB8565: 1,
    ICF_TRUE_COLOR_ARGB8565_RBSWAP: 2,
    ICF_TRUE_COLOR_ARGB8888: 3,
    CF_ALPHA_1_BIT: 4,
    CF_ALPHA_2_BIT: 5,
    CF_ALPHA_4_BIT: 6,
    CF_ALPHA_8_BIT: 7,
    CF_INDEXED_1_BIT: 8,
    CF_INDEXED_2_BIT: 9,
    CF_INDEXED_4_BIT: 10,
    CF_INDEXED_8_BIT: 11,
    CF_RAW: 12,
    CF_RAW_CHROMA: 12,
    CF_RAW_ALPHA: 13,

    /*Helper formats if C arrays contains all true color formats (used in "download")*/
    CF_TRUE_COLOR: 14,
    CF_TRUE_COLOR_ALPHA: 15,
    CF_TRUE_COLOR_CHROMA: 16,

    /*New formats in v8.3+*/
    CF_RGB565A: 0,
};

class ImageModeUtil {
    static isTrueColor(mode) {
        console.log(mode)
        if (typeof mode != 'string')
            mode = ImageMode[mode];
        // return mode.startsWith("CF_TRUE_COLOR");
        return mode >= 15 && mode <= 16;
    }
}

const OutputMode = {
    C: 0,
    BIN: 1
}


const BINARY_FORMAT_PREFIX = "ICF_TRUE_COLOR_";

const CODES = {
    TIME: 0x00,
    CPU: 0x01,
    GPU: 0x02,
    RAM: 0x03,
    VOL: 0x04,
    NOW_PLAYING: 0x05,
    IMAGE: 0x06,
    IMG_FULLSIZE: 0x07,
}

const HALF = {
    MASTER: 0x00,
    SLAVE: 0x01
}

module.exports = { ImageMode, ImageModeUtil, OutputMode, BINARY_FORMAT_PREFIX, CODES, HALF };