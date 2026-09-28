# Synthetic population methods — Rotterdam and the Netherlands

Version 2.1 · 25 September 2026 · model `synthetic-lives-2.0`

This is a research prototype for PDPC and GGD Rotterdam-Rijnmond discussions. It generates fictitious people consistent with selected aggregate statistics. It does not reconstruct real residents and has not been independently validated for policy forecasting. Use the accompanying data dictionary and each archive's `manifest.json` and `quality.json` files when analysing a dataset.

## 1. Scope and source selection

The year selector supports **2022, 2023, 2024 and 2025**. These are source/reference years, not archived releases as published on a historic date: live retrieval returns the latest CBS revision of the selected year. The default source year is 2024 because it has substantially more complete employment, attainment and income inputs than 2025. A source's headline year is not necessarily the reference year of every field: consult the CBS variable descriptions. A stored source snapshot allows reproducibility; **Refresh CBS** explicitly retrieves new inputs. Exact inputs, retrieval time and source URLs are included in `source-inputs.json`.

- **Rotterdam:** resident counts and attributes from CBS Kerncijfers wijken en buurten, at buurt level. Municipal five-year age/household-position priors provide within-band ages and role weights. The selected sample is allocated across usable buurten. Buurten without usable age margins are excluded and disclosed; their omission is not a zero population result.
- **Netherlands/province:** the same family synthesis engine is run independently for each municipality using that municipality's own age/household-position priors. The selected year supplies its own official municipality/province catalogue and age/household priors: 2022 has 345 municipalities; 2023–2025 have 342. All have 12 provinces. The 2024 total is 17,942,942 residents; other years have their own totals. Outside Rotterdam, export geography is municipality level, not invented neighbourhood or street locations.
- Full counts mean one synthetic record per resident in the represented source totals. Smaller counts are samples of this construction; they are not weighted epidemic populations. Source rounding and coverage mean Rotterdam buurt totals can differ from the municipal population total.

Sources: [CBS KWB 2024, 85984NED](https://opendata.cbs.nl/ODataApi/OData/85984NED), [CBS age/household position, 71488ned](https://opendata.cbs.nl/ODataApi/OData/71488ned), [CBS geographic catalogue 2024, 85755NED](https://opendata.cbs.nl/ODataApi/OData/85755NED), [Rotterdam employee jobs by home/work region, 85481NED](https://opendata.cbs.nl/ODataApi/OData/85481NED).

### Historical-year availability and comparisons

CBS field suffixes and some variable names change between annual tables. The parser matches semantic field names, with reviewed aliases for the 2022 attainment categories. It does not reuse field positions. KWB 2022 lacks the absolute school-enrolment and employed-person counts used here: these stay null and yield no school/work assignments, with explicit source-status fields and warnings. A participation percentage is not silently substituted for a person count. Withdrawn or suppressed attainment/income values also remain unknown. The exact normalized inputs used remain in the archive.

Rotterdam commuting uses December of 2022, 2023 or 2024 as selected; for a 2025 population the currently available December 2024 prior is explicitly retained and labelled. No 2024 demographic values fill historical data gaps. Translink/NS external reference files retain their own dates and do not become historical mobility observations when the population year changes.

The Rotterdam map and sampled home locations always use the bundled **2024** polygons. For other source years, matching CBS codes provide a spatial reference only; changed boundaries are not reconstructed, and unmatched codes have no coordinates. Sewer associations inherit this limitation. Source-year changes create independent populations; person IDs do not track the same individual over time.

## 2. Generation algorithm

### Counts, age and sex

Requested records are allocated to selected source areas in proportion to population. Largest-remainder rounding preserves the exact requested total. The same reconciliation allocates five broad age bands (0–14, 15–24, 25–44, 45–64, 65+) inside each area. Municipal five-year age counts split those bands further; integer ages are drawn uniformly within the fine group. Ages 95+ are bounded at 104.

Source male counts are scaled to the generated population and rounded; remaining records receive the source female category. Labels are shuffled independently of age. Missing sex totals produce `?`. The resulting age–sex association is assumed, not a fitted joint distribution. Exact broad age quotas are checked in the export.

### Households and families

Age-specific municipal household-position shares guide role assignment. Estimated institutional residents are grouped into synthetic groups of at most 20, separated into under-18, 18–64 and 65+. Private-family construction imposes:

- Parent–child age difference of 18–50 years.
- Partner age difference at most 12 years.
- Sibling age difference at most 12 years.
- Adults for single-person and partner households; adult children may remain at home.

The engine first attempts compatible family placements for children, including existing households; unresolved minors remain explicitly flagged. Remaining adults form singles and pairs. Constraints are modelling choices: they exclude some real family forms. No claim is made about biological parenthood, kinship, custody or complete multigenerational structure.

**Household totals are not all fitted.** The total-household margin is a validation target. The households-with-children margin influences a family-size heuristic; the single-person target is used when enough eligible adults remain. The households-without-children field is loaded but not used to fit an additional quota. Plausible age constraints take precedence over matching household counts. Inspect each area's target/actual residuals.

### School, work and optional attributes

Resident enrollment totals are scaled and capped by eligible candidates. Primary ages 4–11 and secondary ages 12–17 form single-age groups of up to 25 pupils. MBO/HBO/WO are combined for ages 16–29, using five-year cohorts. Institutional residents are excluded from school assignment. Missing source totals never invent enrollment.

Employment totals are allocated among eligible noninstitutional residents aged 15–74, with heuristic age and student weights. Working students have two weekdays; other workers have three days with probability 35%, otherwise five. No actual employer, profession, industry, shift or work-from-home status is observed.

Existing employed nonstudent adults aged 25–66 provide assumed staff links: one per school group and one per five institution residents where candidates exist. Other workers form teams of up to 16. Within Rotterdam, destination weights are proportional to `sqrt(destination population) × exp(-distance / commuteKm)`; the external-work share comes from an aggregate employee-job table, not individual commuting trips. External workers are not accompanied by a generated external population.

**National batches are independent.** Work and school groups remain inside their municipality; no cross-municipality commuters, households or contacts are generated. The Rotterdam external-work prior is not applied to the rest of the country. Nationwide contacts therefore must not be interpreted as a calibrated national epidemic network.

Optional events select noninstitutional people aged 12+ with a user-set participation probability, then form persistent Saturday groups of up to 40. Optional education, income and cars use available aggregate margins with eligibility restrictions and explicit heuristic associations. Cars are household totals repeated on members: deduplicate households before summing them. Missing values and disabled features must remain distinct in analysis.

## 3. Activities and transport evidence

Optional `activities.csv` files contain a seven-day illustrative agenda: school 08:30–15:00; ordinary work 09:00–17:00; work after school 16:30–20:00; Saturday events 14:00–17:00; 30 minutes per travel leg. Remaining time is home/unassigned. Attendance follows each generated cluster’s days and each worker’s workdays. This standalone application does not simulate disease transmission. Shopping, sport, visits, transport modes and real routes are not inferred.

The optional Translink file is an **external aggregate reference**, not a person-level travel source or an input that changes generated citizens. It supplies nationwide check-ins by weekday/hour. Values in the published CSV are thousands of check-ins from OV-chipkaart/OVpay, not unique passengers. Full-year 2025 profiles and a separate partial-2026 profile are preserved with dates, attribution and source hash. The bundled source ends 3 August 2026; it is not live surveillance. Complete 24-hour days are averaged, with spring clock-change dates excluded. No station, origin/destination or neighbourhood field exists in this source. [Translink open data](https://translink.nl/open-data/).

The NS connector requires a developer subscription key stored outside the browser. It can supply a dated station context file and later support timetable/journey queries. Station positions or planned journeys do not establish observed passenger counts or individual routes. No NS data is claimed until an authenticated import succeeds. [NS API starter guide](https://apiportal.ns.nl/startersguide).

ODiN is a potential next calibration source, not currently connected. A coherent diary/route model requires permitted data access, survey weights, geographic sample support and validation. GenSynthPop-style population synthesis and agent-based mobility models are complementary stages.

## 4. Rotterdam geography and sewage

Household coordinates are reproducible random points inside bundled CBS/PDOK 2024 buurt polygons. They are shared by household members. Sampling is uniform across polygon area, without buildings or land-use weights; coordinates can fall on nonresidential land. These are fictitious locations, not addresses or residence observations. The map displays a bounded sample, whereas exported counts include everyone.

A spatial join associates each synthetic home with the RIVM public sewage catchment map published 22 December 2022. Exactly one intersection yields a `linked` status; missing home geometry, no intersection and overlaps remain separate unresolved statuses. This is an estimated geographic association, not a confirmed sewer connection or measured wastewater signal. Current catchment boundaries require verification with water authorities. National/provincial exports have no sewer assignment outside this Rotterdam workflow. [RIVM source page](https://www.rivm.nl/rioolwateronderzoek/covid-19).

## 5. Reproducibility and scale

The 32-bit seeded PRNG now wraps its state after every increment. This fixes precision loss in very long prior runs; model version 2.0 records the change. National batch seeds are derived deterministically from the user seed and municipal code. Prefixes make person and cluster IDs unique across municipalities, and the manifest records every batch seed.

Same source inputs, model version, selected areas, features, count and seed reproduce the records. Retrieval/export timestamps can differ. IDs are local to a generated run and are not stable identities across changes to inputs or selections.

ZIP output is streamed by municipality, with UTF-8 CSV tables and JSON metadata. No entire national person array is assembled. Browser samples can be downloaded normally; larger runs require a desktop browser supporting direct file writing or the command-line exporter. Full-week activities produce many more rows and are optional. Exports stop with an explicit error if a ZIP would exceed the classic 4 GB archive or uncompressed-entry limit; use province exports in that case. Cancelled/error outputs must not be used: only an archive with the final manifest represents a completed run.

Command-line examples from the project directory:

```sh
npm run export:research -- --scope national --year 2022 --count 100000 --out output/netherlands-sample.zip
npm run export:research -- --scope national --full --out output/netherlands-full.zip
npm run export:research -- --scope province --province PV28 --full --out output/zuid-holland.zip
npm run export:research -- --scope rotterdam --count 5000 --activities --out output/rotterdam.zip
```

`--year 2022` (or 2023/2025) retrieves that year from CBS. `--live` refreshes CBS inputs for any selected year; the default 2024 uses the bundled dated snapshot. This standalone application generates downloads on demand; pre-generated datasets are not included in the repository. A national 1:1 run requires substantially more processing time and disk space than a sample, although working memory is bounded by the largest municipality. Independent municipal batches preserve export identities, not cross-boundary networks.

## 6. Quality and appropriate interpretation

Archives contain target/actual broad-age, households, singles, employment and school counts, unresolved minors, source coverage, warnings and generation options. Conservation, family-age constraints, deterministic generation, export joins and schedule consistency are tested. These checks demonstrate software consistency; **fitting input margins is not independent validation**.

Recommended researcher review: compare household size/type and age combinations with held-out statistics; assess small-area residuals; examine missing-data patterns; repeat several seeds; compare work, school and activity structure with independent evidence. Evaluate travel, contacts and any subsequent infection model separately. Demographic records alone are not evidence for outbreak risk, and samples must not be scaled as though their network topology were unchanged.
