# Data provenance

This document states where every kind of data in ASTRA comes from and what is
real, what is procedural and what is simulated. The machine-readable terrain
manifest is [`backend/assets/terrain/provenance.json`](../backend/assets/terrain/provenance.json).

## 1. Mars terrain — real data

| | |
|---|---|
| Site | Octavia E. Butler Landing (Mars 2020 Perseverance touchdown), Jezero Crater, 18.4447°N, 77.4508°E, elevation −2568.7 m (MOLA datum) |
| Elevation product | HiRISE stereo DTM `DTEEC_045994_1985_046060_1985_U01`, 1.01 m/post, from images `ESP_045994_1985` and `ESP_046060_1985` |
| Image product | HiRISE orthorectified RED image `ESP_045994_1985_RED_C_01_ORTHO`, 1 m/px (panchromatic) |
| Catalogue page | <https://www.uahirise.org/dtm/ESP_045994_1985> |
| Download location | `https://hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/` |
| Credit | NASA/JPL-Caltech/University of Arizona; DTM produced by USGS Astrogeology / University of Arizona |

The prompt's other suggested product, `ESP_023524_1985`, covers a neighbouring
part of Jezero. `ESP_045994_1985` was chosen because it contains the actual
Perseverance landing site, so the scene is centred on a real, meaningful place.
MOLA and Perseverance rover images are not used.

### Processing (`tools/terrain/build_terrain.py`)

1. The PDS3 label is read for the raster geometry and equirectangular projection.
2. Only the needed rows of the uncompressed 32-bit raster are fetched with HTTP
   range requests (about 90 MB instead of 380 MB); the 34 MB orthoimage is fetched whole.
3. **Near grid**: bilinear resampling to an exact 1.0 m grid, 513 × 513 posts,
   512 m square.
4. **Far grid**: 8 × 8 box average, then bilinear resampling to 16 m posts,
   193 × 193, 3072 m square. This is the largest square around the site that
   contains **no missing-data cells**, so nothing was interpolated or invented.
5. The outer 32 m of the near grid is blended onto the far surface so the two
   meshes join without cracks. Inside that band the near heights are a mix of the
   1 m and 16 m data.
6. Heights are stored relative to the site elevation as 16-bit integers
   (precision better than 1 mm for the near grid, about 2.4 mm for the far grid).
7. The orthoimage is cropped to both windows, contrast-stretched between the 0.5
   and 99.5 percentiles and resized.

Known artefacts carried over from the source DTM: faint straight seams where
stereo tiles were mosaicked.

### Procedural — not real

| Element | Note |
|---|---|
| Surface colour | The orthoimage is single-band. The ochre colour ramp is applied in the browser. |
| Fine grain and bump | Added below the 1 m resolution of the data. |
| Rocks | Randomly scattered with a fixed seed. They are not HiRISE-detected rocks. |
| Lander, astronaut, markers | Generic models. The lander is not a model of any real spacecraft; it is simply placed at the Perseverance touchdown coordinates. |
| Sky, haze, sun, shadows | Artistic approximations of a Martian afternoon. |
| Waypoints | Chosen by hand on level ground. `Crater Rim` marks the edge of a real 1.7 m-deep depression visible in the DTM. |

## 2. Simulation — synthetic by construction

Every telemetry value is produced by `backend/astra_sim`. No recorded astronaut
or mission telemetry is used.

| Model | Basis |
|---|---|
| Metabolic rate | Activity table plus walking speed and terrain grade from the real height field |
| Core temperature | Heat balance: metabolic heat + external load − suit cooling, over body mass × specific heat 3470 J/(kg·K) |
| Heart and respiration rate | First-order response to metabolic rate; heart rate also rises about 32 bpm per °C of core temperature rise |
| Suit | Regulated pressure, oxygen and battery depletion, CO₂ washout, coolant return temperature |
| Environment | Mean-reverting noise around −27 °C, 735 Pa and 6 m/s wind |
| Radiation | Baseline 27.9 µSv/h, equivalent to the ~0.67 mSv/day surface dose-equivalent rate reported from MSL/RAD (Hassler et al., 2014). Scenario events multiply it. |

These are engineering approximations chosen to be plausible and readable in a
short demonstration. They have not been validated against human data.

**Independence of radiation and thermal stress.** Radiation is tracked as dose
rate and cumulative dose only. It does not enter the thermal or physiological
models, and automated tests enforce this.

## 3. Medical knowledge — attributed references, demonstration thresholds

The seeded knowledge base cites these official portals as general references:

| Source | URL |
|---|---|
| NASA Human Research Program — Evidence Reports | <https://humanresearchroadmap.nasa.gov/evidence/> |
| NASA Human Research Program — Human Spaceflight Risks | <https://www.nasa.gov/hrp/risks/> |
| NASA Open Science Data Repository (OSDR) | <https://osdr.nasa.gov/bio/repo/> |
| Hassler et al. (2014), *Science* 343(6169), 1244797 | <https://doi.org/10.1126/science.1244797> |

Important limits on what this attribution means:

- **Rule thresholds are demonstration values** (for example, a heat-strain
  caution at 37.5 °C with a rising trend). They were chosen so the default
  scenario is instructive. They were not extracted from the portals above and
  must not be read as NASA limits or clinical guidance.
- Condition names are linked to NASA HRP risk titles as a pointer for further
  reading, not as a claim that ASTRA implements those risk models.
- No dataset from OSDR or any other repository is bundled. The dataset feature
  stores metadata (schema, row count, checksum, a five-row sample) for files a
  Medical Team member imports, with a flag for synthetic data.

## 4. Astronaut profiles — synthetic

`ARES-1` and `ARES-2` are invented profiles. Names, ages, body measurements and
health histories are fictional, are labelled "(synthetic)" in the UI, and the
server forces `is_synthetic = true` on every profile. ASTRA does not store real
astronaut health data.

## 5. Rebuilding the terrain

```bash
pip install numpy pillow
python -I tools/terrain/build_terrain.py \
    --raw-dir data/raw/hirise_dtm_045994 --out-dir backend/assets/terrain
```

The script resumes interrupted downloads, reuses cached data in `data/raw/`
(not committed) and rewrites `terrain.json` and `provenance.json`, including
SHA-256 checksums of every output.
