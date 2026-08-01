# Future Studio UI additions

Do not implement missing Studio UI locally.

When a future capability such as a whole-workflow code editor is ready, integrate the supplied
Activepieces UI/component at the existing builder adapter boundary. Flowcordia may provide the
workflow data, permissions, persistence, testing, staging, and deployment callbacks behind that
component, but must not create a substitute visual experience in the meantime.
