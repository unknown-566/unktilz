// Native twin of the wasm module for scripts/build-cubiomes.mjs --native: prints a checksum of a
// biome area and the first structures, so both builds can be compared.
#include <stdio.h>
#include <stdint.h>
#include <string.h>

int sm_str2mc(void); char *sm_str(void); void sm_init(int, uint64_t, int);
int *sm_biomes(int, int, int, int, int, int); int sm_structures(int, int, int, int, int);
int *sm_out(void); int sm_const(int);

int main(void)
{
    const char *vers[] = { "26.3", "26.2", "1.21.5", "1.21.4", "1.20", "1.18", "1.16" };
    const uint64_t seeds[] = { 0, 123, (uint64_t) -4172144997902289642LL };
    for (int v = 0; v < 7; v++)
        for (int s = 0; s < 3; s++)
        {
            strcpy(sm_str(), vers[v]);
            int mc = sm_str2mc();
            sm_init(mc, seeds[s], 0);
            int *ids = sm_biomes(16, -64, -64, 128, 128, 15);
            uint32_t h = 2166136261u;
            for (int i = 0; i < 128 * 128; i++) h = (h ^ (uint32_t) ids[i]) * 16777619u;
            printf("%s %llu biomes %08x", vers[v], (unsigned long long) seeds[s], h);
            for (int t = 0; t < 16; t++)
            {
                int n = sm_structures(sm_const(t), -3000, -3000, 3000, 3000);
                uint32_t sh = 2166136261u;
                for (int i = 0; i < 2 * (n > 0 ? n : 0); i++) sh = (sh ^ (uint32_t) sm_out()[i]) * 16777619u;
                printf(" %d:%d/%04x", t, n, sh & 0xffff);
            }
            printf("\n");
        }
    return 0;
}
