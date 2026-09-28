# Rotterdam validation handover — read this first

This package lets you run the generator yourself and compare its output with a supplied reference. It uses the same population construction as the current Rotterdam application. The new flat export only joins existing values; it does not generate a second population.

## 1. Run it

Install Node.js 22.12 or later (Node 24 recommended). Unzip the **generator package** into a folder. From that folder run:

```sh
node --max-old-space-size=8192 generator.mjs --out output/rotterdam-2024-full.zip
node verify.mjs output/rotterdam-2024-full.zip
```

No npm installation, API key, CBS login or internet access is needed to run this supplied generator. Its JavaScript dependencies, frozen source inputs and geographic data are embedded. Allow several minutes, roughly 8 GB of available memory and at least 15 GB of free disk space if extracting the files and retaining a second run. The script refuses to overwrite an existing output. To rerun, choose a new filename.

The supplied reference archive is a comparison target, not an input to generation. Run `--help` for options. `--count 5000` makes a small smoke-test dataset; its hash will deliberately differ from the full reference.

The package also includes readable generator source, the build script, pinned dependency manifests and upstream licence notices. The source package README explains how to rebuild `generator.mjs`. `reference-sha256.json` and `verify.mjs` identify the exact complete reference archive. `validation-report.json` contains row counts, per-file SHA-256 hashes and structural checks.

## 2. What “full Rotterdam” means

The release uses the **included CBS 2024 snapshot**, seed **20260925**, all seven optional features (households, schools, work, events, education, income and cars), commuting-distance parameter 7 km and event-participation parameter 0.35. It creates one synthetic person for every resident in the usable Rotterdam neighbourhood margins, rather than a weighted sample. It does not claim to recreate the actual individuals who lived there.

Some small neighbourhoods have suppressed or unusable age counts. They are excluded rather than fabricated. The generated `manifest.json` lists their codes, names and population totals. Read the accompanying validation report for the exact covered and excluded counts. Neighbourhood totals are rounded CBS publications and may differ from a municipal headline total. This is full **usable neighbourhood coverage**, not an assertion that every Rotterdam resident is represented.

The input snapshot is in `source-inputs.json`. CBS table IDs, URLs, retrieval date and each source's reference period are retained there and in `methods.md`. Population year is 2024; map geometry is 2024; approximate sewage boundaries are 2022. Education and income may have different underlying measurement dates. Translink profiles are an additional aggregate reference, not a rule for individual trips. No NS passenger data or ODiN diaries are used.

## 3. Which files to open

| File inside the output ZIP | One row represents | How to use it |
|---|---|---|
| `ROT/people-flat.csv` | One synthetic citizen | Start here for analysis without joins. Includes every `people.csv` column plus joined household, school, work, event, geography and activity information. |
| `ROT/people.csv` | One synthetic citizen | Original compact person table, with stable IDs referring to the other tables. |
| `ROT/clusters.csv` | One household, institutional group, school class, work team or event | Join its `cluster_id` to the person's relevant group ID. These are model groups, not identifiable real establishments. |
| `ROT/memberships.csv` | One person-to-group membership | Join on `person_id` and `cluster_id`. Includes staff assigned to school/institution groups. |
| `ROT/activities.csv` | One activity episode for a person on one weekday | Join on `person_id`; minutes run from 0 to 1440 and Monday is 0. |
| `ROT/quality.json` | Area-level checks and warnings | Compare input targets with actual generated totals; inspect unresolved cases and residuals. |
| `manifest.json` | The run specification and coverage | Contains all options, excluded areas, versions and summary. |

CSV uses UTF-8 with a byte-order mark, comma separators, quoted fields and CRLF line endings. Empty cells mean unavailable/not applicable unless explained otherwise. `false` for work or school must be read together with its assignment-status column: disabled or missing input is not observed non-employment/non-enrolment. The accompanying data dictionary covers the original person columns.

The flat table keeps **exactly one row per person**. Multiple parents, memberships and episodes cannot be represented as a single scalar without losing information, so they use the explicitly documented JSON/list cells below. They do not create extra rows. Python/R are preferable for the largest tables; spreadsheet applications may have row and cell-size limits. IDs are text, not arithmetic values.

## 4. Additional flat columns

- **Geography:** `home_area_name`, `wijk_code`, `wijk_name`, `municipality_code`, `municipality_name`. Wijk code is derived from the CBS buurt code; the name is from the 2024 geometry. Missing historic geometry stays missing.
- **Provenance:** `source_year`, `source_table`, `source_retrieved_at`, `model_version`, `seed`, `synthetic` (always true). These are repeated for convenient row-level analysis.
- **Home point:** `home_longitude`, `home_latitude` are WGS84 degrees; `location_basis` and `map_geometry_year` explain them. The point is randomly placed within a neighbourhood, reproducibly per household. It is not an address, dwelling, building or GPS observation. It can fall on non-residential land. Missing locations remain blank.
- **Sewage:** `sewage_name` and `sewage_boundary_year` supplement the original ID/status. A spatial intersection of a fictional point with a historical boundary estimates the catchment; it is not a confirmed connection.
- **Groups:** each of `household_`, `school_`, `work_`, `event_` has `kind`, `area`, `label`, `cluster_days_monday0`, `member_count`. IDs already appear in the original person columns. `cluster_days_monday0` uses `|`-separated weekday numbers. The existing `work_days_monday0` is the individual worker’s schedule; the group’s open days are separate. `work_kind` can be `school` or `institution` for staff. Outside-Rotterdam workplaces have area `outside`, not an invented local address.
- **Household residents:** `household_resident_count` and `household_resident_ids` count only people whose home points to that group. This differs from group `member_count` for institutions whose contact members also include non-resident staff. Resident IDs use `|` separators.
- **Parents:** `parents_json` is an array of objects with `person_id`, `age`, `sex`, `household_role`. Empty array means no recorded parents, not proof that a person has none in real life.
- **All memberships:** `memberships_json` is an array of `{cluster_id, kind, area, label, days_monday0, member_ids}`. Days and member IDs are arrays. This retains the complete linked cluster/membership content for this person, including staff memberships. It repeats group information across people intentionally; do not sum these repeated rosters as unique groups.
- **Activity:** `activity_status` is the model's readable person status. `activities_included` says whether diaries were exported. Seven columns named `monday_activities_json` through `sunday_activities_json` contain arrays of episodes. Each episode is `[start_minute, end_minute, kind, label, destination_area, cluster_id]`, in chronological order. An empty cluster ID is used for travel. The weekday is supplied by the column name. Every episode has basis `assumed_schedule`, matching the linked table. A blank diary cell means activities were disabled, not an empty day.

Example: `[540,1020,"work","Werkteam …","BU05990110","ROT:C123"]` means an assumed work episode from 09:00 to 17:00 in cluster C123. Times are not observed movements. Parse JSON cells with `json.loads` (Python) or `jsonlite::fromJSON` (R).

## 5. How the people are made, in plain language

1. **Count people by neighbourhood.** Allocate the requested total to neighbourhoods using published population totals and largest-remainder rounding. For the full release this equals each included neighbourhood total.
2. **Assign ages and sex.** Match the five broad age margins in each neighbourhood. Split them using Rotterdam five-year age priors, then draw a whole-year age within each band. Sex counts use published neighbourhood totals where available. These are aggregate constraints, not individual records or a fully known joint distribution.
3. **Build households.** Use age-specific household-position priors and neighbourhood household counts. Parent–child gaps must be 18–50 years, partners differ by no more than 12 years and grouped siblings by no more than 12 years. Families are limited to four children in this model. These are modelling rules, not universal facts about families. Unplaceable minors are marked unresolved rather than silently given impossible parents. Institutional residents are assigned to assumed groups of up to 20. Household-type totals can remain imperfect; inspect the quality file.
4. **Assign school and work.** Use resident enrolment and employment targets where available, constrained by eligible ages. Classes are grouped by age (up to 25 pupils); study groups use broader cohorts. Existing employed residents provide assumed school/institution staff. Other workers form teams of up to 16, with destination probabilities based on distance and population plus an aggregate outside-Rotterdam share. Counts of institutions or firms are not treated as known workplaces. Students can also work. Missing targets remain missing.
5. **Add optional attributes.** Education categories follow area margins with minimum attainment ages. Household income bands follow published shares; their association with worker/education counts is assumed. Car totals follow the area average, with an assumed household distribution. Income and cars are shared by household members, not independent personal amounts. Saturday events are assumed groups of up to 40 among selected eligible residents.
6. **Add a home point and catchment estimate.** Draw a shared fictional location within the neighbourhood boundary and intersect it with the sewage polygons. Nothing identifies a real household.
7. **Write an illustrative week.** Use generated attendance days, fixed school/work/event times and 30-minute travel legs. All remaining time is home/unassigned. Shopping, sport, visits, actual routes and travel modes are not reconstructed. Every day covers 24 hours without overlapping episodes.
8. **Export the same population twice in different layouts.** The linked files are the normalized representation. The flat file joins their values and preserves multi-valued fields in list cells. It does not run the random generator again or invent additional facts.

## 6. Reproducibility versus scientific validation

The generator uses a fixed seed, frozen inputs, deterministic file ordering and a fixed reference metadata timestamp (`2026-09-28T00:00:00.000Z`). That timestamp labels the release; it is not the time your computer executes it. ZIP entry timestamps are fixed. `verify.mjs` compares the entire ZIP byte for byte, including all CSVs, documentation and metadata. A different seed, count, source revision or code version should produce a different result.

Matching hashes establishes reproducibility. Row counts, foreign keys, family-age rules and flat/linked agreement establish internal consistency. Neither proves that synthetic lives are realistic. For external validation, compare household size and age combinations, school/work participation, commuting and activity patterns against held-out evidence, and examine sensitivity to the model assumptions and seed. The source margins used to construct the population cannot serve as independent validation.
