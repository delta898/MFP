# Site Hosting Project and Site Storage

- Status: Accepted
- Date: 2026-10-03

## Decision

Store Site Hosting Projects and Sites in sibling directories under the feature workspace:

```text
workspace/site-hosting/
  projects/{project_id}/project.json
  sites/{site_id}/.bloggenius/site.json
```

The Site manifest's `project_id` is the authoritative Project/Site relationship. The filesystem path does not encode ownership.

## Rationale

- Site folders are standard Astro project roots that users may open and edit with other tools. Keeping them outside `projects/{project_id}` avoids making the filesystem imply containment or ownership.
- Project directories contain BlogGenius Project metadata, so `project.json` belongs directly in that directory.
- A Site root contains user/template Astro files. BlogGenius-owned metadata and generated screenshots stay grouped in `.bloggenius/`, separate from Astro source and public content.
- A shared `sites/` directory makes Site IDs globally unique within Site Hosting and allows Sites to be reassigned by changing their manifest relationship in a future feature without moving their source directory.

## Consequences

- Project Site counts and Site lists must filter the shared Site directory by manifest `project_id`.
- No compatibility scan or automatic migration is provided for the earlier `projects/{project_id}/sites/{site_id}` layout. Users start fresh after removing their previous local Project/Site data.
- The current UI/API may still scope Site operations by Project ID; that request boundary does not imply filesystem nesting.
