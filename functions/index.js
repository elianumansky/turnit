const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// Configura tu email (puede ser Gmail, o SMTP de tu proveedor)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "TU_EMAIL@gmail.com",
    pass: "TU_APP_PASSWORD", // usa app password si es Gmail
  },
});

// Función que se ejecuta cada hora (cron)
exports.sendTurnReminders = functions.pubsub.schedule("every 60 minutes").onRun(async (context) => {
  const db = admin.firestore();
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const dateStr = in24h.toISOString().slice(0, 10); // YYYY-MM-DD

  // Buscar turnos para dentro de 24h
  const turnSnap = await db.collection("turnos")
    .where("date", "==", dateStr)
    .get();

  const promises = [];
  turnSnap.forEach(docSnap => {
    const turno = docSnap.data();
    const reservations = Array.isArray(turno.reservations) ? turno.reservations : [];
    reservations.forEach(r => {
      const email = r.email; // asumir que guardás email en la reserva
      if (!email) return; // saltar si no hay email
      const mailOptions = {
        from: "TU_EMAIL@gmail.com",
        to: email,
        subject: "Recordatorio de tu turno",
        text: `Hola ${r.name || "usuario"},\n\nTe recordamos que tu turno en ${turno.placeName} es mañana a las ${turno.time}.\n\nGracias!`
      };
      promises.push(transporter.sendMail(mailOptions));
    });
  });

  await Promise.all(promises);
  console.log(`Se enviaron ${promises.length} recordatorios.`);
  return null;
});
