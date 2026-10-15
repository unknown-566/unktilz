// Thin WebAssembly-facing wrapper around cubiomes for the seed map.
// One generator per instance (each web worker loads its own copy of the module).

#include <math.h>
#include <stdlib.h>
#include <string.h>
#include "generator.h"
#include "finders.h"
#include "util.h"
#include "terrainnoise.h"

#define EXPORT __attribute__((visibility("default")))

static Generator g;
static int g_mc;
static uint64_t g_seed;
static int g_flags;
static TerrainNoise tn;
static int tn_ready;

static int *biome_buf;
static size_t biome_cap;

static int out_buf[4096 * 2];
static char str_buf[64];
static unsigned char colors[256][3];
static int colors_ready;

/** Version id from text such as "1.21" or "1.16"; 0 if unknown. */
EXPORT int sm_str2mc(void) { return str2mc(str_buf); }

/** Scratch space for passing short strings in. */
EXPORT char *sm_str(void) { return str_buf; }

EXPORT void sm_init(int mc, uint64_t seed, int large)
{
    g_flags = large ? LARGE_BIOMES : 0;
    setupGenerator(&g, mc, g_flags);
    tn_ready = 0;
    applySeed(&g, DIM_OVERWORLD, seed);
    g_mc = mc;
    g_seed = seed;
}

/**
 * Biome ids for a w×h area at 1:scale, top-left at (x, z) in scaled units, one plane at y
 * (y is always 1:4 unless scale is 1). Returns a pointer to w*h ints, or 0 on failure.
 */
EXPORT int *sm_biomes(int scale, int x, int z, int w, int h, int y)
{
    Range r = { scale, x, z, w, h, y, 1 };
    size_t need = getMinCacheSize(&g, scale, w, 1, h);
    if (need > biome_cap)
    {
        free(biome_buf);
        biome_buf = (int *) malloc(need * sizeof(int));
        biome_cap = biome_buf ? need : 0;
        if (!biome_buf) return 0;
    }
    if (genBiomes(&g, biome_buf, r)) return 0;
    return biome_buf;
}

/** Biome at one point; x, z (and y unless scale is 1) are in units of the scale. */
EXPORT int sm_biome_at(int scale, int x, int y, int z) { return getBiomeAt(&g, scale, x, y, z); }

/**
 * Structures of one type that really generate in the block rectangle [x0,x1)×[z0,z1).
 * Writes x,z pairs to the buffer returned by sm_out() and returns how many were found
 * (-1 if the type doesn't exist in this version).
 */
EXPORT int sm_structures(int type, int x0, int z0, int x1, int z1)
{
    StructureConfig sc;
    if (!getStructureConfig(type, g_mc, &sc)) return -1;
    int size = sc.regionSize * 16;
    int rx0 = (int) floor((double) x0 / size), rx1 = (int) floor((double) (x1 - 1) / size);
    int rz0 = (int) floor((double) z0 / size), rz1 = (int) floor((double) (z1 - 1) / size);
    int n = 0;
    for (int rz = rz0; rz <= rz1; rz++)
        for (int rx = rx0; rx <= rx1; rx++)
        {
            Pos p;
            if (!getStructurePos(type, g_mc, g_seed, rx, rz, &p)) continue;
            if (p.x < x0 || p.x >= x1 || p.z < z0 || p.z >= z1) continue;
            if (!isViableStructurePos(type, &g, p.x, p.z, 0)) continue;
            // 1.18+: rule out spots where the ground is surely too low (pyramids, temples, mansions).
            if (g_mc >= MC_1_18 && !isViableStructureTerrain(type, &g, p.x, p.z)) continue;
            if (n >= 4096) return n;
            out_buf[2 * n] = p.x;
            out_buf[2 * n + 1] = p.z;
            n++;
        }
    return n;
}

EXPORT int *sm_out(void) { return out_buf; }

/**
 * The Y you'd stand at on (x, z): the lowest air block above the ground, from real terrain
 * generation of that one chunk (a few milliseconds). Water isn't generated, so in oceans this is
 * the sea floor.
 */
EXPORT int sm_ground(int x, int z)
{
    if (!tn_ready)
    {
        // Setting up over an already used struct crashes; start from zeros every time.
        memset(&tn, 0, sizeof tn);
        setupTerrainNoise(&tn, g_mc, g_flags);
        initTerrainNoise(&tn, g_seed, DIM_OVERWORLD);
        tn_ready = 1;
    }
    int ys[256];
    // Full overworld column: 49 cells of 8 blocks from 1.18 (y -64..320), 33 before (0..256).
    generateRegion(&tn, x >> 4, z >> 4, 1, 1, NULL, 0, g_mc >= MC_1_18 ? 48 : 32, ys, 1);
    return ys[(x & 15) * 16 + (z & 15)];
}

/** World spawn (the full search the game does; tens of milliseconds). x,z go to sm_out(). */
EXPORT int *sm_spawn(void)
{
    Pos p = getSpawn(&g);
    out_buf[0] = p.x;
    out_buf[1] = p.z;
    return out_buf;
}

EXPORT const char *sm_biome_name(int id) { return biome2str(g_mc, id); }

/** RGB for a biome id, packed 0xRRGGBB. */
EXPORT int sm_biome_color(int id)
{
    if (!colors_ready)
    {
        initBiomeColors(colors);
        colors_ready = 1;
    }
    if (id < 0 || id > 255) return 0;
    return (colors[id][0] << 16) | (colors[id][1] << 8) | colors[id][2];
}

/** Enum values the JS side needs, so it doesn't hard-code cubiomes' numbering. */
EXPORT int sm_const(int which)
{
    switch (which)
    {
    case 0: return Village;
    case 1: return Desert_Pyramid;
    case 2: return Jungle_Temple;
    case 3: return Swamp_Hut;
    case 4: return Igloo;
    case 5: return Ocean_Ruin;
    case 6: return Shipwreck;
    case 7: return Monument;
    case 8: return Mansion;
    case 9: return Outpost;
    case 10: return Ruined_Portal;
    case 11: return Ancient_City;
    case 12: return Treasure;
    case 13: return Trail_Ruins;
    case 14: return Trial_Chambers;
    case 15: return Abandoned_Camp;
    default: return -1;
    }
}
