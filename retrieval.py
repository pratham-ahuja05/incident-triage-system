from sqlalchemy import select
from models import SessionLocal, PastIncident
from embeddings import generate_embedding


def retrieve_similar_incidents(log_message: str, top_k: int = 3):
    query_embedding = generate_embedding(log_message)

    session = SessionLocal()
    try:
        results = (
            session.query(PastIncident)
            .order_by(PastIncident.embedding.cosine_distance(query_embedding))
            .limit(top_k)
            .all()
        )

        # Also compute the actual distance value for each, so we can show a confidence score later
        similar = []
        for incident in results:
            similar.append({
                "id": incident.id,
                "log_message": incident.log_message,
                "severity": incident.severity,
                "category": incident.category,
                "resolution": incident.resolution,
            })
        return similar
    finally:
        session.close()


if __name__ == "__main__":
    test_alert = "Timeout connecting to Postgres primary node, retrying after 30s"
    results = retrieve_similar_incidents(test_alert)

    print(f"Query: {test_alert}\n")
    for i, r in enumerate(results, 1):
        print(f"{i}. [{r['severity']} | {r['category']}] {r['log_message']}")
        print(f"   Resolution: {r['resolution']}\n")