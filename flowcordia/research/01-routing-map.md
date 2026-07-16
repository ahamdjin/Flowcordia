# Routing map

The web app uses Remix file routes.

Important route concepts:

- parent route gives layout
- child route renders inside Outlet
- loader reads data for page
- action handles form submit
- path helpers live in pathBuilder

Organization settings route:

- parent settings route owns the settings chrome
- side menu is rendered by the parent
- child settings pages render inside the main body

Important lesson from the previous attempt:

Do not edit the settings side menu first.

Safer order:

1. add hidden route
2. visit direct URL manually
3. confirm loader and page render
4. then add navigation link

Suggested direct URL pattern:

- orgs slash orgSlug slash settings slash newPage
