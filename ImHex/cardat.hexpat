// Terep2's CAR.DAT
//
// source:
//      https://github.com/Zi9/Deformerz/blob/master/docs/TEREP2_DAT_car_model_format.md
//      https://github.com/Zi9/Deformerz/blob/master/src/LibTerep/TerepCar.c
//
// 2026, gmb

#include <std/mem.pat>  // std::mem::size()
#include <std/io.pat>   // std::print()

#pragma endian little

struct Header {
    u16 chunk1_start;
    u16 chunk2_start;
    u16 chunk3_start;
    u16 unknown1;
    u16 unknown2;
};

enum PointType : u16 {
    GEMOETRY = 0,
    WHEEL_REAR = 1,
    WHEEL_FRONT = 2,
    CAMERA = 65535,
};

struct Point {
    u16 unknown1;
    s16 x;
    u16 unknown2;
    s16 z;
    u16 unknown3;
    s16 y;
    u8 unknown4[12];    // maybe 3x2 u16
    u16 size;
    PointType type;
};

enum PhysLinkType : u16 {
    SUSP_EXTRA = 0,
    NORMAL = 1,
    SUSP_REAR = 4 | 6,
    SUSP_FRONT = 10 | 12,
};

struct PhysLink {
    u16 point_index_a;
    u16 point_index_b;
    u16 length;
    u16 unknown1;       // has the same value as length
    PhysLinkType type;
    u16 unknown2;
    u16 unknown3;
};

struct CameraProperty {
    u16 point_index_times2; // scaled by 2
    u8 unknown1;
    u8 unknown2;
};

struct Chunk3Type3 {
    s16 data[6];
};

struct ColoredPolygon {
    u8 count;
    u16 point_index_times2[count + 1]; // scaled by 2
    u8 color1;
    u8 color2;
};

struct TexturedPoly {
    u16 point_index_times2;     // scaled by 2
    u16 uvx;                    // scaled by 65535.0
    u16 uvy;                    // scaled by 65535.0
};

struct TexturedPolygon {
    u8 count;
    TexturedPoly data[count + 1];
};

struct WheelProperties {
   u16 point_index_times2;      // scaled by 2
   u16 unknown1;
   u16 unknown2;
};

struct Chunk3Type246 {
    u8 data[19];
};

struct Chunk3Data {
    u8 type;

    if (type == 0) {
        // nothing
    } else if (type == 1) {
        CameraProperty data;
    } else if (type == 3) {
        Chunk3Type3 data;
    } else if (type == 4) {
        ColoredPolygon data;
    } else if (type == 8) {
        TexturedPolygon data;
    } else if (type == 10) {
        WheelProperties data;
    } else if (type == 69 || type == 246) {
        Chunk3Type246 data;
    } else {
        std::print("unknown Chunk3Data type: {}\n", type);
    }
};

Header header @ 0x0;
u16 num_points @ header.chunk1_start;
Point points[num_points] @ header.chunk1_start + sizeof(num_points);
u16 num_links @ header.chunk2_start;
PhysLink links[num_links] @ header.chunk2_start + sizeof(num_links);
Chunk3Data chunk3[while($ < std::mem::size())] @ header.chunk3_start;
