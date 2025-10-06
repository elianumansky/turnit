import React from "react";

export default function PaymentButton({ turno }) {
  const handlePago = () => {
    // Preference ID de prueba
    const prefId = "787997534-6dad21a1-6145-4f0d-ac21-66bf7a5e7a58";

    // Construimos el enlace de Checkout Pro
    const checkoutLink = `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${prefId}`;

    // Abrir en nueva ventana
    window.open(checkoutLink, "_blank");
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
