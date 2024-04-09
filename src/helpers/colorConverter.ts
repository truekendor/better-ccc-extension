// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Color {
  // formulas are taken from
  // https://css-tricks.com/converting-color-spaces-in-javascript/

  static RGBToHSLStr(r: number, g: number, b: number) {
    // Make r, g, and b fractions of 1
    r /= 255;
    g /= 255;
    b /= 255;

    // Find greatest and smallest channel values
    const cmin = Math.min(r, g, b);
    const cmax = Math.max(r, g, b);
    const delta = cmax - cmin;

    let h = 0;
    let s = 0;
    let l = 0;

    // Calculate hue
    // No difference
    if (delta == 0) h = 0;
    // Red is max
    else if (cmax == r) h = ((g - b) / delta) % 6;
    // Green is max
    else if (cmax == g) h = (b - r) / delta + 2;
    // Blue is max
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);

    // Make negative hues positive behind 360°
    if (h < 0) h += 360;

    // Calculate lightness
    l = (cmax + cmin) / 2;

    // Calculate saturation
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    // Multiply l and s by 100
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return "hsl(" + h + "," + s + "%," + l + "%)";
  }

  static RGBToHSLArray(
    r: number,
    g: number,
    b: number
  ): [number, number, number] {
    // Make r, g, and b fractions of 1
    r /= 255;
    g /= 255;
    b /= 255;

    // Find greatest and smallest channel values
    const cmin = Math.min(r, g, b);
    const cmax = Math.max(r, g, b);
    const delta = cmax - cmin;

    let h = 0;
    let s = 0;
    let l = 0;

    // Calculate hue
    // No difference
    if (delta == 0) h = 0;
    // Red is max
    else if (cmax == r) h = ((g - b) / delta) % 6;
    // Green is max
    else if (cmax == g) h = (b - r) / delta + 2;
    // Blue is max
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);

    // Make negative hues positive behind 360°
    if (h < 0) h += 360;

    // Calculate lightness
    l = (cmax + cmin) / 2;

    // Calculate saturation
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    // Multiply l and s by 100
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return [h, s, l];
  }

  static hexToRGBStr(hexString: string): string {
    let r = "";
    let g = "";
    let b = "";

    // 3 digits
    if (hexString.length == 4) {
      r = "0x" + hexString[1] + hexString[1];
      g = "0x" + hexString[2] + hexString[2];
      b = "0x" + hexString[3] + hexString[3];

      // 6 digits
    } else if (hexString.length == 7) {
      r = "0x" + hexString[1] + hexString[2];
      g = "0x" + hexString[3] + hexString[4];
      b = "0x" + hexString[5] + hexString[6];
    }

    return `rgb(${parseInt(r)},${parseInt(g)},${parseInt(b)})`;
  }

  static hexToRGBArray(hexString: string): [number, number, number] {
    let r = "";
    let g = "";
    let b = "";

    // 3 digits
    if (hexString.length == 4) {
      r = "0x" + hexString[1] + hexString[1];
      g = "0x" + hexString[2] + hexString[2];
      b = "0x" + hexString[3] + hexString[3];

      // 6 digits
    } else if (hexString.length == 7) {
      r = "0x" + hexString[1] + hexString[2];
      g = "0x" + hexString[3] + hexString[4];
      b = "0x" + hexString[5] + hexString[6];
    }

    return [parseInt(r), parseInt(g), parseInt(b)];
  }
}
