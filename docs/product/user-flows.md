# User Flows

## Core Flows
List the highest-priority flows first.

### Flow 1
- Trigger: a church member scans a QR code or opens a direct link
- Steps:
  - the app opens on mobile, pre-filtered to the site encoded in the link
  - the member sees a single scrollable page of content in the admin-defined order
  - groups are displayed with their title and their items visible beneath them
  - the member finds the information they need inline — no tab switching or sub-navigation required
- Success state: the member finds relevant information without additional help
- Failure or edge states:
  - the QR code leads to outdated or incomplete information
  - the member cannot tell which site the content belongs to

### Flow 2
- Trigger: a member wants to switch between site-specific and all-sites views
- Steps:
  - a subtle inline link is always available on the page
  - if currently on an all-sites view: link reads "view site..." — tapping opens a popup listing all available sites to choose from
  - if currently on a site-specific view: link reads "view all" — tapping switches directly to the all-sites view
  - the selected view updates the displayed content accordingly
- Success state: the member can move between local-site and church-wide content without the switcher dominating the UI
- Failure or edge states:
  - the switcher is so subtle the member cannot find it
  - the site list in the popup is empty or outdated
