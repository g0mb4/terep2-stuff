// PCX used by Terep2
//
// source: https://web.archive.org/web/20030111010058/http://www.nist.fss.ru/hr/doc/spec/pcx.htm
//
// 2026, gmb

#include <std/mem.pat>  // std::mem::size()
#include <std/io.pat>   // std::print()

#pragma endian big

#define PALETTE_COUNT 256
#define PALETTE_SIZE  (256*3) 


struct Id {
    u8 id;
    
    if (id != 0x0A) {
       std::error("Inavlid PCX file\n");
       break;
    }
};

enum Version : u8 {
    V2_5 = 0,
    V2_8_PALETTE = 2,
    V2_8_NO_PALETTE = 3,
    PC_PAINTBRUSH = 4,
    V3 = 5,
};

enum Encoding : u8 {
    NO = 0,
    RLE = 1,
};

struct Color {
    u8 R;
    u8 G;
    u8 B;
};

struct Header {
    Id id;
    Version version;
    Encoding encoding;
    u8 bits_per_pixel;     // number of bits constituting one plane
    u8 min_x;              // minimum x co-ordinate of the image position
    u16 min_y;             // minimum y co-ordinate of the image position
    u16 max_x;             // maximum x co-ordinate of the image position
    u16 max_y;             // maximum y co-ordinate of the image position
    u16 horizontal_dpi;    // horizontal image resolution in DPI
    u16 vertical_dpi;      // vertical image resolution in DPI.
    u8 ega_palette[48];    // EGA palette for 16-color images
    u8 reserved_1;
    u8 no_color_planes;    // number of color planes constituting the pixel data
    u16 bytes_per_line;    // number of bytes of one color plane representing a single scan line
    u16 palette_info;
    u16 source_horizontal; // horizontal resolution of the source system's screen
    u16 source_vertical;   // vertical resolution of the source system's screen
    u8 reserved_2[54];
};

Header header @ 0x00;
Color palette[PALETTE_COUNT] @ std::mem::size() - PALETTE_SIZE;
