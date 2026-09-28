/** Verified annual CBS tables. Geographic codes must come from the same year. */
export const CBS_YEARS: Record<number, { kwb: string; geography: string; municipalities: number; provinceCode: string; provinceName: string; commutePeriod: string }> = {
  2022: { kwb:'85318NED', geography:'85067NED', municipalities:345, provinceCode:'Code_26', provinceName:'Naam_27', commutePeriod:'2022MM12' },
  2023: { kwb:'85618NED', geography:'85385NED', municipalities:342, provinceCode:'Code_28', provinceName:'Naam_29', commutePeriod:'2023MM12' },
  2024: { kwb:'85984NED', geography:'85755NED', municipalities:342, provinceCode:'Code_28', provinceName:'Naam_29', commutePeriod:'2024MM12' },
  2025: { kwb:'86165NED', geography:'86059NED', municipalities:342, provinceCode:'Code_28', provinceName:'Naam_29', commutePeriod:'2024MM12' },
};
export function yearConfig(year: number) {
  const config = CBS_YEARS[year]; if (!config) throw new Error('Kies een ondersteund CBS-bronjaar (2022–2025).'); return config;
}
// CBS changes numeric field suffixes between annual tables. Match the semantic
// stem, never the position. Reviewed 2022 attainment aliases have the same 15–74
// population and low/medium/high grouping; missing/withdrawn values stay null.
const aliases: Record<string,string> = { BasisonderwijsVmboMbo1:'OpleidingsniveauLaag', HavoVwoMbo24:'OpleidingsniveauMiddelbaar', HboWo:'OpleidingsniveauHoog' };
export function cbsNumber(row: Record<string,unknown>, key: string): number | null {
  const stem=key.replace(/_\d+$/,''), actual=Object.hasOwn(row,key)?key:Object.keys(row).find(k=>k.replace(/_\d+$/,'')===stem)??Object.keys(row).find(k=>k.replace(/_\d+$/,'')===aliases[stem]);
  const value=actual?row[actual]:null;
  return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
}
