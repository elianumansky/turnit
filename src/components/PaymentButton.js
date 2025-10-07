import React from "react";

export default function PaymentButton({ turno }) {
  const IS_PROD = false; // cambiar a true cuando pases a producción
  const BACKEND_URL = "http://localhost:3001/create-pref";

  const handlePago = async () => {
    try {
      // Llamada a nuestro servidor para generar pref_id dinámico
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `Turno en agenDate`,
          precio: turno.precio,
          emailCliente: turno.email || undefined,
        }),
      });

      const data = await res.json();
      console.log("Respuesta del backend:", data);

      if (!data.prefId) {
        throw new Error("No se recibió prefId del servidor");
      }

      // Abrimos Checkout Pro de Mercado Pago
      const checkoutLink = `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${data.prefId}`;
      window.open(checkoutLink, "_blank");
    } catch (error) {
      console.error("Error al crear la preferencia:", error);
      alert("No se pudo generar el pago");
    }
  };

  return (
    <button
      onClick={handlePago}
      style={{
        padding: "10px 20px",
        backgroundColor: "#3483FA",
        color: "white",
        border: "none",
        borderRadius: "5px",
        cursor: "pointer",
      }}
    >
      Pagar ${turno.precio}
    </button>
  );
}
