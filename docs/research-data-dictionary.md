# Research dataset dictionary — version 2.1

All records are synthetic. CSV is UTF-8 with BOM, comma-delimited and quoted; empty cells are absent/unknown, not numerical zero. Boolean values are `true`/`false`. Arrays use `|` inside a quoted cell. Weekdays are 0=Monday … 6=Sunday. IDs are strings and should be read as strings.

## Archive layout

- `manifest.json`: model/method version, scope, source year, map geometry year (2024 for Rotterdam), sewage boundary year (2022), original options, batch seeds, inclusion choices, exclusions and completion summary. `zeroAllocatedAreas` lists selected areas receiving zero records because of sample rounding; these are not zero-population areas.
- `source-inputs.json`: exact source bundle used, including numerical inputs, municipal priors, URLs and retrieval date.
- `methods.md`, `data-dictionary.md`: this documentation.
- `<batch>/people.csv`: synthetic people. `ROT` is a joint Rotterdam buurt run; `GM####` is an independent municipal batch.
- `<batch>/clusters.csv`: households, institutions, schools, workplaces and optional events.
- `<batch>/memberships.csv`: person-to-cluster relation; a person may have several memberships.
- `<batch>/activities.csv`: optional assumed seven-day schedule, not measured movements.
- `<batch>/quality.json`: area-level target/actual margins, unresolved cases, warnings and geographic provenance.
- `external/translink-hourly-profiles.json`: optional aggregate reference with provenance; does not alter the population.
- `external/ns-stations.json`: optional imported station context; no passenger or personal data.

## people.csv

| Column | Meaning |
|---|---|
| person_id | Unique string within archive, e.g. `GM0599:P123`. |
| local_id | Zero-based person index inside the batch. |
| home_area | CBS buurt code for Rotterdam or municipality code for national/province runs. |
| province_code | Official CBS province code. Rotterdam is PV28 (Zuid-Holland). |
| age | Synthetic integer age, 0–104. |
| sex | Source categories M/V, or ? if unknown; independently assigned from age. |
| household_id | Cluster reference, or empty if not assigned. May identify an institution. |
| household_role | child, parent, partner, single, co_resident, institutional, unresolved. Unresolved also occurs when households are disabled. |
| parent_ids | `|`-separated synthetic parent IDs; empty means no assigned parent relationship. |
| student | School-assignment flag, not an observation. |
| school_assignment_status | disabled, partial_source, assigned, not_assigned. Partial source means at least one enrollment margin is unavailable; inspect input fields. |
| employed | Employment-assignment flag, not observed labour-force participation. |
| employment_assignment_status | disabled, missing_source, assigned, not_assigned. False with disabled/missing_source is NOT unemployment. |
| school_id, work_id, event_id | Cluster IDs or empty. Work can refer to a school/institution when assigned as staff. |
| work_days_monday0 | `|`-separated weekday numbers. |
| education | Optional synthetic attainment category; unknown/outside-target values are explicit strings. |
| household_income_band | Optional low/middle/high national income-band classification. Associations are assumed. |
| household_cars | Household total repeated for each member. Deduplicate households before summing. |
| sewage_id | RIVM catchment code, only when synthetic location yields one unique match. |
| sewage_status | linked, no-location, outside-boundaries, overlap; outside_geographic_coverage for national runs. |

## Relational tables

`clusters.csv`: cluster_id, kind, area, label, days_monday0, member_count. Kind is household/school/work/event/institution. A cluster is synthetic; names do not identify real facilities. `memberships.csv` joins cluster_id to person_id. Household membership can be recovered by filtering household/institution clusters. Parents are person-to-person references in people.csv; no real identity linkage exists.

`activities.csv`: person_id, weekday_monday0, start_minute, end_minute, kind, label, destination_area, cluster_id, basis. Times are minutes since midnight; end=1440 is midnight. Travel rows do not specify a real route or transport mode. Home/unassigned time does not prove someone stayed home. `basis=assumed_schedule` applies to every episode.

`quality.json` checks: id, n, ageTarget/ageActual (five broad age groups), householdTarget/Actual, singleTarget/Actual, workerTarget/Actual, schoolTarget/Actual (primary, secondary, combined MBO/higher), unresolvedChildren. Null target means unavailable or feature disabled. No export weighting is provided for epidemic inference.

## Reading in Python

```python
from zipfile import ZipFile
import json
import pandas as pd

with ZipFile('netherlands-sample.zip') as archive:
    manifest = json.loads(archive.read('manifest.json'))
    people = pd.concat([
        pd.read_csv(archive.open(name), dtype={'person_id': str, 'home_area': str,
                    'household_id': str, 'province_code': str, 'sewage_id': str})
        for name in archive.namelist() if name.endswith('/people.csv')
    ], ignore_index=True)
    assert len(people) == manifest['summary']['people']
```

For a full-country dataset, process each municipal CSV or use a chunked reader rather than concatenating everything in memory. Keep the manifest with derived analyses and report the seed, model version, source year and sample size.
