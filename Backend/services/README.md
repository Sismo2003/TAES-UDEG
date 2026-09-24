# Services

Lógica cross-cutting que no cabe en un controller: integraciones con terceros,
jobs recurrentes, lógica de negocio compleja. Los controllers delegan aquí.

Cuándo usar service vs. model directo:
- **Llamada simple a Prisma** → el controller va directo al modelo.
- **Múltiples modelos + lógica de negocio** → service.
- **Integración externa** (API de tercero, envío de emails, etc.) → service.
