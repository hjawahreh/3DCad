# PROD-001S — VTK Clinical Trim + Close Base Spike

**Generated:** 2026-09-11T18:40:17Z
**VTK:** `9.7.0`

Worker/offline evidence only. Clinical/React do not import VTK.

## InsideOut convention

- `InsideOut=False` (spike default, **empirical on dental STLs**): keep **exterior** → clinical **REMOVE interior**.
- `InsideOut=True`: keep **interior** → clinical **KEEP selected**.
- Measured: `InsideOut=True` on ImplicitSelectionLoop left ~2k of ~233k tris for a small loop — inverted vs clinical intent.

## Fixture inventory

### lower

| Metric | Value |
|---|---|
| path | apps/studio/public/clinical-fixtures/lower.stl |
| bytes | 11678184 |
| vtk_points_raw | 118085 |
| vtk_cells_raw | 233562 |
| vtk_points_clean | 118085 |
| vtk_cells_clean | 233562 |
| boundary_edges | 2604 |
| bounds | [-36.07221603393555, 34.564208984375, -22.992115020751953, 29.90304183959961, -15.897418975830078, 2.111689805984497] |
| o3d_vertices | 700574 |
| o3d_triangles | 233562 |
| edge_manifold | True |
| vertex_manifold | True |
| watertight | False |
| orientable | True |
| self_intersecting | deferred_large_mesh |
| normals_generated | True |
| inventory_ms | 8558.921108953655 |
| dimensions | [70.63642501831055, 52.89515686035156, 18.009108781814575] |
| diagonal | 90.06514396681902 |

### upper

| Metric | Value |
|---|---|
| path | apps/studio/public/clinical-fixtures/upper.stl |
| bytes | 13064434 |
| vtk_points_raw | 131779 |
| vtk_cells_raw | 261287 |
| vtk_points_clean | 131779 |
| vtk_cells_clean | 261287 |
| boundary_edges | 2273 |
| bounds | [-32.372676849365234, 31.3145694732666, -27.040077209472656, 32.14738845825195, -2.337831497192383, 19.423786163330078] |
| o3d_vertices | 783783 |
| o3d_triangles | 261287 |
| edge_manifold | True |
| vertex_manifold | True |
| watertight | False |
| orientable | True |
| self_intersecting | deferred_large_mesh |
| normals_generated | True |
| inventory_ms | 5761.987776961178 |
| dimensions | [63.687246322631836, 59.18746566772461, 21.76161766052246] |
| diagonal | 89.62583020274025 |

## Trim results

### lower

#### simple_convex

- p50: **893.1412359233946 ms** / p95: **917.4175200634636 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `1212`
- out_tris: `232350`
- planarity_rms: `0.022829697430845848`
- timings: `{'loop_create_ms': 0.16273802611976862, 'clip_ms': 133.01484496332705, 'convert_out_ms': 587.6162989297882, 'total_ms': 721.0100049851462}`

#### concave

- p50: **0.0 ms** / p95: **0.0 ms**
- failure_rate: 1.0
- ok: `False`
- error: `Trim boundary is self-intersecting.`
- removed_est: `None`
- out_tris: `None`
- planarity_rms: `6.548378539971859`
- timings: `{}`

#### large

- p50: **1020.6061180215329 ms** / p95: **1363.5774771915749 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `48695`
- out_tris: `184867`
- planarity_rms: `0.009308494400426684`
- timings: `{'loop_create_ms': 0.13425399083644152, 'clip_ms': 100.20645998883992, 'convert_out_ms': 726.9598139682785, 'total_ms': 827.5088579393923}`

#### small

- p50: **858.7997240247205 ms** / p95: **1575.5986705305986 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `0`
- out_tris: `233566`
- planarity_rms: `0.10282308628606814`
- timings: `{'loop_create_ms': 0.1543279504403472, 'clip_ms': 121.0150650003925, 'convert_out_ms': 725.9888029657304, 'total_ms': 847.4355119979009}`

#### near_edge

- p50: **856.1275009997189 ms** / p95: **929.364307038486 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `14202`
- out_tris: `219360`
- planarity_rms: `0.4756677093641857`
- timings: `{'loop_create_ms': 0.36670698318630457, 'clip_ms': 128.93239909317344, 'convert_out_ms': 807.5325419194996, 'total_ms': 937.5017299316823}`

#### freehand

- p50: **956.3852819846943 ms** / p95: **1070.2170191914774 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `10120`
- out_tris: `223442`
- planarity_rms: `0.7275699311648937`
- timings: `{'loop_create_ms': 0.5579569842666388, 'clip_ms': 222.32909500598907, 'convert_out_ms': 730.0885759759694, 'total_ms': 956.3852819846943}`

#### polyline

- p50: **697.7106030099094 ms** / p95: **878.9915009983815 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `1208`
- out_tris: `232354`
- planarity_rms: `0.19267938714518465`
- timings: `{'loop_create_ms': 0.14971208292990923, 'clip_ms': 106.38710402417928, 'convert_out_ms': 572.8053180500865, 'total_ms': 679.5314280316234}`

#### nonplanar

- p50: **0.0 ms** / p95: **0.0 ms**
- failure_rate: 1.0
- ok: `False`
- error: `Trim boundary is self-intersecting.`
- removed_est: `None`
- out_tris: `None`
- planarity_rms: `1.197320322045728`
- timings: `{}`

#### self_intersecting

- p50: **0.0 ms** / p95: **0.0 ms**
- failure_rate: 1.0
- ok: `False`
- error: `Trim boundary is self-intersecting.`
- removed_est: `None`
- out_tris: `None`
- planarity_rms: `9.00934534506222`
- timings: `{}`

#### dense

- p50: **0.0 ms** / p95: **0.0 ms**
- failure_rate: 1.0
- ok: `False`
- error: `Trim boundary is self-intersecting.`
- removed_est: `None`
- out_tris: `None`
- planarity_rms: `0.8485736377990035`
- timings: `{}`

### upper

#### simple_convex

- p50: **721.3105990085751 ms** / p95: **759.8946997663006 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `3`
- out_tris: `261284`
- planarity_rms: `0.5356551665511359`
- timings: `{'loop_create_ms': 0.13821397442370653, 'clip_ms': 114.9599920026958, 'convert_out_ms': 648.9020159933716, 'total_ms': 764.1818220727146}`

#### concave

- p50: **558.9850220130756 ms** / p95: **676.0849480284378 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `38903`
- out_tris: `222384`
- planarity_rms: `0.6846292810533398`
- timings: `{'loop_create_ms': 0.1442059874534607, 'clip_ms': 122.3439349560067, 'convert_out_ms': 430.31511595472693, 'total_ms': 553.0757730593905}`

#### large

- p50: **585.790507029742 ms** / p95: **1514.9248030036688 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `49813`
- out_tris: `211474`
- planarity_rms: `0.20957716834100001`
- timings: `{'loop_create_ms': 0.13148505240678787, 'clip_ms': 106.46066907793283, 'convert_out_ms': 479.00799300987273, 'total_ms': 585.790507029742}`

#### small

- p50: **748.6595410155132 ms** / p95: **757.1249617845751 ms**
- failure_rate: 1.0
- ok: `False`
- error: `Trim produced no geometry change.`
- removed_est: `None`
- out_tris: `261287`
- planarity_rms: `0.15686245907963828`
- timings: `{'loop_create_ms': 0.12691307347267866, 'clip_ms': 114.58088899962604, 'convert_out_ms': 643.1792889488861, 'total_ms': 758.0655640922487}`

#### near_edge

- p50: **677.2996479412541 ms** / p95: **712.5357090611942 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `23461`
- out_tris: `237826`
- planarity_rms: `0.22575433933336994`
- timings: `{'loop_create_ms': 0.14487910084426403, 'clip_ms': 114.45468093734235, 'convert_out_ms': 562.5047970097512, 'total_ms': 677.2996479412541}`

#### freehand

- p50: **923.7369199981913 ms** / p95: **947.928749024868 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `0`
- out_tris: `261341`
- planarity_rms: `0.4732441655590275`
- timings: `{'loop_create_ms': 0.22628193255513906, 'clip_ms': 233.7494840612635, 'convert_out_ms': 713.0117579363286, 'total_ms': 950.6167300278321}`

#### polyline

- p50: **912.861994933337 ms** / p95: **937.5086813466623 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `28`
- out_tris: `261259`
- planarity_rms: `0.5477003541486869`
- timings: `{'loop_create_ms': 0.14469993766397238, 'clip_ms': 131.62239897064865, 'convert_out_ms': 689.6317430073395, 'total_ms': 821.5998560190201}`

#### nonplanar

- p50: **0.0 ms** / p95: **0.0 ms**
- failure_rate: 1.0
- ok: `False`
- error: `Trim boundary is self-intersecting.`
- removed_est: `None`
- out_tris: `None`
- planarity_rms: `0.47652690095850775`
- timings: `{}`

#### self_intersecting

- p50: **0.0 ms** / p95: **0.0 ms**
- failure_rate: 1.0
- ok: `False`
- error: `Trim boundary is self-intersecting.`
- removed_est: `None`
- out_tris: `None`
- planarity_rms: `0.30821528267347387`
- timings: `{}`

#### dense

- p50: **1272.207675036043 ms** / p95: **1298.4438818879426 ms**
- failure_rate: 0.0
- ok: `True`
- error: `None`
- removed_est: `89`
- out_tris: `261198`
- planarity_rms: `0.4772697310724802`
- timings: `{'loop_create_ms': 0.2914440119639039, 'clip_ms': 498.16861597355455, 'convert_out_ms': 701.6917560249567, 'total_ms': 1244.1532720113173}`

## Close Base results

### lower

#### direction=clinical_neg_y

- height: 2.7019543190045705
- p50: **1509.66028845869 ms**
- failure_rate: 0.0
- ok: `True`
- error/reason: `None` / `None`
- added_est: `5948`
- triangulation_error: `1`
- quality codes: `[]`
- bounds_growth: `1.0`

#### direction=clinical_neg_z

- height: 2.7019543190045705
- p50: **1424.9979924643412 ms**
- failure_rate: 0.0
- ok: `True`
- error/reason: `None` / `None`
- added_est: `5948`
- triangulation_error: `1`
- quality codes: `[]`
- bounds_growth: `1.0064280333675035`

#### direction=aabb_shortest

- height: 2.7019543190045705
- p50: **1066.98815850541 ms**
- failure_rate: 0.0
- ok: `True`
- error/reason: `None` / `None`
- added_est: `5948`
- triangulation_error: `1`
- quality codes: `[]`
- bounds_growth: `1.0064280333675035`

#### direction=boundary_normal_neg

- height: 2.7019543190045705
- p50: **1468.8101464416832 ms**
- failure_rate: 0.0
- ok: `True`
- error/reason: `None` / `None`
- added_est: `5948`
- triangulation_error: `1`
- quality codes: `[]`
- bounds_growth: `1.0068715112497364`

### upper

#### direction=clinical_neg_y

- height: 2.6887749060822075
- p50: **1303.7285879836418 ms**
- failure_rate: 0.0
- ok: `True`
- error/reason: `None` / `None`
- added_est: `6966`
- triangulation_error: `1`
- quality codes: `[]`
- bounds_growth: `1.0`

#### direction=clinical_neg_z

- height: 2.6887749060822075
- p50: **1567.225452978164 ms**
- failure_rate: 0.0
- ok: `True`
- error/reason: `None` / `None`
- added_est: `6966`
- triangulation_error: `1`
- quality codes: `[]`
- bounds_growth: `1.0000720585292697`

#### direction=aabb_shortest

- height: 2.6887749060822075
- p50: **1274.494119512383 ms**
- failure_rate: 0.0
- ok: `True`
- error/reason: `None` / `None`
- added_est: `6966`
- triangulation_error: `1`
- quality codes: `[]`
- bounds_growth: `1.0000720585292697`

#### direction=boundary_normal_neg

- height: 2.6887749060822075
- p50: **1267.7549154614098 ms**
- failure_rate: 0.0
- ok: `True`
- error/reason: `None` / `None`
- added_est: `6966`
- triangulation_error: `1`
- quality codes: `[]`
- bounds_growth: `1.0000720423632259`

## Decision hints

- trim_ok_rate=13/20 (failures mostly explicit self-intersect rejects + small no-ops — not freezes)
- close_base_ok_rate=8/8
- **Final (certification):** Trim = **C specialized worker only**; Close Base = **B worker production candidate**
- See `docs/certification/PROD-001S-vtk-clinical-spike.md`
- Browser interactive VTK path: **not claimed PASS**

## Raw JSON

`docs/performance/prod-001s-vtk-spike.raw.json`
