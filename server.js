// server.js
const express = require('express');   // Importar express
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const cors = require('cors');

const app = express(); // ← Esto define 'app'

app.use(cors({
  origin: 'http://localhost:3000'
}));
app.use(express.json());

// ⚠️ Tu Sandbox Access Token de prueba
const SANDBOX_TOKEN = 'APP_USR-3821705891737754-100613-169bf1ef4f7e64128a07e3edcdd42f2f-2906216008';

// Ruta para crear preferencia
app.post('/create-pref', async (req, res) => {
  try {
    const { titulo, precio } = req.body;

    const preference = {
      items: [{ title: titulo, unit_price: precio, quantity: 1 }],
      back_urls: {
        success: 'https://www.mercadopago.com/success', // URL válida
        failure: 'https://www.mercadopago.com/failure',
        pending: 'https://www.mercadopago.com/pending'
      },
      auto_return: 'approved'
    };

    const response = await fetch(
      `https://api.mercadopago.com/checkout/preferences?access_token=${SANDBOX_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preference)
      }
    );

    const data = await response.json();
    console.log('Respuesta de Mercado Pago:', data);

    if (!data.id) {
      return res.status(400).json({ error: 'No se pudo crear la preferencia', detalle: data });
    }

    res.json({ prefId: data.id });

  } catch (error) {
    console.error('Error creando preferencia:', error);
    res.status(500).json({ error: 'No se pudo crear la preferencia', detalle: error });
  }
});

// Iniciar servidor
app.listen(3001, () => console.log('Servidor Mercado Pago sandbox en http://localhost:3001'));
