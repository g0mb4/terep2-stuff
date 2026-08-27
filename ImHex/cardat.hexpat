// Terep2's CAR.DAT
//
// source: https://github.com/Zi9/Deformerz/blob/master/src/LibTerep/TerepCar.c
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

enum DataPoint1Type : u16 {
    GEMOETRY = 0,
    WHEEL_REAR = 1,
    WHEEL_FRONT = 2,
    CAMERA = 65535,
};

struct DataPoint1 {
    u16 unknown1;
    u16 x;
    u16 unknown2;
    u16 z;
    u16 unknown3;
    u16 y;
    u8 unknown4[12];    // maybe 3x2 u16
    u16 size;
    DataPoint1Type type;
};

enum DataPoint2Type : u16 {
    SUSP_EXTRA = 0,
    NORMAL = 1,
    SUSP_REAR = 4 | 6,
    SUSP_FRONT = 10 | 12,
};

struct DataPoint2 {
    u16 point1_index_a;
    u16 point1_index_b;
    u16 unknown1;
    u16 unknown2;
    DataPoint2Type type;
    u16 unknown3;
    u16 unknown4;
};

struct DataPoint3Type1 {
    u16 camera_point1_index_times2; // scaled by 2
    u8 unknown1;
    u8 unknown2;
};

struct DataPoint3Type3 {
    s16 data[6];
};

struct DataPoint3Type4 {
    u8 count;
    u16 point1_index_times2[count + 1]; // scaled by 2
    u8 color1;
    u8 color2;
};

struct TexturedPolygon {
    u16 point1_index_times2;    // scaled by 2
    u16 uvx;                    // scaled by 65535.0
    u16 uvy;                    // scaled by 65535.0
};

struct DataPoint3Type8 {
    u8 count;
    TexturedPolygon data[count + 1];
};

struct DataPoint3Type10 {
   u16 wheel_point1_index_times2;  // scaled by 2
   u16 unknown1;
   u16 unknown2;
};

struct DataPoint3Type246 {
    u8 data[19];
};

struct DataPoint3 {
    u8 type;

    if (type == 0) {
        // nothing
    } else if (type == 1) {
        DataPoint3Type1 data;
    } else if (type == 3) {
        DataPoint3Type3 data;
    } else if (type == 4) {
        DataPoint3Type4 data;
    } else if (type == 8) {
        DataPoint3Type8 data;
    } else if (type == 10) {
        DataPoint3Type10 data;
    } else if (type == 69 || type == 246) {
        DataPoint3Type246 data;
    } else {
        std::print("unknown DataPoint3 type: {}\n", type);
    }
};

Header header @ 0x0;
u16 num_points1 @ header.chunk1_start;
DataPoint1 points1[num_points1] @ header.chunk1_start + sizeof(num_points1);
u16 num_points2 @ header.chunk2_start;
DataPoint2 points2[num_points2] @ header.chunk2_start + sizeof(num_points2);
DataPoint3 points3[while($ < std::mem::size())] @ header.chunk3_start;
