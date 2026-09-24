# components/forms

Formularios autocontenidos. Cada formulario es una isla React (`client:load`)
que internamente usa `react-hook-form` + `Yup` si tiene validación real, o
`useState` si es muy simple (ver skill `ui` §6).
