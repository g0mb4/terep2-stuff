# pcx2png

Utility that converts the .PCX images used by Terep2 to .PNG images.
It uses [stb_image_write.h](https://github.com/nothings/stb) to create the PNG files.
Tested on Linux and on Windows (using WSL).

## Usage

```bash
pcx2png file.pcx
```

## Compilation

```
cc pcx2png.c -o pcx2png
```