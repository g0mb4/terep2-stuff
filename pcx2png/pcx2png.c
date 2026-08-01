/*
    PCX to PNG converter

    PCX FILE FORMAT:
    https://web.archive.org/web/20030111010058/http://www.nist.fss.ru/hr/doc/spec/pcx.htm

    2025-2026, gmb
*/

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#define PCX_HDR_ID 0x0A

#define PCX_RLE_COUNT_MASK  0xC0

#define PCX_PALETTE_256_COUNT   256
#define PCX_PALETTE_256_FPOS    -769    // from the END of the file
#define PCX_PALETTE_CHECK_BYTE  12      // present in the start of the palette

struct pcx_header {
    uint8_t id;                 // 0x0A
    uint8_t version;            // 0, 2, 3, 4, 5
    uint8_t encoding;           // 0 - no encoding, 1 - RLE
    uint8_t bits_per_pixel;     // number of bits constituting one plane
    uint16_t min_x;             // minimum x co-ordinate of the image position
    uint16_t min_y;             // minimum y co-ordinate of the image position
    uint16_t max_x;             // maximum x co-ordinate of the image position
    uint16_t max_y;             // maximum y co-ordinate of the image position
    uint16_t horizontal_dpi;    // horizontal image resolution in DPI
    uint16_t vertical_dpi;      // vertical image resolution in DPI.
    uint8_t ega_palette[48];    // EGA palette for 16-color images
    uint8_t reserved_1;
    uint8_t no_color_planes;    // number of color planes constituting the pixel data
    uint16_t bytes_per_line;    // number of bytes of one color plane representing a single scan line
    uint16_t palette_mode;      // 1 - monochrome/color, 2 - grayscale
    uint16_t source_horizontal; // horizontal resolution of the source system's screen
    uint16_t source_vertical;   // vertical resolution of the source system's screen
    uint8_t reserved_2[54];
};

struct color {
    uint8_t r;
    uint8_t g;
    uint8_t b;
};

#define ERRRET   ret = 1; goto end;

#define GET_BYTE(b)                                         \
    do {                                                    \
        b = fgetc(fp);                                      \
        if (b == EOF) {                                     \
            fprintf(stderr, "unexpected end of file\n");    \
            ERRRET;                                         \
        }                                                   \
    } while(0)

int main(int argc, char **argv)
{
    const char *infile;
    FILE *fp;
    size_t nread;
    struct pcx_header head;
    int ret = 0;
    int width, height;
    struct color *img = NULL;
    int byte;
    struct color *palette = NULL;
    int channels = sizeof(struct color);
    
    char outfile[256];
    
    if (argc != 2) {
        fprintf(stderr, "usage: pcx2png file.pcx\n");
        return 1;
    }
    
    infile = argv[1];
    fp = fopen(infile, "rb");
    if (fp == NULL) {
        perror("fopen");
        return 1;
    }
    
    // TODO: make it endian aware! works on x86(_64)
    nread = fread(&head, 1, sizeof(head), fp);
    if (nread != sizeof(head)) {
        fprintf(stderr, "invalid PCX file\n");
        ERRRET;
    }
    
    if (head.id != PCX_HDR_ID) {
        fprintf(stderr, "invalid PCX id: %d\n", head.id);
        ERRRET;
    }
    
    if (head.version != 5) {
        fprintf(stderr, "not supported version: %d\n", head.version );
        ERRRET;
    }
    
    if (head.encoding != 0x01) {
        fprintf(stderr, "not supported encoding: %d\n", head.encoding);
        ERRRET;
    }
    
    if (head.bits_per_pixel != 8) {
        fprintf(stderr, "not supported bits per pixel: %d\n", head.bits_per_pixel);
        ERRRET;
    }
    
    if (head.no_color_planes != 1) {
        fprintf(stderr, "not supported number of color planes: %d\n", head.no_color_planes);
        ERRRET;
    }
    
    if (fseek(fp, PCX_PALETTE_256_FPOS, SEEK_END) < 0) {
        perror("fseek");
        ERRRET;
    }
    
    byte = fgetc(fp);
    if (byte != PCX_PALETTE_CHECK_BYTE) {
        fprintf(stderr, "invalid palette: %d\n", byte);
        ERRRET;
    }
    
    palette = (struct color*)malloc(PCX_PALETTE_256_COUNT * sizeof(struct color));
    if (!palette) {
        fprintf(stderr, "malloc failed\n");
        ERRRET;
    }
    
    nread = fread(palette, sizeof(struct color), PCX_PALETTE_256_COUNT, fp);
    if (nread != PCX_PALETTE_256_COUNT) {
        fprintf(stderr, "invalid palette\n");
        ERRRET;
    }
    
    width = head.max_x - head.min_x + 1;
    height = head.max_y - head.min_y + 1;
    
    img = (struct color*)malloc(width * height * sizeof(struct color));
    if (!img) {
        fprintf(stderr, "malloc failed\n");
        ERRRET;
    }
    
    if (fseek(fp, sizeof(head), SEEK_SET) < 0) {
        perror("fseek");
        ERRRET;
    }
    
    int total_bytes_pers_scanline = head.no_color_planes * head.bytes_per_line;
    for (int y = 0; y < height; ++y) {
        for (int n = 0, x = 0; n < total_bytes_pers_scanline; ) {
            GET_BYTE(byte);
            
            int count = 1;
            
            if ((byte & PCX_RLE_COUNT_MASK) == PCX_RLE_COUNT_MASK) {
                count = byte & ~PCX_RLE_COUNT_MASK;
                GET_BYTE(byte);
            }
            
            for (int j = 0; j < count; j++, n++, x++) {
                /* ignore unused data in scanline */
                if (n >= width)
                    continue;
                
                if (x >= width) {
                    fprintf(stderr, "scanline overflow\n");
                    ERRRET;
                }
                
                int index = y * width + x;
                img[index] = palette[byte];
            }
        }
    }
    
    int n = strlen(infile);
    strncpy(outfile, infile, sizeof(outfile));
    outfile[n - 3] = 'p';
    outfile[n - 2] = 'n';
    outfile[n - 1] = 'g';
    
    stbi_write_png(outfile, width, height, channels, img, width * channels);

end:
    free(img);
    free(palette);
    fclose(fp);
    return ret;
}