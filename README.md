# Turnos Firebase App

## Instalación

1. Clonar repo o copiar archivos
2. Ejecutar npm install para instalar dependencias
3. Crear proyecto en Firebase y copiar configuración en src/firebase.js
4. Crear colecciones en Firestore:
   - places: documentos con campos { name: string }
   - turnos: documentos con { userId, placeId, placeName, date, time }
5. Configurar reglas de seguridad en Firestore con firestore.rules
6. Ejecutar npm start para levantar la app en desarrollo

## Uso

- Registro y login con email y contraseña.
- Usuario normal puede reservar turnos, ver y cancelar sus turnos.
- Usuario admin (email admin@tudominio.com) puede ver todos los turnos y filtrar.
- Interfaz con Material-UI para diseño moderno y responsive.

## Despliegue

Se puede desplegar con Firebase Hosting u otro servicio que soporte React.

## Consideraciones

- Cambiar email admin en PrivateRoute.js y reglas Firestore según sea necesario.
- Añadir validaciones adicionales y mejoras UI para producción.