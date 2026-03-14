# Domain Entities

## Entity Template
### Entity Name
- Purpose:
- Key attributes:
- Relationships:
- Lifecycle:
- Validation rules:

Add one section per important domain entity.

## Initial Entities
### Site
- Purpose: represent one local campus or location within the church
- Key attributes: name, address, display label, identifier, accent color (used for site-specific branding on the public hub), and other operator-defined info fields
- Relationships: linked to events, announcements, and curated links
- Lifecycle: created and managed entirely through the admin tool; must NOT be hardcoded in the codebase
- Validation rules: identifier should be stable and unique
- Notes: the church currently has 4 sites and is growing; the data model must support dynamic site creation at any time

### Content Item
- Purpose: represent a unit of information shown in the hub
- Key attributes: type, site scope, sort order, type-specific fields (see content-model.md)
- Relationships: may belong to one or more sites, or be church-wide; may belong to a Group
- Lifecycle: `draft` → `published` → `archived`. Expiry auto-transitions a published item to archived. Archived items are hidden from the default admin content list (accessible via filter) and not shown on the public hub.
- Validation rules: must have a valid content type; mandatory fields per type must be present

### Group
- Purpose: visually collect Cards and/or Posters into a single display unit
- Key attributes: name/label, site scope, sort order
- Relationships: contains one or more Cards or Posters; belongs to root level
- Lifecycle: created, maintained, deleted by admins
- Validation rules: may only contain Cards and Posters; no nested groups allowed
