function StatusTag({ label, tone }) {
  return <span className={`tag tag-${tone}`}>{label}</span>;
}

export default StatusTag;