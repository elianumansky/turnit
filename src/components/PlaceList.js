import { useNavigate } from "react-router-dom";

export default function PlaceItem({ place }) {
  const navigate = useNavigate();

  return (
    <div>
      <div>{place.name}</div>
      <div>{place.address}</div>
      <button
        onClick={() =>
          navigate(`/publish-turn/${place.id}`, { state: { placeName: place.name } })
        }
      >
        Registrar turno
      </button>
    </div>
  );
}
