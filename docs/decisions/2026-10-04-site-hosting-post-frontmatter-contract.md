# Site Hosting post frontmatter contract

- Status: Accepted contract for Amade experimental Site Hosting templates; BlogGenius implementation is a follow-up
- Date: 2026-10-04

## Ownership and versions

Amade owns the canonical post frontmatter contract in each Template Family manifest at `amade/families/<family-id>/family.json`. BlogGenius consumes the selected Site's pinned family contract and does not define a competing post schema. Astro templates validate and render the contract.

The contract is `content_contract_version: 0.4.0`. Current Amade templates declare package compatibility `bloggenius-site-hosting-template@0.4.0` and package version `0.4.0`. The Amade package/spec shape remains `spec_version: 0.1.0`; these version axes are independent. The minimum BlogGenius version remains `0.6.0`.

Each post lives at `site-data/data/posts/<slug>/index.md`, with related images in the entry's `images/` directory and relative Markdown references such as `./images/photo.webp`.

## Frontmatter fields

| Field | Rule | Meaning |
|---|---|---|
| `kind` | Required, exactly `post` | Content type discriminator. |
| `title` | Required, non-empty string | Post title. |
| `description` | Required, non-empty string | Summary for public listings. |
| `date` | Optional, valid date-only `YYYY-MM-DD` | Date associated with writing/content, not a deployment timestamp. |
| `editorial_status` | Optional enum: `draft`, `complete`; missing means `draft` | Writing completeness only. It never controls inclusion or visibility. |
| `publication` | Optional enum: `none`, `private`, `public`; missing means `none` | Deployment and listing intent, independent of editorial status. |

Every pairing is valid. `draft + public` is allowed because the author may intentionally publish an unfinished draft; BlogGenius should warn before proceeding but must not reject or rewrite the choice. Editorial state alone does not change build behavior.

## Publication behavior

| `publication` | Local Site data | Astro build / Worker | Public listing | Direct URL |
|---|---|---|---|---|
| `none` | Retained | No page output; absent from deployment | Hidden | No generated page |
| `private` | Retained | Detail page built and deployed | Hidden | Accessible if URL is known |
| `public` | Retained | Detail page built and deployed | Visible | Accessible |

`private` means unlisted, not access-controlled. Static hosting cannot protect content from visitors who know its URL. Do not describe it as confidential or secure. Actual access control requires an authentication/runtime design beyond this contract.

Missing fields default to `editorial_status: draft` and `publication: none`. This makes an ordinary hand-authored Markdown file local-only unless its author explicitly selects a deployment behavior.

## BlogGenius Site Hosting actions

- **Temporary save:** write `editorial_status: complete` and `publication: none` into local Site data only. The entry remains at `workspace/site-hosting/sites/<site>/...`, but is excluded from generated Astro output and Worker deployment.
- **Post now:** write `editorial_status: complete` and `publication: public`, fill `date` only if absent, then build and deploy the complete Site.
- **Scheduled post:** unsupported for Site Hosting for now; disable that option.

A successful deployment does not rewrite frontmatter. These values express writing state and desired output, not delivery outcome. BlogGenius records operation result, deployment time, and batch membership in its publishing record; there is no `published` frontmatter value. `private` and `public` posts remain in subsequent clean builds. Changing a post to `none` and deploying again removes its route from Worker output.

Editing or re-publishing an already posted item through BlogGenius remains outside the initial consumer scope. Manual editing of Site content remains possible. The existing BlogGenius editor starts with Markdown `# Title`; its publishing adapter should move that heading into the `title` field and remove the duplicate leading H1 from the body. Tags and categories remain user-owned and outside the shared contract. Page/work/service visibility fields remain unchanged.

## Rollout and compatibility

Amade `dev` family manifests and all four same-family templates are the contract source and are updated first. BlogGenius must implement the `0.4.0` integration contract before offering these packages. Until then, its exact compatibility check should skip them; it must not reinterpret the fields under the earlier `status`, `publish` boolean, or legacy `pubDate`/`is_public` rules. Existing 1.x packages and already-materialized Sites are not implicitly migrated.

## References

- Amade canonical family schema: `amade/spec/site-hosting-family-v0.1.schema.json`
- Amade family/template guide: `amade/spec/README.md`
- [Amade Template Family 0.1 design record](../plans/active/2026-10-03-amade-template-spec-v0.1-design.md)
