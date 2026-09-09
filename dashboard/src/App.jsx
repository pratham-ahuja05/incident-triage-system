import { useState, useEffect } from "react";
import AlertCard from "./components/AlertCard";
import "./App.css";

function App() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlerts = () => {
    fetch("http://localhost:8080/api/alerts")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch alerts");
        return response.json();
      })
      .then((data) => {
        setAlerts(data.reverse()); // newest first
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000); // auto-refresh every 5s
    return () => clearInterval(interval); // cleanup when component unmounts
  }, []);

  if (loading) return <div className="status-message">Loading alerts...</div>;
  if (error) return <div className="status-message error">Error: {error}</div>;

  return (
    <div className="app">
      <h1>Incident Triage Dashboard</h1>
      <p className="subtitle">{alerts.length} alerts total</p>

      <div className="alert-grid">
        {alerts.length === 0 ? (
          <p>No alerts yet. Send one via the ingestion API.</p>
        ) : (
          alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
        )}
      </div>
    </div>
  );
}

export default App;