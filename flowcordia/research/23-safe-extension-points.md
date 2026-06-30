# Safe extension points

Fourth pass note.

Best early extension points for Flowcordia:

## Safe first

- docs under flowcordia research
- setup docs
- grouped env examples
- hidden read only routes
- server side status checks that reveal only present or missing
- direct test email action after service is understood

## Medium risk

- settings child route
- project integration setup page
- email test action
- GitHub App setup guide page
- object storage test action
- path builder additions

## High risk

- settings side menu
- GitHub event based deployment
- deployment lifecycle
- run engine
- supervisor
- queue system
- database schema changes
- Docker service renaming
- CLI behavior

## Recommended build order

1. docs only
2. hidden route
3. read only status page
4. small test action
5. menu link
6. guided setup wizard
7. deeper automation

## Approval checklist before code

Before touching code, write:

- exact files to change
- files not to touch
- expected behavior
- test command
- rollback plan

Flowcordia rule:

Visible navigation should be one of the last steps, not the first.