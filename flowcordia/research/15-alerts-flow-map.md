# Alerts flow map

Third pass note.

Alert delivery already exists.

Main alert concepts:

- project alert
- alert channel
- alert status
- alert type
- email delivery
- slack delivery
- webhook delivery

Main alert delivery service:

- DeliverAlertService

Error group alerts have a separate delivery service.

Supported alert channels:

- email
- slack
- webhook

Supported alert types include:

- task run failure
- deployment failure
- deployment success
- error group alerts

Email alerts use the existing alert email client, not the general email client.

Flowcordia rule:

Do not build a second notification system.

For email setup, wrap the existing alert email system first.

Safe future work:

- show whether alert email env is configured
- send a test alert email
- add guidance for alert channels
