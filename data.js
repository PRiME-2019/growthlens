// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// Forest plot data — copy of mock-gaps.json embedded for offline use.
window.GAPS_DATA = {
  meta: {
    subject: "ela",
    demographic: "frl",
    groupA: "non-FRL",
    groupB: "FRL",
    districtGap: 0.18,
    tauSquared: 0.0309,
    nSchools: 30,
    nMeetingThreshold: 29,
    minCellSize: 10,
  },
  schools: [
    { school_id: "Sch-1013", n_a: 20,  n_b: 88,  raw_gap: 0.7314, raw_se: 0.2277, raw_ci95: [0.2851, 1.1778], shrunk_gap: 0.3860, shrunk_se: 0.1392, shrunk_ci95: [0.1132, 0.6589], shrinkage_factor: 0.374, meets_min_cell: true },
    { school_id: "Sch-1028", n_a: 201, n_b: 130, raw_gap: 0.3558, raw_se: 0.1083, raw_ci95: [0.1436, 0.5680], shrunk_gap: 0.3075, shrunk_se: 0.0922, shrunk_ci95: [0.1268, 0.4882], shrinkage_factor: 0.725, meets_min_cell: true },
    { school_id: "Sch-1007", n_a: 95,  n_b: 14,  raw_gap: 0.5908, raw_se: 0.2828, raw_ci95: [0.0366, 1.1450], shrunk_gap: 0.2946, shrunk_se: 0.1494, shrunk_ci95: [0.0019, 0.5874], shrinkage_factor: 0.279, meets_min_cell: true },
    { school_id: "Sch-1022", n_a: 129, n_b: 254, raw_gap: 0.3312, raw_se: 0.1011, raw_ci95: [0.1331, 0.5293], shrunk_gap: 0.2937, shrunk_se: 0.0876, shrunk_ci95: [0.1219, 0.4655], shrinkage_factor: 0.752, meets_min_cell: true },
    { school_id: "Sch-1014", n_a: 136, n_b: 132, raw_gap: 0.3246, raw_se: 0.1163, raw_ci95: [0.0966, 0.5526], shrunk_gap: 0.2806, shrunk_se: 0.0970, shrunk_ci95: [0.0904, 0.4708], shrinkage_factor: 0.696, meets_min_cell: true },
    { school_id: "Sch-1019", n_a: 271, n_b: 218, raw_gap: 0.2764, raw_se: 0.0870, raw_ci95: [0.1058, 0.4470], shrunk_gap: 0.2575, shrunk_se: 0.0780, shrunk_ci95: [0.1046, 0.4104], shrinkage_factor: 0.803, meets_min_cell: true },
    { school_id: "Sch-1004", n_a: 105, n_b: 483, raw_gap: 0.2808, raw_se: 0.0989, raw_ci95: [0.0869, 0.4746], shrunk_gap: 0.2566, shrunk_se: 0.0862, shrunk_ci95: [0.0876, 0.4255], shrinkage_factor: 0.760, meets_min_cell: true },
    { school_id: "Sch-1010", n_a: 108, n_b: 392, raw_gap: 0.2638, raw_se: 0.1003, raw_ci95: [0.0673, 0.4603], shrunk_gap: 0.2433, shrunk_se: 0.0871, shrunk_ci95: [0.0726, 0.4140], shrinkage_factor: 0.755, meets_min_cell: true },
    { school_id: "Sch-1008", n_a: 280, n_b: 161, raw_gap: 0.2453, raw_se: 0.0954, raw_ci95: [0.0583, 0.4323], shrunk_gap: 0.2304, shrunk_se: 0.0839, shrunk_ci95: [0.0661, 0.3948], shrinkage_factor: 0.773, meets_min_cell: true },
    { school_id: "Sch-1027", n_a: 355, n_b: 241, raw_gap: 0.2384, raw_se: 0.0802, raw_ci95: [0.0813, 0.3956], shrunk_gap: 0.2284, shrunk_se: 0.0730, shrunk_ci95: [0.0854, 0.3714], shrinkage_factor: 0.828, meets_min_cell: true },
    { school_id: "Sch-1021", n_a: 139, n_b: 260, raw_gap: 0.2427, raw_se: 0.0984, raw_ci95: [0.0500, 0.4355], shrunk_gap: 0.2278, shrunk_se: 0.0858, shrunk_ci95: [0.0595, 0.3960], shrinkage_factor: 0.762, meets_min_cell: true },
    { school_id: "Sch-1017", n_a: 349, n_b: 199, raw_gap: 0.2343, raw_se: 0.0857, raw_ci95: [0.0663, 0.4023], shrunk_gap: 0.2239, shrunk_se: 0.0770, shrunk_ci95: [0.0729, 0.3749], shrinkage_factor: 0.808, meets_min_cell: true },
    { school_id: "Sch-1006", n_a: 204, n_b: 130, raw_gap: 0.2323, raw_se: 0.1080, raw_ci95: [0.0206, 0.4440], shrunk_gap: 0.2180, shrunk_se: 0.0920, shrunk_ci95: [0.0376, 0.3984], shrinkage_factor: 0.726, meets_min_cell: true },
    { school_id: "Sch-1018", n_a: 110, n_b: 6,   raw_gap: 0.3820, raw_se: 0.4172, raw_ci95: [-0.4357, 1.1996], shrunk_gap: 0.2105, shrunk_se: 0.1621, shrunk_ci95: [-0.1072, 0.5282], shrinkage_factor: 0.151, meets_min_cell: false },
    { school_id: "Sch-1029", n_a: 76,  n_b: 419, raw_gap: 0.2024, raw_se: 0.1142, raw_ci95: [-0.0215, 0.4263], shrunk_gap: 0.1958, shrunk_se: 0.0958, shrunk_ci95: [0.0080, 0.3835], shrinkage_factor: 0.703, meets_min_cell: true },
    { school_id: "Sch-1025", n_a: 251, n_b: 286, raw_gap: 0.1851, raw_se: 0.0820, raw_ci95: [0.0244, 0.3458], shrunk_gap: 0.1842, shrunk_se: 0.0743, shrunk_ci95: [0.0385, 0.3299], shrinkage_factor: 0.821, meets_min_cell: true },
    { school_id: "Sch-1000", n_a: 290, n_b: 215, raw_gap: 0.1769, raw_se: 0.0863, raw_ci95: [0.0078, 0.3460], shrunk_gap: 0.1775, shrunk_se: 0.0775, shrunk_ci95: [0.0257, 0.3293], shrinkage_factor: 0.806, meets_min_cell: true },
    { school_id: "Sch-1005", n_a: 118, n_b: 115, raw_gap: 0.1485, raw_se: 0.1247, raw_ci95: [-0.0960, 0.3930], shrunk_gap: 0.1591, shrunk_se: 0.1018, shrunk_ci95: [-0.0404, 0.3585], shrinkage_factor: 0.665, meets_min_cell: true },
    { school_id: "Sch-1015", n_a: 37,  n_b: 71,  raw_gap: 0.1226, raw_se: 0.1897, raw_ci95: [-0.2492, 0.4943], shrunk_gap: 0.1534, shrunk_se: 0.1290, shrunk_ci95: [-0.0993, 0.4062], shrinkage_factor: 0.462, meets_min_cell: true },
    { school_id: "Sch-1024", n_a: 37,  n_b: 43,  raw_gap: 0.0245, raw_se: 0.2125, raw_ci95: [-0.3919, 0.4410], shrunk_gap: 0.1168, shrunk_se: 0.1355, shrunk_ci95: [-0.1488, 0.3824], shrinkage_factor: 0.407, meets_min_cell: true },
    { school_id: "Sch-1001", n_a: 266, n_b: 157, raw_gap: 0.0760, raw_se: 0.0970, raw_ci95: [-0.1142, 0.2661], shrunk_gap: 0.1002, shrunk_se: 0.0850, shrunk_ci95: [-0.0663, 0.2668], shrinkage_factor: 0.767, meets_min_cell: true },
    { school_id: "Sch-1016", n_a: 312, n_b: 176, raw_gap: 0.0772, raw_se: 0.0910, raw_ci95: [-0.1011, 0.2555], shrunk_gap: 0.0989, shrunk_se: 0.0808, shrunk_ci95: [-0.0595, 0.2573], shrinkage_factor: 0.789, meets_min_cell: true },
    { school_id: "Sch-1009", n_a: 286, n_b: 272, raw_gap: 0.0481, raw_se: 0.0807, raw_ci95: [-0.1101, 0.2062], shrunk_gap: 0.0710, shrunk_se: 0.0733, shrunk_ci95: [-0.0727, 0.2147], shrinkage_factor: 0.826, meets_min_cell: true },
    { school_id: "Sch-1023", n_a: 122, n_b: 92,  raw_gap: -0.0087,raw_se: 0.1323, raw_ci95: [-0.2680, 0.2507], shrunk_gap: 0.0595, shrunk_se: 0.1057, shrunk_ci95: [-0.1478, 0.2668], shrinkage_factor: 0.639, meets_min_cell: true },
    { school_id: "Sch-1011", n_a: 64,  n_b: 186, raw_gap: -0.0442,raw_se: 0.1343, raw_ci95: [-0.3074, 0.2190], shrunk_gap: 0.0383, shrunk_se: 0.1067, shrunk_ci95: [-0.1709, 0.2475], shrinkage_factor: 0.632, meets_min_cell: true },
    { school_id: "Sch-1026", n_a: 96,  n_b: 65,  raw_gap: -0.1021,raw_se: 0.1543, raw_ci95: [-0.4046, 0.2005], shrunk_gap: 0.0206, shrunk_se: 0.1160, shrunk_ci95: [-0.2067, 0.2480], shrinkage_factor: 0.565, meets_min_cell: true },
    { school_id: "Sch-1012", n_a: 274, n_b: 318, raw_gap: -0.0404,raw_se: 0.0781, raw_ci95: [-0.1935, 0.1127], shrunk_gap: -0.0041,shrunk_se: 0.0714, shrunk_ci95: [-0.1440, 0.1358], shrinkage_factor: 0.835, meets_min_cell: true },
    { school_id: "Sch-1003", n_a: 319, n_b: 172, raw_gap: -0.1111,raw_se: 0.0914, raw_ci95: [-0.2902, 0.0681], shrunk_gap: -0.0492,shrunk_se: 0.0811, shrunk_ci95: [-0.2082, 0.1098], shrinkage_factor: 0.787, meets_min_cell: true },
    { school_id: "Sch-1002", n_a: 97,  n_b: 76,  raw_gap: -0.2301,raw_se: 0.1467, raw_ci95: [-0.5176, 0.0573], shrunk_gap: -0.0619,shrunk_se: 0.1126, shrunk_ci95: [-0.2827, 0.1588], shrinkage_factor: 0.590, meets_min_cell: true },
    { school_id: "Sch-1020", n_a: 302, n_b: 259, raw_gap: -0.2960,raw_se: 0.0809, raw_ci95: [-0.4546,-0.1375], shrunk_gap: -0.2129,shrunk_se: 0.0735, shrunk_ci95: [-0.3570,-0.0689], shrinkage_factor: 0.825, meets_min_cell: true },
  ],
};
