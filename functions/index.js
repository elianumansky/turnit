const functions = require("firebase-functions");
const mercadopago = require("mercadopago");

// ⚠️ Reemplazá con tu token real de Mercado Pago
mercadopago.configure({
  access_token: "TU_ACCESS_TOKEN_AQUI",
});

exports.createPreference = functions.https.onCall(async (data, context) => {
  try {
    const preference = {
      items: [
        {
          title: data.titulo,
          unit_price: data.precio,
          quantity: 1,
        },
      ],
      back_urls: {
        success: "https://tusitio.com/success",
        failure: "https://tusitio.com/failure",
      },
      auto_return: "approved",
    };

    const result = await mercadopago.preferences.create(preference);
    return result.body.id;
  } catch (error) {
    console.error("Error al crear preferencia:", error);
    throw new functions.https.HttpsError(
      "internal",
      "No se pudo crear la preferencia"
    );
  }
});
