from models import SessionLocal, PastIncident
from embeddings import generate_embedding


def retrieve_similar_incidents(log_message: str, top_k: int = 3) -> list[dict]:
    """Nearest past incidents by cosine distance (0 = identical), closest first."""
    query_embedding = generate_embedding(log_message)

    session = SessionLocal()
    try:
        rows = (
            session.query(
                PastIncident,
                PastIncident.embedding.cosine_distance(query_embedding).label("distance")
            )
            .order_by("distance")
            .limit(top_k)
            .all()
        )
        return [
            {
                "id": incident.id,
                "log_message": incident.log_message,
                "severity": incident.severity,
                "category": incident.category,
                "resolution": incident.resolution,
                "distance": float(distance),
            }
            for incident, distance in rows
        ]
    finally:
        session.close()


if __name__ == "__main__":
    test_alert = "Timeout connecting to Postgres primary node, retrying after 30s"
    results = retrieve_similar_incidents(test_alert)

    print(f"Query: {test_alert}\n")
    for i, r in enumerate(results, 1):
        print(f"{i}. [{r['severity']} | {r['category']} | d={r['distance']:.3f}] {r['log_message']}")
        print(f"   Resolution: {r['resolution']}\n")
