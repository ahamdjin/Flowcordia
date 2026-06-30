# Email and alerts map

The repo already has email support.

There are two email clients:

1. general email client
2. alert email client

General email is used for product email such as login and invite flows.

Alert email is used for run and deployment notification flows.

Supported transport types:

- resend
- smtp
- aws ses

Important lesson:

Email setup should first wrap the existing email service. Do not create a second mailer system.

Flowcordia future work:

1. add a settings page that explains current email configuration
2. add send test email action
3. then add database saved settings only if needed

For self hosted users, environment based email setup is already the base system.
