// Stile della mappa stradale nei colori di file360 (chiaro e scuro), dallo stile aperto di Protomaps (@protomaps/basemaps).
// Uso: node tools/mappa_stile.js CARTELLA_PACCHETTO_basemaps > src/vendor/mappa/stile.json
const b = require(process.argv[2] + '/dist/cjs/index.cjs');
const base = (n) => ({ ...b.namedFlavor(n) });
const chiaro = Object.assign(base('light'), {
  background: '#f3f0fe', earth: '#f6f4ff', water: '#d3c9fa', park_a: '#ebe6fd', park_b: '#e2dafc', wood_a: '#ece7fd', wood_b: '#e1d9fb', scrub_a: '#efebfe', scrub_b: '#e6e0fc',
  hospital: '#f1ecfd', industrial: '#ece8f8', school: '#f1ecfd', pedestrian: '#f3f0fd', glacier: '#f7f6ff', sand: '#f2efe9', beach: '#f3f0ea', aerodrome: '#ebe8f6', runway: '#e2def2', zoo: '#ebe6fd', military: '#ece9f6',
  buildings: '#ddd4fa', pier: '#ebe6fd',
  tunnel_other_casing: '#e7e1fc', tunnel_minor_casing: '#e7e1fc', tunnel_link_casing: '#e7e1fc', tunnel_major_casing: '#e7e1fc', tunnel_highway_casing: '#e7e1fc',
  tunnel_other: '#f1edfe', tunnel_minor: '#f1edfe', tunnel_link: '#f1edfe', tunnel_major: '#f1edfe', tunnel_highway: '#e4dcfc',
  minor_service_casing: '#e3dcfb', minor_casing: '#e0d8fa', link_casing: '#d6ccf8', major_casing_late: '#d3c8f7', highway_casing_late: '#b8a8f2', major_casing_early: '#d3c8f7', highway_casing_early: '#b8a8f2',
  other: '#fbfaff', minor_service: '#fbfaff', minor_a: '#ffffff', minor_b: '#ffffff', link: '#ffffff', major: '#ffffff', highway: '#cdbff8',
  railway: '#bcb0e6', boundaries: '#b3a5ee',
  bridges_other_casing: '#e0d8fa', bridges_minor_casing: '#e0d8fa', bridges_link_casing: '#d6ccf8', bridges_major_casing: '#d3c8f7', bridges_highway_casing: '#b8a8f2',
  bridges_other: '#fbfaff', bridges_minor: '#ffffff', bridges_link: '#ffffff', bridges_major: '#ffffff', bridges_highway: '#cdbff8',
  roads_label_minor: '#6f659a', roads_label_minor_halo: '#ffffff', roads_label_major: '#5b4f8c', roads_label_major_halo: '#ffffff', ocean_label: '#7d70c2',
  subplace_label: '#6f659a', subplace_label_halo: '#ffffff', city_label: '#2f2560', city_label_halo: '#ffffff', state_label: '#9a90c4', state_label_halo: '#ffffff', country_label: '#8d82c0',
  address_label: '#8279ad', address_label_halo: '#ffffff',
  landcover: { grassland: 'rgba(214,204,250,0.55)', barren: 'rgba(232,227,250,0.6)', urban_area: 'rgba(222,214,248,0.7)', farmland: 'rgba(226,219,251,0.55)', glacier: 'rgba(250,249,255,1)', scrub: 'rgba(218,209,250,0.5)', forest: 'rgba(205,193,248,0.55)' },
});
const scuro = Object.assign(base('dark'), {
  background: '#141127', earth: '#181530', water: '#2b2459', park_a: '#1d1a39', park_b: '#221e44', wood_a: '#1c1937', wood_b: '#211d42', scrub_a: '#1b1835', scrub_b: '#1f1b3d',
  hospital: '#1d1a37', industrial: '#1b1934', school: '#1d1a37', pedestrian: '#1d1a36', glacier: '#1f1c3a', sand: '#1f1c32', beach: '#211e34', aerodrome: '#1d1a36', runway: '#27234a', zoo: '#1d1a39', military: '#1c1935',
  buildings: '#2c2654', pier: '#1d1a39',
  tunnel_other_casing: '#1f1b3c', tunnel_minor_casing: '#1f1b3c', tunnel_link_casing: '#1f1b3c', tunnel_major_casing: '#1f1b3c', tunnel_highway_casing: '#1f1b3c',
  tunnel_other: '#26214a', tunnel_minor: '#26214a', tunnel_link: '#26214a', tunnel_major: '#26214a', tunnel_highway: '#342c66',
  minor_service_casing: '#1c1937', minor_casing: '#1c1937', link_casing: '#1c1937', major_casing_late: '#1c1937', highway_casing_late: '#1c1937', major_casing_early: '#1c1937', highway_casing_early: '#1c1937',
  other: '#2a2550', minor_service: '#2a2550', minor_a: '#312b5c', minor_b: '#36306a', link: '#3b3473', major: '#3d3678', highway: '#5545a8',
  railway: '#3f3870', boundaries: '#5d52a0',
  bridges_other_casing: '#1c1937', bridges_minor_casing: '#1c1937', bridges_link_casing: '#1c1937', bridges_major_casing: '#1c1937', bridges_highway_casing: '#1c1937',
  bridges_other: '#2a2550', bridges_minor: '#36306a', bridges_link: '#3b3473', bridges_major: '#3d3678', bridges_highway: '#5545a8',
  roads_label_minor: '#a59cd6', roads_label_minor_halo: '#181530', roads_label_major: '#bdb4ec', roads_label_major_halo: '#181530', ocean_label: '#8a7ed8',
  subplace_label: '#a59cd6', subplace_label_halo: '#181530', city_label: '#e6e1ff', city_label_halo: '#181530', state_label: '#7f75b8', state_label_halo: '#181530', country_label: '#8d82c8',
  address_label: '#8f86c4', address_label_halo: '#181530',
  landcover: { grassland: 'rgba(40,34,82,0.6)', barren: 'rgba(34,30,66,0.6)', urban_area: 'rgba(44,38,90,0.6)', farmland: 'rgba(36,31,74,0.6)', glacier: 'rgba(52,48,92,1)', scrub: 'rgba(38,32,78,0.6)', forest: 'rgba(42,34,92,0.65)' },
});
const fuori = l => l.id !== 'pois' && !(l.layout && l.layout['icon-image']);
const out = {};
for (const [k, f] of Object.entries({ chiaro, scuro })) out[k] = b.layers('protomaps', f, { lang: 'it' }).filter(fuori);
const fonts = new Set(); JSON.stringify(out, (kk, v) => { if (kk === 'text-font' && Array.isArray(v)) v.forEach(x => fonts.add(x)); return v; });
process.stdout.write(JSON.stringify({ fonts: [...fonts], layers: out }));
